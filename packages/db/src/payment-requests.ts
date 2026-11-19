import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { groupTotalsByGroup, lockGroup, paidCentsOfGroup, paymentStateOf, type PaymentState } from './bookings';
import { withActor, withBeach, type Database, type Transaction } from './client';
import { DomainError } from './inventory';
import type { Actor } from './manage';
import { auditEvent, beach, beachZone, booking, bookingGroup, inventoryDay, notification, payment, paymentRequest, spot } from './schema';

// Payment requests (deposit or balance, spec §4.3, D31 — at GROUP level since
// D38: one request asks for part of the residual of the whole period). The
// public token is `{id}.{signature}` — signed with OMBRE_SIGNING_SECRET like
// the passes, never stored, verified in constant time. A pending request past
// its expiry becomes `expired` lazily, at the first read that meets it: no
// worker job needed.

function sign(secret: string, id: string): string {
  return createHmac('sha256', secret).update(`payment_request:${id}`).digest('base64url');
}

export const payRequestToken = (secret: string, requestId: string): string => `${requestId}.${sign(secret, requestId).slice(0, 32)}`;

function sameText(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The one neutral refusal of the public /paga page: it never says why. */
const unavailable = () => new DomainError('request_unavailable', 'This payment link is not available');

/** A pending request past its expiry flips to `expired` before anything reads it. */
async function expireLazily(tx: Transaction, requestId: string): Promise<void> {
  await tx
    .update(paymentRequest)
    .set({ status: 'expired', closedAt: sql`now()` })
    .where(and(eq(paymentRequest.id, requestId), eq(paymentRequest.status, 'pending'), sql`${paymentRequest.expiresAt} <= now()`));
}

/** The days of one group with beach and spot data, first day first: what every request reads. */
async function groupDetail(tx: Transaction, code: string) {
  const [group] = await tx.select().from(bookingGroup).where(eq(bookingGroup.code, code.toUpperCase()));
  if (!group) throw new DomainError('not_found', 'Booking not found');
  const members = await tx
    .select({ booking, day: inventoryDay.day, spotCode: spot.code, zoneName: beachZone.name, beachName: beach.name, timezone: beach.timezone })
    .from(booking)
    .innerJoin(inventoryDay, eq(inventoryDay.id, booking.inventoryDayId))
    .innerJoin(spot, eq(spot.id, inventoryDay.spotId))
    .leftJoin(beachZone, eq(beachZone.id, spot.namedZoneId))
    .innerJoin(beach, eq(beach.id, booking.beachId))
    .where(eq(booking.groupId, group.id))
    .orderBy(asc(inventoryDay.day));
  if (members.length === 0) throw new DomainError('not_found', 'Booking not found');
  const live = members.filter((member) => member.booking.status !== 'cancelled');
  const counted = live.length > 0 ? live : members;
  return {
    group,
    members,
    lead: members[0]!,
    from: members[0]!.day,
    to: members[members.length - 1]!.day,
    alive: members.some((member) => member.booking.status === 'confirmed' || member.booking.status === 'completed'),
    totalCents: counted.reduce((sum, member) => sum + member.booking.totalCents, 0),
  };
}

export interface PayRequestMessageData {
  locale: 'it' | 'en';
  guestName: string;
  beachName: string;
  /** First booked day, YYYY-MM-DD, plus the beach club's time zone to write the deadline. */
  day: string;
  /** Last booked day of the group (D38): the message writes the whole dal–al period. */
  to: string;
  timezone: string;
  spotCode: string;
  bookingCode: string;
  amountCents: number;
  /** Token of the /paga/{token} page; the caller builds the public URL from it. */
  token: string;
  expiresAt: Date;
}

export interface CreatedPaymentRequest {
  requestId: string;
  token: string;
  status: 'pending';
  amountCents: number;
  expiresAt: Date;
  note: string | null;
  /** Language of the booking, hence of the message and of the public link. */
  locale: 'it' | 'en';
  /** Full message with the link, composed by the caller's template. */
  message: string;
  /** True when a `queued` notification row was written (the booking has an email). */
  notified: boolean;
}

/**
 * Creates a payment request for a confirmed booking group: amount within the
 * residual of the GROUP at creation time, expiry of 72 hours by default but
 * NEVER past the end of the LAST booked day in the beach club's time zone
 * (truncated when that end is close).
 * With an email on the booking, a `queued` notification row carries the full
 * message; without one, the text stays readable from the request detail.
 */
export function createPaymentRequest(
  db: Database,
  actor: Actor,
  input: { code: string; amountCents: number; note?: string | null; expiresInHours?: number },
  secret: string,
  compose: (data: PayRequestMessageData) => string,
): Promise<CreatedPaymentRequest> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new DomainError('invalid_state', 'The amount must be a positive amount of cents');
    const detail = await groupDetail(tx, input.code);
    // Lock order: group → payment → payment_request, everywhere.
    await lockGroup(tx, detail.group.id);
    if (!detail.members.some((member) => member.booking.status === 'confirmed')) {
      throw new DomainError('invalid_state', 'Only a confirmed booking can receive a payment request');
    }
    const reserved = detail.lead.booking;

    const residual = detail.totalCents - (await paidCentsOfGroup(tx, detail.group.id));
    if (input.amountCents > residual) throw new DomainError('invalid_state', 'The amount exceeds the outstanding balance');

    // 72 hours by default, truncated to the end of the LAST booked day in the
    // beach club's time zone; once that end has passed, no request can be created.
    const hours = input.expiresInHours ?? 72;
    // A raw execute hands timestamps back as text: the instant travels as epoch seconds.
    const [deadline] = (
      await tx.execute<{ expires_epoch: string; day_over: boolean }>(sql`
        select extract(epoch from least(now() + make_interval(hours => ${hours}::int), ((${detail.to}::date + 1)::timestamp at time zone ${detail.lead.timezone})))::text as expires_epoch,
               ((${detail.to}::date + 1)::timestamp at time zone ${detail.lead.timezone}) <= now() as day_over
      `)
    ).rows;
    if (!deadline || deadline.day_over) throw new DomainError('invalid_state', 'The booked day is over: nothing can be requested any more');

    const [created] = await tx
      .insert(paymentRequest)
      .values({
        beachId: actor.beachId,
        bookingId: reserved.id,
        groupId: detail.group.id,
        amountCents: input.amountCents,
        expiresAt: new Date(Number(deadline.expires_epoch) * 1000),
        note: input.note?.trim() || null,
        createdBy: actor.userId,
      })
      .returning();
    if (!created) throw new Error('payment request was not created');

    const token = payRequestToken(secret, created.id);
    const message = compose({
      locale: reserved.locale === 'en' ? 'en' : 'it',
      guestName: reserved.guestName,
      beachName: detail.lead.beachName,
      day: detail.from,
      to: detail.to,
      timezone: detail.lead.timezone,
      spotCode: detail.lead.spotCode,
      bookingCode: reserved.code,
      amountCents: created.amountCents,
      token,
      expiresAt: created.expiresAt,
    });
    const notified = reserved.guestEmail !== null;
    if (reserved.guestEmail) {
      await tx.insert(notification).values({
        beachId: actor.beachId,
        bookingId: reserved.id,
        template: 'payment_request',
        locale: reserved.locale,
        recipient: reserved.guestEmail,
        status: 'queued',
        provider: 'none',
        body: message,
      });
    }
    await tx.insert(auditEvent).values({
      beachId: actor.beachId,
      actorUserId: actor.userId,
      action: 'payment_request.create',
      target: reserved.code,
      detail: { requestId: created.id, amountCents: created.amountCents, expiresAt: created.expiresAt.toISOString(), notified },
    });
    return {
      requestId: created.id,
      token,
      status: 'pending',
      amountCents: created.amountCents,
      expiresAt: created.expiresAt,
      note: created.note,
      locale: reserved.locale === 'en' ? 'en' : 'it',
      message,
      notified,
    };
  });
}

