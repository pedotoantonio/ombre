import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { paidCentsOf, paymentStateOf, type PaymentState } from './bookings';
import { withActor, withBeach, type Database, type Transaction } from './client';
import { DomainError } from './inventory';
import type { Actor } from './manage';
import { auditEvent, beach, booking, inventoryDay, notification, payment, paymentRequest, spot } from './schema';

// Payment requests (deposit or balance, spec §4.3, D31). The public token is
// `{id}.{signature}` — signed with OMBRE_SIGNING_SECRET like the passes, never
// stored, verified in constant time. A pending request past its expiry becomes
// `expired` lazily, at the first read that meets it: no worker job needed.

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

export interface PayRequestMessageData {
  locale: 'it' | 'en';
  guestName: string;
  beachName: string;
  /** Booked day, YYYY-MM-DD, plus the beach club's time zone to write the deadline. */
  day: string;
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
 * Creates a payment request for a confirmed booking: amount within the residual
 * at creation time, expiry of 72 hours by default but NEVER past the end of the
 * booked day in the beach club's time zone (truncated when the day is close).
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
    const [row] = await tx
      .select({ booking, day: inventoryDay.day, spotCode: spot.code, beachName: beach.name, timezone: beach.timezone })
      .from(booking)
      .innerJoin(inventoryDay, eq(inventoryDay.id, booking.inventoryDayId))
      .innerJoin(spot, eq(spot.id, inventoryDay.spotId))
      .innerJoin(beach, eq(beach.id, booking.beachId))
      .where(eq(booking.code, input.code.toUpperCase()));
    if (!row) throw new DomainError('not_found', 'Booking not found');
    const [reserved] = await tx.select().from(booking).where(eq(booking.id, row.booking.id)).for('update');
    if (!reserved || reserved.status !== 'confirmed') throw new DomainError('invalid_state', 'Only a confirmed booking can receive a payment request');

    const residual = reserved.totalCents - (await paidCentsOf(tx, reserved.id));
    if (input.amountCents > residual) throw new DomainError('invalid_state', 'The amount exceeds the outstanding balance');

    // 72 hours by default, truncated to the end of the booked day in the beach
    // club's time zone; once that end has passed, no request can be created.
    const hours = input.expiresInHours ?? 72;
    // A raw execute hands timestamps back as text: the instant travels as epoch seconds.
    const [deadline] = (
      await tx.execute<{ expires_epoch: string; day_over: boolean }>(sql`
        select extract(epoch from least(now() + make_interval(hours => ${hours}::int), ((${row.day}::date + 1)::timestamp at time zone ${row.timezone})))::text as expires_epoch,
               ((${row.day}::date + 1)::timestamp at time zone ${row.timezone}) <= now() as day_over
      `)
    ).rows;
    if (!deadline || deadline.day_over) throw new DomainError('invalid_state', 'The booked day is over: nothing can be requested any more');

