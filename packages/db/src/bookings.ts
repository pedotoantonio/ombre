import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { canTransition } from '@ombre/shared';
import { withActor, withBeach, type Database, type Transaction } from './client';
import { extraLinesByGroup, groupExtraLines } from './extras';
import { acquireHold, conventionAppliesOn, DomainError, priceExtras, type ExtraLine, type ExtraRequest } from './inventory';
import { enqueue } from './jobs';
import { recordRefundDue, recordSale } from './ledger';
import type { Actor } from './manage';
import { accessEvent, allocation, auditEvent, beach, booking, bookingExtra, bookingGroup, hold, holdExtra, hotelConvention, inventoryDay, ledgerEntry, pass, payment, paymentRequest, promotion, providerEvent, refund, spot } from './schema';

/** Signs identifiers so that links and passes cannot be guessed and need no stored secret per row. */
function sign(secret: string, purpose: string, id: string): string {
  return createHmac('sha256', secret).update(`${purpose}:${id}`).digest('base64url');
}

function sameText(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const bookingAccessToken = (secret: string, bookingId: string): string => sign(secret, 'booking', bookingId);
export const passCredential = (secret: string, passId: string): string => `${passId}.${sign(secret, 'pass', passId).slice(0, 32)}`;

// ---- The payment aggregate (D31 at group level, D38, spec ruoli-periodo §2) ----
// The residual is defined once: total of the group's days that are not cancelled
// minus the payments of the group that really succeeded. The shown payment state
// is derived from it, never stored.

export type PaymentState = 'paid' | 'partial' | 'to_collect';

export function paymentStateOf(totalCents: number, paidCents: number): PaymentState {
  if (paidCents >= totalCents) return 'paid';
  return paidCents > 0 ? 'partial' : 'to_collect';
}

/** Sum of the succeeded payments of one booking group, inside the current transaction. */
export async function paidCentsOfGroup(tx: Transaction, groupId: string): Promise<number> {
  const [row] = await tx
    .select({ paid: sql<number>`coalesce(sum(${payment.amountCents}), 0)::int` })
    .from(payment)
    .where(and(eq(payment.groupId, groupId), eq(payment.status, 'succeeded')));
  return row?.paid ?? 0;
}

/** Succeeded cents per group, for day lists: one query, a map back. */
export async function paidCentsByGroup(tx: Transaction, groupIds: string[]): Promise<Map<string, number>> {
  if (groupIds.length === 0) return new Map();
  const rows = await tx
    .select({ groupId: payment.groupId, paid: sql<number>`coalesce(sum(${payment.amountCents}), 0)::int` })
    .from(payment)
    .where(and(inArray(payment.groupId, groupIds), eq(payment.status, 'succeeded')))
    .groupBy(payment.groupId);
  return new Map(rows.map((row) => [row.groupId, row.paid]));
}

/** One booking is one spot for one day: these are the days of one group, first day first. */
async function bookingsOfGroup(tx: Transaction, groupId: string): Promise<{ booking: typeof booking.$inferSelect; day: string }[]> {
  return tx
    .select({ booking, day: inventoryDay.day })
    .from(booking)
    .innerJoin(inventoryDay, eq(inventoryDay.id, booking.inventoryDayId))
    .where(eq(booking.groupId, groupId))
    .orderBy(asc(inventoryDay.day));
}

/** Total of the group as it stands: cancelled days no longer count; extras ride the first day. */
function liveTotalCents(members: { booking: { status: string; totalCents: number } }[]): number {
  const live = members.filter((member) => member.booking.status !== 'cancelled');
  const counted = live.length > 0 ? live : members;
  return counted.reduce((sum, member) => sum + member.booking.totalCents, 0);
}

/** Finds the group by its public code, or refuses like an unknown booking. */
async function groupByCode(tx: Transaction, code: string): Promise<typeof bookingGroup.$inferSelect> {
  const [found] = await tx.select().from(bookingGroup).where(eq(bookingGroup.code, code.toUpperCase()));
  if (!found) throw new DomainError('not_found', 'Booking not found');
  return found;
}

/**
 * Serializes every group-level money movement: collections, payment requests and
 * cancellations all take this lock first, so the residual can never be raced.
 * An advisory lock, because the group row itself is immutable and the
 * application role has no UPDATE on it (a row lock would need one).
 */
export async function lockGroup(tx: Transaction, groupId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`booking_group/${groupId}`}, 0))`);
}

export interface CheckoutResult {
  bookingId: string;
  code: string;
  /** Lets the guest read the booking without an account. */
  accessToken: string;
  status: (typeof booking.$inferSelect)['status'];
  payment: { provider: string; reference: string; amountCents: number };
  replayed: boolean;
}

export interface CheckoutRequest {
  holdId: string;
  guestName: string;
  /** Missing only for bookings made at the front desk. */
  guestEmail: string | null;
  /** Optional contact the front desk may take down (spec §4.3). */
  guestPhone?: string | null;
  locale?: 'it' | 'en';
  source?: 'online' | 'desk';
}

interface FamilyMember {
  held: typeof hold.$inferSelect;
  day: typeof inventoryDay.$inferSelect;
}

/**
 * The reserve family behind a lead hold (D39): the lead and its children, each
 * with its inventory row locked. Rows are locked in identifier order, like every
 * multi-day path, and the members come back in day order.
 */
async function lockedHoldFamily(tx: Transaction, leadHoldId: string): Promise<FamilyMember[]> {
  const holds = await tx
    .select()
    .from(hold)
    .where(or(eq(hold.id, leadHoldId), eq(hold.parentHoldId, leadHoldId)));
  const lead = holds.find((row) => row.id === leadHoldId);
  if (!lead || lead.parentHoldId !== null) throw new DomainError('not_found', 'Hold not found');
  const days = await tx
    .select()
    .from(inventoryDay)
    .where(inArray(inventoryDay.id, holds.map((row) => row.inventoryDayId)))
    .orderBy(asc(inventoryDay.id))
    .for('update');
  const dayOf = new Map(days.map((row) => [row.id, row]));
  const members = holds.map((held) => {
    const day = dayOf.get(held.inventoryDayId);
    if (!day) throw new DomainError('not_found', 'Hold not found');
    return { held, day };
  });
  members.sort((left, right) => left.day.day.localeCompare(right.day.day));
  return members;
}

/**
 * Converts an active reserve family into a booking group under review, with the
 * day rows already locked by the caller: one code on the group, one booking per
 * day with its day's frozen price, the extras copied once onto the first day.
 */
async function createGroupFromHolds(tx: Transaction, beachId: string, members: FamilyMember[], request: CheckoutRequest) {
  const lead = members[0];
  if (!lead) throw new DomainError('not_found', 'Hold not found');
  const [live] = await tx
    .select({ live: sql<boolean>`${hold.status} = 'active' and ${hold.expiresAt} > now()` })
    .from(hold)
    .where(eq(hold.id, lead.held.id));
  for (const member of members) {
    if (!live?.live || member.held.status !== 'active' || member.day.activeHoldId !== member.held.id) {
      throw new DomainError('hold_expired', 'The hold has run out: choose the spot again');
    }
  }

  // One numbering per beach club and first day: OM-YYMMDD-NNN. The code lives on
  // the group (D38); the unique constraint on booking_group is the backstop.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${beachId}/${lead.day.day}`}, 0))`);
  const [count] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(booking)
    .innerJoin(inventoryDay, eq(inventoryDay.id, booking.inventoryDayId))
    .where(eq(inventoryDay.day, lead.day.day));
  const code = `OM-${lead.day.day.slice(2).replaceAll('-', '')}-${String((count?.n ?? 0) + 1).padStart(3, '0')}`;

  const [group] = await tx.insert(bookingGroup).values({ beachId, code }).returning();
  if (!group) throw new Error('booking group was not created');

  const created: (typeof booking.$inferSelect)[] = [];
  for (const member of members) {
    const [row] = await tx
      .insert(booking)
      .values({
        beachId,
        inventoryDayId: member.day.id,
        holdId: member.held.id,
        groupId: group.id,
        promotionId: member.held.promotionId,
        conventionId: member.held.conventionId,
        code,
        status: 'under_review',
        guestName: request.guestName,
        guestEmail: request.guestEmail?.toLowerCase() ?? null,
        guestPhone: request.guestPhone?.trim() || null,
        source: request.source ?? 'online',
        locale: request.locale ?? 'it',
        listPriceCents: member.held.listPriceCents,
        discountCents: member.held.discountCents,
        extrasCents: member.held.extrasCents,
        totalCents: member.held.totalCents,
        promoCode: member.held.promoCode,
      })
      .returning();
    if (!row) throw new Error('booking was not created');
    created.push(row);
  }

  // The conversion copies the hold snapshot of the lead: quantities and the unit
  // prices frozen at reservation time (spec §4.2), once for the whole period,
  // attached to the group with the first day as the ledger anchor (D38).
  const frozen = await tx.select().from(holdExtra).where(eq(holdExtra.holdId, lead.held.id));
  if (frozen.length > 0) {
    await tx
      .insert(bookingExtra)
      .values(frozen.map((line) => ({ beachId, bookingId: created[0]!.id, groupId: group.id, serviceId: line.serviceId, quantity: line.quantity, unitPriceCents: line.unitPriceCents })));
  }
  return { group, created, members };
}

/**
 * Turns an active reserve (the whole family of a period, D39) into a booking group under
 * review and opens its single payment on the group total. Sending it twice for the same
 * hold returns the same group.
 */
export function startCheckout(db: Database, beachId: string, request: CheckoutRequest, secret: string): Promise<CheckoutResult> {
  return withBeach(db, beachId, async (tx) => {
    const members = await lockedHoldFamily(tx, request.holdId);

    const [existing] = await tx.select().from(booking).where(eq(booking.holdId, request.holdId));
    if (existing) {
      // The replay answers with the payment the checkout opened, never with a
      // later payment-request one (D31).
      const [paid] = await tx.select().from(payment).where(and(eq(payment.groupId, existing.groupId), inArray(payment.purpose, ['checkout', 'desk'])));
      if (!paid) throw new Error('booking without payment');
      return {
        bookingId: existing.id,
        code: existing.code,
        accessToken: bookingAccessToken(secret, existing.id),
        status: existing.status,
        payment: { provider: paid.provider, reference: paid.providerRef, amountCents: paid.amountCents },
        replayed: true,
      };
    }

    const { group, created } = await createGroupFromHolds(tx, beachId, members, request);
    const totalCents = members.reduce((sum, member) => sum + member.held.totalCents, 0);

    const provider = request.source === 'desk' ? 'desk' : 'sandbox';
    const reference = `${provider === 'desk' ? 'desk' : 'sbx'}_${randomBytes(12).toString('hex')}`;
    await tx
      .insert(payment)
      .values({ beachId, bookingId: created[0]!.id, groupId: group.id, provider, providerRef: reference, status: 'in_progress', amountCents: totalCents, purpose: provider === 'desk' ? 'desk' : 'checkout' });
    return {
      bookingId: created[0]!.id,
      code: group.code,
      accessToken: bookingAccessToken(secret, created[0]!.id),
      status: created[0]!.status,
      payment: { provider, reference, amountCents: totalCents },
      replayed: false,
    };
  });
}

export type PaymentOutcome = 'confirmed' | 'cancelled' | 'refund_due' | 'duplicate' | 'ignored' | 'collected' | 'request_failed';

export interface ProviderNotice {
  provider: string;
  eventId: string;
  reference: string;
  outcome: 'succeeded' | 'failed';
}

/**
 * Applies a provider notification exactly once, to the whole group (D39: all or
 * nothing). A success that arrives after the hold ran out confirms the group only
 * if EVERY day is still free; otherwise every day is given back and a refund of
 * the whole payment is recorded.
 */
export async function applyPaymentOutcome(db: Database, notice: ProviderNotice): Promise<PaymentOutcome> {
  const fresh = await db.insert(providerEvent).values({ provider: notice.provider, eventId: notice.eventId }).onConflictDoNothing().returning();
  if (fresh.length === 0) return 'duplicate';

  const located = await db.execute<{ beach_id: string | null }>(sql`select payment_beach(${notice.provider}, ${notice.reference}) as beach_id`);
  const beachId = located.rows[0]?.beach_id;
  if (!beachId) return 'ignored';

  return withBeach(db, beachId, async (tx) => {
    const [found] = await tx.select().from(payment).where(and(eq(payment.provider, notice.provider), eq(payment.providerRef, notice.reference)));
    if (!found) return 'ignored';
    // The purpose routes the outcome (D31): a payment born from a payment request
    // NEVER walks the checkout confirm/cancel path below — on a group that is
    // already confirmed that path would treat the days as gone and cancel them.
    if (found.purpose === 'request') return settleRequestPayment(tx, beachId, notice.outcome, found);

    const members = await bookingsOfGroup(tx, found.groupId);
    if (members.length === 0) return 'ignored';
    const lockedDays = await tx
      .select()
      .from(inventoryDay)
      .where(inArray(inventoryDay.id, members.map((member) => member.booking.inventoryDayId)))
      .orderBy(asc(inventoryDay.id))
      .for('update');
    const dayOf = new Map(lockedDays.map((row) => [row.id, row]));
    const [paid] = await tx.select().from(payment).where(eq(payment.id, found.id)).for('update');
    if (!paid || paid.status === 'succeeded' || paid.status === 'failed') return 'ignored';

    const pairs = members.map((member) => ({ reserved: member.booking, day: dayOf.get(member.booking.inventoryDayId) }));
    if (pairs.some((pair) => !pair.day)) return 'ignored';
    const settle = (status: 'succeeded' | 'failed') => tx.update(payment).set({ status, updatedAt: sql`now()` }).where(eq(payment.id, paid.id));
    const ours = (pair: { reserved: typeof booking.$inferSelect; day?: typeof inventoryDay.$inferSelect }) =>
      pair.day!.state === 'held' && pair.day!.activeHoldId === pair.reserved.holdId;
    const lead = pairs[0]!;

    if (notice.outcome === 'failed') {
      await settle('failed');
      for (const pair of pairs) {
        await tx.update(booking).set({ status: 'cancelled' }).where(eq(booking.id, pair.reserved.id));
        if (ours(pair)) await freeDay(tx, pair.day!.id, pair.reserved.holdId, pair.reserved.promotionId);
      }
      await enqueue(tx, beachId, 'booking.cancelled', { bookingId: lead.reserved.id });
      return 'cancelled';
    }

    await settle('succeeded');
    if (pairs.every((pair) => ours(pair) || pair.day!.state === 'available')) {
      for (const pair of pairs) {
        await tx.update(hold).set({ status: 'converted' }).where(eq(hold.id, pair.reserved.holdId));
        await tx.update(inventoryDay).set({ state: 'occupied', activeHoldId: null, updatedAt: sql`now()` }).where(eq(inventoryDay.id, pair.day!.id));
        await tx.update(booking).set({ status: 'confirmed', confirmedAt: sql`now()` }).where(eq(booking.id, pair.reserved.id));
        await recordSale(tx, beachId, { bookingId: pair.reserved.id, inventoryDayId: pair.day!.id, totalCents: pair.reserved.totalCents, extrasCents: pair.reserved.extrasCents });
      }
      await tx.insert(pass).values({ beachId, bookingId: lead.reserved.id, groupId: found.groupId });
      await enqueue(tx, beachId, 'booking.confirmed', { bookingId: lead.reserved.id });
      return 'confirmed';
    }

    // A day went to someone else while the payment was in flight: the reserve was
    // all or nothing (D39), so every day is given back and the money returns.
    for (const pair of pairs) {
      await tx.update(booking).set({ status: 'cancelled' }).where(eq(booking.id, pair.reserved.id));
      if (ours(pair)) await freeDay(tx, pair.day!.id, pair.reserved.holdId, pair.reserved.promotionId);
    }
    await tx.insert(refund).values({ beachId, paymentId: paid.id, amountCents: paid.amountCents, reason: 'inventory_unavailable' });
    await recordRefundDue(tx, beachId, lead.reserved.id, paid.amountCents);
    await enqueue(tx, beachId, 'refund.due', { bookingId: lead.reserved.id });
    return 'refund_due';
  });
}

/**
 * Outcome of a payment born from a payment request (D31 at group level). It only
 * ever reduces the residual of the GROUP and closes its own request. When the
 * money cannot be collected (group cancelled in the meantime, or the residual
 * fell below the amount), the payment is settled as `failed`, the WHOLE amount
 * is recorded as a refund to execute and the request closes as `cancelled`.
 * Lock order everywhere: group → payment → payment_request.
 */
async function settleRequestPayment(tx: Transaction, beachId: string, outcome: 'succeeded' | 'failed', found: typeof payment.$inferSelect): Promise<PaymentOutcome> {
  await lockGroup(tx, found.groupId);
  const [paid] = await tx.select().from(payment).where(eq(payment.id, found.id)).for('update');
  if (!paid || paid.status === 'succeeded' || paid.status === 'failed') return 'ignored';
  const settle = (status: 'succeeded' | 'failed') => tx.update(payment).set({ status, updatedAt: sql`now()` }).where(eq(payment.id, paid.id));

  if (outcome === 'failed') {
    // The provider refused: the request stays pending and can be paid again until it expires.
    await settle('failed');
    return 'request_failed';
  }

  const [request] = paid.requestId ? await tx.select().from(paymentRequest).where(eq(paymentRequest.id, paid.requestId)).for('update') : [];
  const members = await bookingsOfGroup(tx, found.groupId);
  const alive = members.some((member) => member.booking.status === 'confirmed' || member.booking.status === 'completed');
  const residual = liveTotalCents(members) - (await paidCentsOfGroup(tx, found.groupId));
  const collectable = alive && request !== undefined && request.status === 'pending' && paid.amountCents <= residual;

  if (collectable) {
    await settle('succeeded');
    await tx.update(paymentRequest).set({ status: 'paid', closedAt: sql`now()` }).where(eq(paymentRequest.id, request.id));
    // No ledger entry here: the sale was recorded in full at confirmation
    // (`payment_received` of each day); the collection lives in `payment`.
    return 'collected';
  }

  // No collection: the whole amount goes back. The inflow and the refund to
  // execute are both recorded, so the books stay balanced.
  await settle('failed');
  if (request && request.status === 'pending') {
    await tx.update(paymentRequest).set({ status: 'cancelled', closedAt: sql`now()` }).where(eq(paymentRequest.id, request.id));
  }
  await tx.insert(refund).values({
    beachId,
    paymentId: paid.id,
    amountCents: paid.amountCents,
    reason: alive ? 'over_collection' : 'booking_cancelled',
  });
  await recordRefundDue(tx, beachId, found.bookingId, paid.amountCents);
  await enqueue(tx, beachId, 'refund.due', { bookingId: found.bookingId });
  return 'refund_due';
}

async function freeDay(tx: Transaction, inventoryDayId: string, holdId: string, promotionId: string | null): Promise<void> {
  await tx.update(hold).set({ status: 'released' }).where(and(eq(hold.id, holdId), eq(hold.status, 'active')));
  if (promotionId) {
    await tx.update(promotion).set({ committedUses: sql`${promotion.committedUses} - 1` }).where(eq(promotion.id, promotionId));
  }
  await tx.update(inventoryDay).set({ state: 'available', activeHoldId: null, updatedAt: sql`now()` }).where(eq(inventoryDay.id, inventoryDayId));
}

/** The state of the group as a whole, derived from its days. */
function groupStatusOf(statuses: (typeof booking.$inferSelect)['status'][]): (typeof booking.$inferSelect)['status'] {
  if (statuses.some((status) => status === 'under_review')) return 'under_review';
  if (statuses.some((status) => status === 'confirmed')) return 'confirmed';
  if (statuses.some((status) => status === 'completed')) return 'completed';
  return statuses[0] ?? 'cancelled';
}

/** One day of a group as the guest sees it in the summary: the spot alone, the extras are listed apart. */
export interface BookingDayView {
  day: string;
  listPriceCents: number;
  discountCents: number;
  totalCents: number;
  status: (typeof booking.$inferSelect)['status'];
}

export interface BookingView {
  bookingId: string;
  /** Code of the GROUP: one code, one pass, one total (D38). */
  code: string;
  status: (typeof booking.$inferSelect)['status'];
  /**
   * The payment the checkout or the desk opened with the group. A booking taken
   * «da incassare» has none: the three fields are null and the aggregate below
   * (`paidCents`, `remainingCents`, `paymentState`) tells the whole story (D31).
   */
  paymentStatus: (typeof payment.$inferSelect)['status'] | null;
  paymentProvider: string | null;
  paymentReference: string | null;
  /** Aggregate over every succeeded payment of the group: residual = total − paidCents. */
  paidCents: number;
  remainingCents: number;
  paymentState: PaymentState;
  presence: (typeof booking.$inferSelect)['presence'];
  guestName: string;
  /** First day of the period; `from`–`to` and `days` carry the whole of it. */
  day: string;
  from: string;
  to: string;
  days: BookingDayView[];
  spot: { code: string; rowNumber: number; umbrellas: number; sunbeds: number };
  /** `total` is comprehensive: sum of the days' discounted prices + extras, chosen once per period. */
  quote: { listPrice: number; discount: number; total: number; promoCode: string | null; extrasCents: number; extras: ExtraLine[] };
  /** Text to show as a QR code, the same for every day of the group. Present only while the group is confirmed. */
  passCredential: string | null;
}

/** The guest's own view of a booking group, opened with the token received at checkout. */
export function getBooking(db: Database, beachId: string, bookingId: string, accessToken: string, secret: string): Promise<BookingView> {
  if (!sameText(accessToken, bookingAccessToken(secret, bookingId))) {
    return Promise.reject(new DomainError('not_found', 'Booking not found'));
  }
  return withBeach(db, beachId, async (tx) => {
    const [row] = await tx
      .select({ booking, spot })
      .from(booking)
      .innerJoin(inventoryDay, eq(inventoryDay.id, booking.inventoryDayId))
      .innerJoin(spot, eq(spot.id, inventoryDay.spotId))
      .where(eq(booking.id, bookingId));
    if (!row) throw new DomainError('not_found', 'Booking not found');
    const members = await bookingsOfGroup(tx, row.booking.groupId);
    const [issued] = await tx.select().from(pass).where(eq(pass.groupId, row.booking.groupId));
    // One group now carries many payments (D31): the one opened with the group
    // keeps feeding the legacy fields, so the online checkout answer stays
    // exactly as it was; request payments only enter the aggregate.
    const payments = await tx.select().from(payment).where(eq(payment.groupId, row.booking.groupId)).orderBy(asc(payment.createdAt));
    const opened = payments.find((entry) => entry.purpose !== 'request') ?? null;
    const paidCents = payments.filter((entry) => entry.status === 'succeeded').reduce((sum, entry) => sum + entry.amountCents, 0);

    const status = groupStatusOf(members.map((member) => member.booking.status));
    const live = members.filter((member) => member.booking.status !== 'cancelled');
    const counted = live.length > 0 ? live : members;
    const totalCents = counted.reduce((sum, member) => sum + member.booking.totalCents, 0);
    const listPrice = counted.reduce((sum, member) => sum + member.booking.listPriceCents, 0);
    const discount = counted.reduce((sum, member) => sum + member.booking.discountCents, 0);
    const extrasCents = counted.reduce((sum, member) => sum + member.booking.extrasCents, 0);
    const usable = status === 'confirmed' && issued && !issued.revoked;
    return {
      bookingId: row.booking.id,
      code: row.booking.code,
      status,
      paymentStatus: opened?.status ?? null,
      paymentProvider: opened?.provider ?? null,
      paymentReference: opened?.providerRef ?? null,
      paidCents,
      remainingCents: Math.max(0, totalCents - paidCents),
      paymentState: paymentStateOf(totalCents, paidCents),
      presence: row.booking.presence,
      guestName: row.booking.guestName,
      day: members[0]?.day ?? '',
      from: members[0]?.day ?? '',
      to: members[members.length - 1]?.day ?? '',
      days: members.map((member) => ({
        day: member.day,
        listPriceCents: member.booking.listPriceCents,
        discountCents: member.booking.discountCents,
        totalCents: member.booking.totalCents - member.booking.extrasCents,
        status: member.booking.status,
      })),
      spot: { code: row.spot.code, rowNumber: row.spot.rowNumber, umbrellas: row.spot.umbrellas, sunbeds: row.spot.sunbeds },
      quote: {
        listPrice,
        discount,
        total: totalCents,
        promoCode: row.booking.promoCode,
        extrasCents,
        extras: await groupExtraLines(tx, row.booking.groupId),
      },
      passCredential: usable && issued ? passCredential(secret, issued.id) : null,
    };
  });
}

export interface AccessResult {
  code: string;
  spotCode: string;
  guestName: string;
  presence: (typeof booking.$inferSelect)['presence'];
  /** What the front desk hands over with the pass (spec §4.2): the extras of the period. */
  extras: { name: { it: string; en: string | null }; quantity: number }[];
}

const shortCode = /^OM-\d{6}-\d{3}$/;

/**
 * Registers an entry or an exit at the front desk, from the QR text or the short
 * code. The pass belongs to the group (D38): the verification resolves the day
 * of the group that is today, and presence stays per day as before. The day's
 * booking row is locked, so two scans at the same instant give one entry.
 */
export function checkAccess(db: Database, actor: Actor, input: { credential: string; kind: 'entry' | 'exit' }, secret: string): Promise<AccessResult> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const invalid = () => new DomainError('pass_invalid', 'This pass is not valid');
    const credential = input.credential.trim();
    let groupId: string | undefined;

    if (shortCode.test(credential.toUpperCase())) {
      const [byCode] = await tx.select({ id: bookingGroup.id }).from(bookingGroup).where(eq(bookingGroup.code, credential.toUpperCase()));
      groupId = byCode?.id;
    } else {
      const [passId = '', signature = ''] = credential.split('.');
      if (!/^[0-9a-f-]{36}$/.test(passId) || !sameText(credential, passCredential(secret, passId)) || !signature) throw invalid();
      const [byPass] = await tx.select({ groupId: pass.groupId }).from(pass).where(and(eq(pass.id, passId), eq(pass.revoked, false)));
      groupId = byPass?.groupId;
    }
    if (!groupId) throw invalid();

    const members = await tx
      .select({
        bookingId: booking.id,
        status: booking.status,
        spotCode: spot.code,
        today: sql<boolean>`${inventoryDay.day} = (now() at time zone ${beach.timezone})::date`,
      })
      .from(booking)
      .innerJoin(inventoryDay, eq(inventoryDay.id, booking.inventoryDayId))
      .innerJoin(spot, eq(spot.id, inventoryDay.spotId))
      .innerJoin(beach, eq(beach.id, booking.beachId))
      .where(eq(booking.groupId, groupId))
      .orderBy(asc(inventoryDay.day));
    if (!members.some((member) => member.status === 'confirmed' || member.status === 'completed')) throw invalid();
    const current = members.find((member) => member.today);
    if (!current) throw new DomainError('wrong_day', 'This booking is for another day');

    const [reserved] = await tx.select().from(booking).where(eq(booking.id, current.bookingId)).for('update');
    if (!reserved || reserved.status !== 'confirmed') throw invalid();

    const target = input.kind === 'entry' ? 'inside' : 'outside_reentry_allowed';
    if (!canTransition('presence', reserved.presence, target)) {
      throw new DomainError('invalid_state', input.kind === 'entry' ? 'This guest is already inside' : 'This guest is not inside');
    }
    await tx.update(booking).set({ presence: target }).where(eq(booking.id, reserved.id));
    await tx.insert(accessEvent).values({ beachId: actor.beachId, bookingId: reserved.id, kind: input.kind, operatorUserId: actor.userId });
    await tx.insert(auditEvent).values({ beachId: actor.beachId, actorUserId: actor.userId, action: `access.${input.kind}`, target: reserved.code, detail: {} });
    const extras = (await groupExtraLines(tx, groupId)).map((line) => ({ name: line.name, quantity: line.quantity }));
    return { code: reserved.code, spotCode: current.spotCode, guestName: reserved.guestName, presence: target, extras };
  });
}

// The day list carries no guest contact: email and phone stay out of it, as
// before B3. They surface only in the payment-requests detail of one booking,
// where the desk composes the message to send by hand.
export interface BookingRow {
  code: string;
  status: (typeof booking.$inferSelect)['status'];
  presence: (typeof booking.$inferSelect)['presence'];
  guestName: string;
  spotCode: string;
  /** Period of the group this day belongs to; from = to for a single day. */
  from: string;
  to: string;
  /** Total of the GROUP (D38): the day list shows the whole of what is owed. */
  totalCents: number;
  /** Aggregate of the succeeded payments of the group (D31): the desk sees what is still owed. */
  paidCents: number;
  remainingCents: number;
  paymentState: PaymentState;
  /** Extras to hand over with the booking (spec §4.2), chosen once per period. */
  extras: { name: { it: string; en: string | null }; quantity: number }[];
}

export function listBookings(db: Database, actor: Actor, day: string): Promise<BookingRow[]> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const rows = await tx
      .select({
        groupId: booking.groupId,
        code: booking.code,
        status: booking.status,
        presence: booking.presence,
        guestName: booking.guestName,
        spotCode: spot.code,
      })
      .from(booking)
      .innerJoin(inventoryDay, eq(inventoryDay.id, booking.inventoryDayId))
      .innerJoin(spot, eq(spot.id, inventoryDay.spotId))
      .where(eq(inventoryDay.day, day))
      .orderBy(asc(booking.code));
    const groupIds = [...new Set(rows.map((row) => row.groupId))];
    const totals = await groupTotalsByGroup(tx, groupIds);
    const lines = await extraLinesByGroup(tx, groupIds);
    const paidOf = await paidCentsByGroup(tx, groupIds);
    return rows.map(({ groupId, ...row }) => {
      const total = totals.get(groupId);
      const totalCents = total?.totalCents ?? 0;
      const paidCents = paidOf.get(groupId) ?? 0;
      return {
        ...row,
        from: total?.from ?? day,
        to: total?.to ?? day,
        totalCents,
        paidCents,
        remainingCents: Math.max(0, totalCents - paidCents),
        paymentState: paymentStateOf(totalCents, paidCents),
        extras: (lines.get(groupId) ?? []).map((line) => ({ name: line.name, quantity: line.quantity })),
      };
    });
  });
}

/** Live total and period per group, in one query: what day lists and cards show. */
export async function groupTotalsByGroup(tx: Transaction, groupIds: string[]): Promise<Map<string, { totalCents: number; from: string; to: string; days: number }>> {
  if (groupIds.length === 0) return new Map();
  const rows = await tx
    .select({
      groupId: booking.groupId,
      liveCents: sql<number>`coalesce(sum(${booking.totalCents}) filter (where ${booking.status} <> 'cancelled'), 0)::int`,
      allCents: sql<number>`coalesce(sum(${booking.totalCents}), 0)::int`,
      liveDays: sql<number>`count(*) filter (where ${booking.status} <> 'cancelled')::int`,
      from: sql<string>`min(${inventoryDay.day})::text`,
      to: sql<string>`max(${inventoryDay.day})::text`,
      days: sql<number>`count(*)::int`,
    })
    .from(booking)
    .innerJoin(inventoryDay, eq(inventoryDay.id, booking.inventoryDayId))
    .where(inArray(booking.groupId, groupIds))
    .groupBy(booking.groupId);
  return new Map(rows.map((row) => [row.groupId, { totalCents: row.liveDays > 0 ? row.liveCents : row.allCents, from: row.from, to: row.to, days: row.days }]));
}

/**
 * Booking taken at the front desk and paid there, for one day or for a period (dal–al,
 * D39). It goes through the same reserve family and the same row locks as a purchase on
 * the website: no channel can jump the queue. The desk picks a hotel convention from a
 * list (its identifier, never a typed code, spec §4.1); the identifier is resolved to
 * the code here and then follows the ordinary path. Extras (spec §4.2) travel the same
 * internal hold: snapshot and ledger movements are exactly those of an online purchase.
 */
export async function deskBooking(
  db: Database,
  actor: Actor,
  input: {
    spotId: string;
    day: string;
    /** Last day of the period; the single day when left out. */
    to?: string | null;
    guestName: string;
    guestEmail?: string | null;
    guestPhone?: string | null;
    conventionId?: string | null;
    extras?: ExtraRequest[];
    /** `now` pays at the desk as today; `later` confirms «da incassare» (spec §4.3): pass at once, residual = total. */
    collect?: 'now' | 'later';
  },
  secret: string,
): Promise<{ code: string }> {
  let promoCode: string | undefined;
  if (input.conventionId) {
    const conventionId = input.conventionId;
    const [deal] = await withBeach(db, actor.beachId, (tx) =>
      tx.select({ code: hotelConvention.code }).from(hotelConvention).where(and(eq(hotelConvention.id, conventionId), conventionAppliesOn(input.day))),
    );
    // Suspended or outside its validity window for the booked day: same refusal as online.
    if (!deal) throw new DomainError('promo_not_applicable', 'This convention cannot be applied to this day');
    promoCode = deal.code;
  }
  const held = await acquireHold(db, actor.beachId, {
    spotId: input.spotId,
    day: input.day,
    to: input.to ?? undefined,
    promoCode,
    extras: input.extras,
    idempotencyKey: `desk-${randomUUID()}`,
    ttlSeconds: 120,
  });
  const guest = { guestName: input.guestName, guestEmail: input.guestEmail?.trim() || null, guestPhone: input.guestPhone ?? null };

  let code: string;
  let totalCents: number;
  if (input.collect === 'later') {
    // «Da incassare» (D31): confirmed at once, pass at once (D5: paying is not
    // entering), the sale recorded at confirmation exactly as today — but NO
    // payment row: the residual equals the group total until the desk collects it.
    const confirmed = await withBeach(db, actor.beachId, async (tx) => {
      const members = await lockedHoldFamily(tx, held.holdId);
      const { group, created } = await createGroupFromHolds(tx, actor.beachId, members, { holdId: held.holdId, ...guest, source: 'desk' });
      for (const [index, member] of members.entries()) {
        await tx.update(hold).set({ status: 'converted' }).where(eq(hold.id, member.held.id));
        await tx.update(inventoryDay).set({ state: 'occupied', activeHoldId: null, updatedAt: sql`now()` }).where(eq(inventoryDay.id, member.day.id));
        await tx.update(booking).set({ status: 'confirmed', confirmedAt: sql`now()` }).where(eq(booking.id, created[index]!.id));
        await recordSale(tx, actor.beachId, { bookingId: created[index]!.id, inventoryDayId: member.day.id, totalCents: created[index]!.totalCents, extrasCents: created[index]!.extrasCents });
      }
      await tx.insert(pass).values({ beachId: actor.beachId, bookingId: created[0]!.id, groupId: group.id });
      await enqueue(tx, actor.beachId, 'booking.confirmed', { bookingId: created[0]!.id });
      return { code: group.code, totalCents: created.reduce((sum, row) => sum + row.totalCents, 0) };
    });
    code = confirmed.code;
    totalCents = confirmed.totalCents;
  } else {
    const started = await startCheckout(db, actor.beachId, { holdId: held.holdId, ...guest, source: 'desk' }, secret);
    const outcome = await applyPaymentOutcome(db, { provider: 'desk', eventId: `desk-${started.bookingId}`, reference: started.payment.reference, outcome: 'succeeded' });
    if (outcome !== 'confirmed') throw new DomainError('inventory_conflict', 'This spot has just been taken');
    code = started.code;
    totalCents = started.payment.amountCents;
  }
  await withActor(db, actor.beachId, actor.userId, (tx) =>
    tx.insert(auditEvent).values({
      beachId: actor.beachId,
      actorUserId: actor.userId,
      action: 'booking.desk',
      target: code,
      detail: { totalCents, from: input.day, to: input.to ?? input.day, conventionId: input.conventionId ?? null, collect: input.collect ?? 'now' },
    }),
  );
  return { code };
}

/**
 * Collects (part of) the outstanding balance of a group at the front desk: a
 * `desk` payment that succeeds at once. The ledger is untouched — the sale was
 * recorded in full at confirmation; the collection lives in the payment
 * aggregate of the group (D31, D38).
 */
export function collectAtDesk(db: Database, actor: Actor, input: { code: string; amountCents: number }): Promise<{ paidCents: number; remainingCents: number; paymentState: PaymentState }> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new DomainError('invalid_state', 'The amount must be a positive amount of cents');
    const group = await groupByCode(tx, input.code);
    await lockGroup(tx, group.id);
    const members = await bookingsOfGroup(tx, group.id);
    if (!members.some((member) => member.booking.status === 'confirmed' || member.booking.status === 'completed')) {
      throw new DomainError('invalid_state', 'Only a confirmed booking can be collected');
    }
    const totalCents = liveTotalCents(members);
    const residual = totalCents - (await paidCentsOfGroup(tx, group.id));
    if (input.amountCents > residual) throw new DomainError('invalid_state', 'The amount exceeds the outstanding balance');
    await tx.insert(payment).values({
      beachId: actor.beachId,
      bookingId: members[0]!.booking.id,
      groupId: group.id,
      provider: 'desk',
      providerRef: `desk_${randomBytes(12).toString('hex')}`,
      status: 'succeeded',
      amountCents: input.amountCents,
      purpose: 'desk',
    });
    await tx.insert(auditEvent).values({ beachId: actor.beachId, actorUserId: actor.userId, action: 'booking.collect', target: group.code, detail: { amountCents: input.amountCents } });
    const paidCents = await paidCentsOfGroup(tx, group.id);
    return { paidCents, remainingCents: Math.max(0, totalCents - paidCents), paymentState: paymentStateOf(totalCents, paidCents) };
  });
}

/**
 * Adds extras to a sale already made (spec §4.3, closing §4.2): the snapshot of
 * the GROUP grows, the first day's totals grow with it (extras ride the first
 * day, D38), a dedicated `extras_revenue` movement is recorded together with the
 * grown sale, and the collection happens at the desk now (`desk` payment) or
 * stays in the residual of the group. A service already on the group keeps its
 * frozen unit price: the new quantity is priced at that frozen price, a new
 * service at the catalogue price of today. Only while the group has a confirmed
 * day and its last day is not over.
 */
export function addExtrasToBooking(
  db: Database,
  actor: Actor,
  input: { code: string; extras: ExtraRequest[]; collect: 'desk' | 'later' },
): Promise<{ addedCents: number; totalCents: number; paidCents: number; remainingCents: number; paymentState: PaymentState; extras: ExtraLine[] }> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    if (input.extras.length === 0) throw new DomainError('invalid_state', 'Nothing to add');
    const group = await groupByCode(tx, input.code);
    await lockGroup(tx, group.id);
    const members = await bookingsOfGroup(tx, group.id);
    const lead = members[0];
    if (!lead || !members.some((member) => member.booking.status === 'confirmed')) {
      throw new DomainError('invalid_state', 'Only a confirmed booking can take more extras');
    }
    const lastDay = members[members.length - 1]!.day;
    const [when] = await tx
      .select({ past: sql<boolean>`${lastDay}::date < (now() at time zone ${beach.timezone})::date` })
      .from(beach)
      .where(eq(beach.id, actor.beachId));
    if (!when || when.past) throw new DomainError('invalid_state', 'This booking is for a day that is over');

    const { lines } = await priceExtras(tx, input.extras);
    const existing = await tx.select().from(bookingExtra).where(eq(bookingExtra.groupId, group.id));
    const byService = new Map(existing.map((row) => [row.serviceId, row]));
    let addedCents = 0;
    for (const line of lines) {
      const already = byService.get(line.serviceId);
      if (already) {
        if (already.quantity + line.quantity > 20) throw new DomainError('invalid_state', 'Each extra quantity must stay within 20');
        await tx.update(bookingExtra).set({ quantity: already.quantity + line.quantity }).where(eq(bookingExtra.id, already.id));
        addedCents += already.unitPriceCents * line.quantity;
      } else {
        await tx
          .insert(bookingExtra)
          .values({ beachId: actor.beachId, bookingId: lead.booking.id, groupId: group.id, serviceId: line.serviceId, quantity: line.quantity, unitPriceCents: line.unitPriceCents });
        addedCents += line.subtotalCents;
      }
    }
    await tx
      .update(booking)
      .set({ extrasCents: lead.booking.extrasCents + addedCents, totalCents: lead.booking.totalCents + addedCents })
      .where(eq(booking.id, lead.booking.id));
    // The sale grows: the dedicated extras movement and the grown sale amount are
    // both recorded, mirroring what recordSale wrote at confirmation.
    await tx.insert(ledgerEntry).values([
      { beachId: actor.beachId, bookingId: lead.booking.id, kind: 'payment_received', amountCents: addedCents },
      { beachId: actor.beachId, bookingId: lead.booking.id, kind: 'extras_revenue', party: 'beach_club' as const, amountCents: addedCents },
    ]);
    if (input.collect === 'desk') {
      await tx.insert(payment).values({
        beachId: actor.beachId,
        bookingId: lead.booking.id,
        groupId: group.id,
        provider: 'desk',
        providerRef: `desk_${randomBytes(12).toString('hex')}`,
        status: 'succeeded',
        amountCents: addedCents,
        purpose: 'desk',
      });
    }
    await tx.insert(auditEvent).values({
      beachId: actor.beachId,
      actorUserId: actor.userId,
      action: 'booking.extras',
      target: group.code,
      detail: { addedCents, collect: input.collect, extras: input.extras.map((entry) => ({ serviceId: entry.serviceId, quantity: entry.quantity })) },
    });
    const totalCents = liveTotalCents(members) + addedCents;
    const paidCents = await paidCentsOfGroup(tx, group.id);
    return {
      addedCents,
      totalCents,
      paidCents,
      remainingCents: Math.max(0, totalCents - paidCents),
      paymentState: paymentStateOf(totalCents, paidCents),
      extras: await groupExtraLines(tx, group.id),
    };
  });
}

/**
 * Moves one day of a confirmed group to another spot of the same day («Sposta»
 * stays per day, D38). A group of several days needs the day named; the single
 * day keeps working without it. The new spot is taken and the old one released
 * in one transaction; rows are locked in a fixed order to avoid deadlocks.
 */
export function moveBooking(db: Database, actor: Actor, input: { code: string; spotId: string; day?: string | null }): Promise<void> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const group = await groupByCode(tx, input.code);
    const members = await bookingsOfGroup(tx, group.id);
    const target = input.day ? members.find((member) => member.day === input.day) : members.length === 1 ? members[0] : undefined;
    if (!target) {
      if (!input.day && members.length > 1) throw new DomainError('invalid_state', 'This booking covers several days: name the day to move');
      throw new DomainError('not_found', 'Booking not found');
    }
    const found = target.booking;
    const [current] = await tx.select({ day: inventoryDay.day, spotId: inventoryDay.spotId }).from(inventoryDay).where(eq(inventoryDay.id, found.inventoryDayId));
    if (!current) throw new DomainError('not_found', 'Booking not found');
    if (current.spotId === input.spotId) return;

    const rows = await tx
      .select()
      .from(inventoryDay)
      .where(and(eq(inventoryDay.day, current.day), sql`${inventoryDay.spotId} in (${current.spotId}, ${input.spotId})`))
      .orderBy(asc(inventoryDay.id))
      .for('update');
    const from = rows.find((row) => row.spotId === current.spotId);
    const to = rows.find((row) => row.spotId === input.spotId);
    if (!to) throw new DomainError('not_found', 'The new spot is not published on this day');
    const [reserved] = await tx.select().from(booking).where(eq(booking.id, found.id)).for('update');
    if (!from || !reserved || reserved.status !== 'confirmed' || reserved.inventoryDayId !== from.id) throw new DomainError('invalid_state', 'Only a confirmed booking can be moved');
    if (to.state !== 'available') throw new DomainError('inventory_conflict', 'The new spot is not free');

    await tx.update(inventoryDay).set({ state: 'occupied', updatedAt: sql`now()` }).where(eq(inventoryDay.id, to.id));
    await tx.update(booking).set({ inventoryDayId: to.id }).where(eq(booking.id, reserved.id));
    await tx.update(inventoryDay).set({ state: 'available', updatedAt: sql`now()` }).where(eq(inventoryDay.id, from.id));
    await tx.insert(auditEvent).values({ beachId: actor.beachId, actorUserId: actor.userId, action: 'booking.move', target: reserved.code, detail: { day: current.day, from: from.spotId, to: to.spotId } });
  });
}

/**
 * The beach club cancels a booking group (closure, bad weather, a mistake): the
 * WHOLE period is treated (D40). Every day not yet matured goes back on sale,
 * the pass stops working, the shares of the cancelled days are reversed with the
 * compensating entries of before, the extras are refunded only when no day has
 * matured, and the refund covers what was really paid, up to what was cancelled.
 */
export function cancelByBeachClub(db: Database, actor: Actor, input: { code: string; reason: string }): Promise<void> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const group = await groupByCode(tx, input.code);
    await lockGroup(tx, group.id);
    const read = await bookingsOfGroup(tx, group.id);
    const lockedDays = await tx
      .select()
      .from(inventoryDay)
      .where(inArray(inventoryDay.id, read.map((member) => member.booking.inventoryDayId)))
      .orderBy(asc(inventoryDay.id))
      .for('update');
    const dayOf = new Map(lockedDays.map((row) => [row.id, row]));
    // Re-read after the locks: nothing can change these rows under them.
    const members = await bookingsOfGroup(tx, group.id);
    const targets = members.filter((member) => member.booking.status === 'confirmed');
    if (targets.length === 0) throw new DomainError('invalid_state', 'Only a confirmed booking can be cancelled');
    const matured = members.some((member) => member.booking.status === 'completed');

    for (const member of targets) {
      const day = dayOf.get(member.booking.inventoryDayId);
      await tx.update(booking).set({ status: 'cancelled' }).where(eq(booking.id, member.booking.id));
      if (day && day.state === 'occupied') {
        await tx.update(inventoryDay).set({ state: 'available', updatedAt: sql`now()` }).where(eq(inventoryDay.id, day.id));
      }
      if (member.booking.promotionId) {
        await tx.update(promotion).set({ committedUses: sql`${promotion.committedUses} - 1` }).where(eq(promotion.id, member.booking.promotionId));
      }
    }
    await tx.update(pass).set({ revoked: true }).where(eq(pass.groupId, group.id));

    // The extras of the period are refunded only when no day has matured (D40);
    // they sit on the first day, so a matured first day keeps them earned.
    const cancelledExtrasCents = targets.reduce((sum, member) => sum + member.booking.extrasCents, 0);
    const refundableCents = targets.reduce((sum, member) => sum + member.booking.totalCents, 0) - (matured ? cancelledExtrasCents : 0);

    // The refund is what was really paid (D31), up to what was cancelled: the
    // succeeded payments of the group, newest first, each cut to what is left to
    // give back. A group taken «da incassare» and never collected refunds nothing.
    const paidRows = await tx
      .select()
      .from(payment)
      .where(and(eq(payment.groupId, group.id), eq(payment.status, 'succeeded')))
      .orderBy(desc(payment.createdAt));
    const paidSum = paidRows.reduce((sum, row) => sum + row.amountCents, 0);
    let leftToRefund = Math.min(paidSum, refundableCents);
    const refundTotal = leftToRefund;
    for (const row of paidRows) {
      if (leftToRefund <= 0) break;
      const amountCents = Math.min(leftToRefund, row.amountCents);
      await tx.insert(refund).values({ beachId: actor.beachId, paymentId: row.id, amountCents, reason: input.reason });
      leftToRefund -= amountCents;
    }
    // A pending payment request can no longer be paid: its late outcome, if any,
    // walks the refund path of the webhook.
    await tx
      .update(paymentRequest)
      .set({ status: 'cancelled', closedAt: sql`now()` })
      .where(and(eq(paymentRequest.groupId, group.id), eq(paymentRequest.status, 'pending')));
    const reversed = await tx
      .update(allocation)
      .set({ state: 'adjusted' })
      .where(inArray(allocation.bookingId, targets.map((member) => member.booking.id)))
      .returning({ bookingId: allocation.bookingId, party: allocation.party, amountCents: allocation.amountCents });
    // The reversal is comprehensive per cancelled day (discounted spot + extras where
    // refundable); the extras movement is reversed like the shares are.
    const lead = targets[0]!;
    const entries = [
      ...reversed.map((row) => ({ beachId: actor.beachId, bookingId: row.bookingId, kind: 'adjustment', party: row.party, amountCents: -row.amountCents })),
      ...(!matured && cancelledExtrasCents > 0
        ? [{ beachId: actor.beachId, bookingId: lead.booking.id, kind: 'adjustment', party: 'beach_club' as const, amountCents: -cancelledExtrasCents }]
        : []),
      ...(refundTotal > 0 ? [{ beachId: actor.beachId, bookingId: lead.booking.id, kind: 'refund_due', amountCents: -refundTotal }] : []),
    ];
    if (entries.length > 0) await tx.insert(ledgerEntry).values(entries);
    await enqueue(tx, actor.beachId, 'booking.cancelled', { bookingId: lead.booking.id });
    await tx.insert(auditEvent).values({
      beachId: actor.beachId,
      actorUserId: actor.userId,
      action: 'booking.cancel',
      target: group.code,
      detail: { reason: input.reason, days: targets.length },
    });
  });
}