/** Cancels a pending request; its link then answers the same neutral refusal. */
export function cancelPaymentRequest(db: Database, actor: Actor, requestId: string): Promise<void> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const [found] = await tx.select().from(paymentRequest).where(eq(paymentRequest.id, requestId)).for('update');
    if (!found) throw new DomainError('not_found', 'Payment request not found');
    if (found.status !== 'pending') throw new DomainError('invalid_state', 'Only a pending request can be cancelled');
    await tx.update(paymentRequest).set({ status: 'cancelled', closedAt: sql`now()` }).where(eq(paymentRequest.id, requestId));
    const [named] = await tx.select({ code: bookingGroup.code }).from(bookingGroup).where(eq(bookingGroup.id, found.groupId));
    await tx.insert(auditEvent).values({
      beachId: actor.beachId,
      actorUserId: actor.userId,
      action: 'payment_request.cancel',
      target: named?.code ?? requestId,
      detail: { requestId, amountCents: found.amountCents },
    });
  });
}

export interface PaymentRequestRow {
  requestId: string;
  amountCents: number;
  status: (typeof paymentRequest.$inferSelect)['status'];
  expiresAt: Date;
  note: string | null;
  createdAt: Date;
  closedAt: Date | null;
  /** Lets the management page rebuild the public link and the text to copy. */
  token: string;
}