    const [created] = await tx
      .insert(paymentRequest)
      .values({
        beachId: actor.beachId,
        bookingId: reserved.id,
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
      beachName: row.beachName,
      day: row.day,
      timezone: row.timezone,
      spotCode: row.spotCode,
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
    const [named] = await tx.select({ code: booking.code }).from(booking).where(eq(booking.id, found.bookingId));
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
  day: string;
  spotCode: string;
  totalCents: number;
  paidCents: number;
  remainingCents: number;
  paymentState: PaymentState;
  requests: PaymentRequestRow[];
}

/** Every request of one booking, newest first, with the data to compose the text by hand. */
export function listPaymentRequests(db: Database, actor: Actor, code: string, secret: string): Promise<BookingPaymentRequests> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const [row] = await tx
      .select({ booking, day: inventoryDay.day, spotCode: spot.code, beachName: beach.name, timezone: beach.timezone })
      .from(booking)
      .innerJoin(inventoryDay, eq(inventoryDay.id, booking.inventoryDayId))
      .innerJoin(spot, eq(spot.id, inventoryDay.spotId))
      .innerJoin(beach, eq(beach.id, booking.beachId))
      .where(eq(booking.code, code.toUpperCase()));
    if (!row) throw new DomainError('not_found', 'Booking not found');
    // Pending requests past their expiry flip to expired before being listed.
    await tx
      .update(paymentRequest)
      .set({ status: 'expired', closedAt: sql`now()` })
      .where(and(eq(paymentRequest.bookingId, row.booking.id), eq(paymentRequest.status, 'pending'), sql`${paymentRequest.expiresAt} <= now()`));
    const rows = await tx.select().from(paymentRequest).where(eq(paymentRequest.bookingId, row.booking.id)).orderBy(desc(paymentRequest.createdAt));
    const paidCents = await paidCentsOf(tx, row.booking.id);
    return {
      bookingCode: row.booking.code,
      guestName: row.booking.guestName,
      guestEmail: row.booking.guestEmail,
      guestPhone: row.booking.guestPhone,
      locale: row.booking.locale === 'en' ? 'en' : 'it',
      beachName: row.beachName,
      timezone: row.timezone,
      day: row.day,
      spotCode: row.spotCode,
      totalCents: row.booking.totalCents,
      paidCents,
      remainingCents: Math.max(0, row.booking.totalCents - paidCents),
      paymentState: paymentStateOf(row.booking.totalCents, paidCents),
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
  day: string;
  spotCode: string;
  amountCents: number;
  expiresAt: Date;
}

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
      .select({ request: paymentRequest, bookingStatus: booking.status, day: inventoryDay.day, spotCode: spot.code, beachName: beach.name, beachSlug: beach.slug })
      .from(paymentRequest)
      .innerJoin(booking, eq(booking.id, paymentRequest.bookingId))
      .innerJoin(inventoryDay, eq(inventoryDay.id, booking.inventoryDayId))
      .innerJoin(spot, eq(spot.id, inventoryDay.spotId))
      .innerJoin(beach, eq(beach.id, paymentRequest.beachId))
      .where(eq(paymentRequest.id, requestId));
    if (!row || row.request.status !== 'pending' || (row.bookingStatus !== 'confirmed' && row.bookingStatus !== 'completed')) throw unavailable();
    return {
      status: 'pending',
      beach: { slug: row.beachSlug, name: row.beachName },
      day: row.day,
      spotCode: row.spotCode,
      amountCents: row.request.amountCents,
      expiresAt: row.request.expiresAt,
    };
  });
}

/**
 * Opens the payment of a request with the test provider, exactly like the
 * checkout: a reference the sandbox will answer about through the webhook. The
 * residual is checked again here: when other collections reduced it below the
 * amount, the payment is refused with a clear message (the token is genuine).
 * Called twice, it returns the same open payment.
 */
export async function startPayRequestPayment(db: Database, token: string, secret: string): Promise<{ provider: string; reference: string; amountCents: number }> {
  const { requestId, beachId } = await locateByToken(db, token, secret);
  // In its own transaction: the neutral refusal below rolls its own one back.
  await withBeach(db, beachId, (tx) => expireLazily(tx, requestId));
  return withBeach(db, beachId, async (tx) => {
    const [found] = await tx.select().from(paymentRequest).where(eq(paymentRequest.id, requestId));
    if (!found || found.status !== 'pending') throw unavailable();
    // Lock order: booking → payment → payment_request (as the webhook does).
    const [reserved] = await tx.select().from(booking).where(eq(booking.id, found.bookingId)).for('update');
    if (!reserved || (reserved.status !== 'confirmed' && reserved.status !== 'completed')) throw unavailable();
    const [request] = await tx.select().from(paymentRequest).where(eq(paymentRequest.id, requestId)).for('update');
    if (!request || request.status !== 'pending') throw unavailable();

    const residual = reserved.totalCents - (await paidCentsOf(tx, reserved.id));
    if (request.amountCents > residual) throw new DomainError('request_not_payable', 'This request can no longer be paid: the balance has changed');

    const [open] = await tx
      .select()
      .from(payment)
      .where(and(eq(payment.requestId, requestId), eq(payment.status, 'in_progress')));
    if (open) return { provider: open.provider, reference: open.providerRef, amountCents: open.amountCents };

    const reference = `sbx_${randomBytes(12).toString('hex')}`;
    await tx.insert(payment).values({
      beachId,
      bookingId: reserved.id,
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