export interface BookingPaymentRequests {
  bookingCode: string;
  guestName: string;
  guestEmail: string | null;
  guestPhone: string | null;
  locale: 'it' | 'en';
  beachName: string;
  timezone: string;
  /** First day of the group; `from`–`to` carry the whole period (D38). */
  day: string;
  from: string;
  to: string;
  spotCode: string;
  /** Name of the manager's named zone (D50); null when the spot belongs to none. */
  zoneName: string | null;
  totalCents: number;
  paidCents: number;
  remainingCents: number;
  paymentState: PaymentState;
  requests: PaymentRequestRow[];
}

/** Every request of one booking group, newest first, with the data to compose the text by hand. */
export function listPaymentRequests(db: Database, actor: Actor, code: string, secret: string): Promise<BookingPaymentRequests> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const detail = await groupDetail(tx, code);
    const reserved = detail.lead.booking;
    // Pending requests past their expiry flip to expired before being listed.
    await tx
      .update(paymentRequest)
      .set({ status: 'expired', closedAt: sql`now()` })
      .where(and(eq(paymentRequest.groupId, detail.group.id), eq(paymentRequest.status, 'pending'), sql`${paymentRequest.expiresAt} <= now()`));
    const rows = await tx.select().from(paymentRequest).where(eq(paymentRequest.groupId, detail.group.id)).orderBy(desc(paymentRequest.createdAt));
    const paidCents = await paidCentsOfGroup(tx, detail.group.id);
    return {
      bookingCode: detail.group.code,
      guestName: reserved.guestName,
      guestEmail: reserved.guestEmail,
      guestPhone: reserved.guestPhone,
      locale: reserved.locale === 'en' ? 'en' : 'it',
      beachName: detail.lead.beachName,
      timezone: detail.lead.timezone,
      day: detail.from,
      from: detail.from,
      to: detail.to,
      spotCode: detail.lead.spotCode,
      zoneName: detail.lead.zoneName,
      totalCents: detail.totalCents,
      paidCents,
      remainingCents: Math.max(0, detail.totalCents - paidCents),
      paymentState: paymentStateOf(detail.totalCents, paidCents),
      requests: rows.map((entry) => ({
        requestId: entry.id,
        amountCents: entry.amountCents,
        status: entry.status,
        expiresAt: entry.expiresAt,
        note: entry.note,
        createdAt: entry.createdAt,
        closedAt: entry.closedAt,
        token: payRequestToken(secret, entry.id),
      })),
    };
  });
}

const tokenShape = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.[A-Za-z0-9_-]{32}$/;

/** Verifies the signed token in constant time and finds the beach club, or answers the one neutral refusal. */
async function locateByToken(db: Database, token: string, secret: string): Promise<{ requestId: string; beachId: string }> {
  const requestId = tokenShape.exec(token)?.[1];
  if (!requestId || !sameText(token, payRequestToken(secret, requestId))) throw unavailable();
  const located = await db.execute<{ beach_id: string | null }>(sql`select payment_request_beach(${requestId}) as beach_id`);
  const beachId = located.rows[0]?.beach_id;
  if (!beachId) throw unavailable();
  return { requestId, beachId };
}

export interface PublicPayRequest {
  status: 'pending';
  beach: { slug: string; name: string };
  /** First booked day of the group. */
  day: string;
  /** The whole dal–al period of the group (D38), so /paga can write it; from = to for one day. */
  from: string;
  to: string;
  spotCode: string;
  /** Name of the manager's named zone (D50); null when the spot belongs to none. */
  zoneName: string | null;
  amountCents: number;
  expiresAt: Date;
}

/** True while the group behind the request still has a confirmed or completed day. */
const groupAlive = sql<boolean>`exists (select 1 from booking b where b.group_id = ${paymentRequest.groupId} and b.status in ('confirmed', 'completed'))`;

/**
 * What the public /paga/{token} page shows: the essential summary only. Expired,
 * cancelled, already paid and invalid tokens all answer the SAME polite refusal,
 * revealing nothing; the booking's own state leaks nothing either.
 */
export async function readPayRequest(db: Database, token: string, secret: string): Promise<PublicPayRequest> {
  const { requestId, beachId } = await locateByToken(db, token, secret);
  // In its own transaction: the neutral refusal below rolls its own one back.
  await withBeach(db, beachId, (tx) => expireLazily(tx, requestId));
  return withBeach(db, beachId, async (tx) => {
    const [row] = await tx
      .select({ request: paymentRequest, alive: groupAlive, day: inventoryDay.day, spotCode: spot.code, zoneName: beachZone.name, beachName: beach.name, beachSlug: beach.slug })
      .from(paymentRequest)
      .innerJoin(booking, eq(booking.id, paymentRequest.bookingId))
      .innerJoin(inventoryDay, eq(inventoryDay.id, booking.inventoryDayId))
      .innerJoin(spot, eq(spot.id, inventoryDay.spotId))
      .leftJoin(beachZone, eq(beachZone.id, spot.namedZoneId))
      .innerJoin(beach, eq(beach.id, paymentRequest.beachId))
      .where(eq(paymentRequest.id, requestId));
    if (!row || row.request.status !== 'pending' || !row.alive) throw unavailable();
    // The period of the group (D38): the page writes the whole dal–al, not only the first day.
    const totals = (await groupTotalsByGroup(tx, [row.request.groupId])).get(row.request.groupId);
    return {
      status: 'pending',
      beach: { slug: row.beachSlug, name: row.beachName },
      day: row.day,
      from: totals?.from ?? row.day,
      to: totals?.to ?? row.day,
      spotCode: row.spotCode,
      zoneName: row.zoneName,
      amountCents: row.request.amountCents,
      expiresAt: row.request.expiresAt,
    };
  });
}

/**
 * Opens the payment of a request with the test provider, exactly like the
 * checkout: a reference the sandbox will answer about through the webhook. The
 * residual of the GROUP is checked again here: when other collections reduced it
 * below the amount, the payment is refused with a clear message (the token is
 * genuine). Called twice, it returns the same open payment.
 */
export async function startPayRequestPayment(db: Database, token: string, secret: string): Promise<{ provider: string; reference: string; amountCents: number }> {
  const { requestId, beachId } = await locateByToken(db, token, secret);
  // In its own transaction: the neutral refusal below rolls its own one back.
  await withBeach(db, beachId, (tx) => expireLazily(tx, requestId));
  return withBeach(db, beachId, async (tx) => {
    const [found] = await tx.select().from(paymentRequest).where(eq(paymentRequest.id, requestId));
    if (!found || found.status !== 'pending') throw unavailable();
    // Lock order: group → payment_request (as the webhook does).
    await lockGroup(tx, found.groupId);
    const members = await tx.select().from(booking).where(eq(booking.groupId, found.groupId));
    if (!members.some((member) => member.status === 'confirmed' || member.status === 'completed')) throw unavailable();
    const [request] = await tx.select().from(paymentRequest).where(eq(paymentRequest.id, requestId)).for('update');
    if (!request || request.status !== 'pending') throw unavailable();

    const live = members.filter((member) => member.status !== 'cancelled');
    const totalCents = (live.length > 0 ? live : members).reduce((sum, member) => sum + member.totalCents, 0);
    const residual = totalCents - (await paidCentsOfGroup(tx, found.groupId));
    if (request.amountCents > residual) throw new DomainError('request_not_payable', 'This request can no longer be paid: the balance has changed');

    const [open] = await tx
      .select()
      .from(payment)
      .where(and(eq(payment.requestId, requestId), eq(payment.status, 'in_progress')));
    if (open) return { provider: open.provider, reference: open.providerRef, amountCents: open.amountCents };

    const reference = `sbx_${randomBytes(12).toString('hex')}`;
    await tx.insert(payment).values({
      beachId,
      bookingId: found.bookingId,
      groupId: found.groupId,
      provider: 'sandbox',
      providerRef: reference,
      status: 'in_progress',
      amountCents: request.amountCents,
      purpose: 'request',
      requestId,
    });
    return { provider: 'sandbox', reference, amountCents: request.amountCents };
  });
}

export interface NotificationRow {
  notificationId: string;
  template: string;
  locale: string;
  recipient: string;
  status: 'queued' | 'sent' | 'skipped';
  provider: string;
  body: string | null;
  bookingCode: string | null;
  createdAt: Date;
}

/** The «Comunicazioni» page: every notification, newest first, body included to copy by hand. */
export function listNotifications(db: Database, actor: Actor, limit = 200): Promise<NotificationRow[]> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const rows = await tx
      .select({
        notificationId: notification.id,
        template: notification.template,
        locale: notification.locale,
        recipient: notification.recipient,
        status: notification.status,
        provider: notification.provider,
        body: notification.body,
        bookingCode: booking.code,
        createdAt: notification.createdAt,
      })
      .from(notification)
      .leftJoin(booking, eq(booking.id, notification.bookingId))
      .orderBy(desc(notification.createdAt))
      .limit(limit);
    return rows;
  });
}
