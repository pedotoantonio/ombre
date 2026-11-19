import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { and, asc, desc, eq, inArray, like, or, sql } from 'drizzle-orm';
import { canTransition, depositCents } from '@ombre/shared';
import { withActor, withBeach, withUser, type Database, type Transaction } from './client';
import { extraLinesByGroup, groupExtraLines } from './extras';
import { acquireHold, acquireHoldWithin, conventionAppliesOn, DomainError, periodDays, priceExtras, type ExtraLine, type ExtraRequest } from './inventory';
import { enqueue } from './jobs';
import { recordRefundDue, recordSale } from './ledger';
import type { Actor } from './manage';
import { apportionPaid, orderQuotaByGroup, paidCentsByGroup, paidCentsOfGroup, paymentStateOf, type PaymentState } from './payments';
import { cancellationDeadlines } from './settings';
import { accessEvent, allocation, auditEvent, beach, beachZone, booking, bookingExtra, bookingGroup, cart, cartItem, cartItemExtra, hold, holdExtra, hotelConvention, inventoryDay, ledgerEntry, orderGroup, pass, payment, paymentRequest, promotion, providerEvent, refund, spot } from './schema';

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
/** Lets the orderer read the order summary without an account (D46), like the booking token. */
export const orderAccessToken = (secret: string, orderId: string): string => sign(secret, 'order', orderId);
export const passCredential = (secret: string, passId: string): string => `${passId}.${sign(secret, 'pass', passId).slice(0, 32)}`;

// The payment aggregate (D31 at group level, D38, D46) lives in payments.ts,
// shared with the mail worker; this file keeps the booking paths that use it.

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
async function createGroupFromHolds(tx: Transaction, beachId: string, members: FamilyMember[], request: CheckoutRequest & { userId?: string | null; orderId?: string | null }) {
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

  const [group] = await tx.insert(bookingGroup).values({ beachId, code, userId: request.userId ?? null, orderId: request.orderId ?? null }).returning();
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
    // «Caparra adesso, saldo al lido» (D52): the ONLINE payment at confirmation is
    // the deposit of the group; the desk keeps collecting whole amounts as before.
    const [club] = await tx.select({ paymentMode: beach.paymentMode, depositPercent: beach.depositPercent }).from(beach).where(eq(beach.id, beachId));
    const amountCents = provider !== 'desk' && club?.paymentMode === 'deposit' ? depositCents(totalCents, club.depositPercent) : totalCents;
    const reference = `${provider === 'desk' ? 'desk' : 'sbx'}_${randomBytes(12).toString('hex')}`;
    await tx
      .insert(payment)
      .values({ beachId, bookingId: created[0]!.id, groupId: group.id, provider, providerRef: reference, status: 'in_progress', amountCents, purpose: provider === 'desk' ? 'desk' : 'checkout' });
    return {
      bookingId: created[0]!.id,
      code: group.code,
      accessToken: bookingAccessToken(secret, created[0]!.id),
      status: created[0]!.status,
      payment: { provider, reference, amountCents },
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
    // An order payment (D46) settles EVERY group of the order together, all or nothing.
    if (found.orderId !== null) return settleOrderPayment(tx, beachId, notice.outcome, found);

    const members = await bookingsOfGroup(tx, found.groupId!);
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
      await tx.insert(pass).values({ beachId, bookingId: lead.reserved.id, groupId: found.groupId! });
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
  // A request payment always names its group and its first-day booking.
  const groupId = found.groupId!;
  const bookingId = found.bookingId!;
  await lockGroup(tx, groupId);
  const [paid] = await tx.select().from(payment).where(eq(payment.id, found.id)).for('update');
  if (!paid || paid.status === 'succeeded' || paid.status === 'failed') return 'ignored';
  const settle = (status: 'succeeded' | 'failed') => tx.update(payment).set({ status, updatedAt: sql`now()` }).where(eq(payment.id, paid.id));

  if (outcome === 'failed') {
    // The provider refused: the request stays pending and can be paid again until it expires.
    await settle('failed');
    return 'request_failed';
  }

  const [request] = paid.requestId ? await tx.select().from(paymentRequest).where(eq(paymentRequest.id, paid.requestId)).for('update') : [];
  const members = await bookingsOfGroup(tx, groupId);
  const alive = members.some((member) => member.booking.status === 'confirmed' || member.booking.status === 'completed');
  const residual = liveTotalCents(members) - (await paidCentsOfGroup(tx, groupId));
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
  await recordRefundDue(tx, beachId, bookingId, paid.amountCents);
  await enqueue(tx, beachId, 'refund.due', { bookingId });
  return 'refund_due';
}

/**
 * Outcome of the single payment of an order (D46): all its groups settle
 * together. A success confirms every group — holds converted, days occupied,
 * the sale recorded per day, one pass and one `booking.confirmed` per group —
 * only when EVERY day of EVERY group is still ours or free; otherwise, and on a
 * failed outcome, the whole order is cancelled, with the full refund recorded
 * on a late loss exactly like the single-group path.
 */
async function settleOrderPayment(tx: Transaction, beachId: string, outcome: 'succeeded' | 'failed', found: typeof payment.$inferSelect): Promise<PaymentOutcome> {
  const groups = await tx.select().from(bookingGroup).where(eq(bookingGroup.orderId, found.orderId!)).orderBy(asc(bookingGroup.code));
  if (groups.length === 0) return 'ignored';
  const perGroup: { group: typeof bookingGroup.$inferSelect; members: { booking: typeof booking.$inferSelect; day: string }[] }[] = [];
  for (const group of groups) perGroup.push({ group, members: await bookingsOfGroup(tx, group.id) });
  const everyBooking = perGroup.flatMap((entry) => entry.members.map((member) => member.booking));
  if (everyBooking.length === 0) return 'ignored';

  const lockedDays = await tx
    .select()
    .from(inventoryDay)
    .where(inArray(inventoryDay.id, everyBooking.map((member) => member.inventoryDayId)))
    .orderBy(asc(inventoryDay.id))
    .for('update');
  const dayOf = new Map(lockedDays.map((row) => [row.id, row]));
  const [paid] = await tx.select().from(payment).where(eq(payment.id, found.id)).for('update');
  if (!paid || paid.status === 'succeeded' || paid.status === 'failed') return 'ignored';

  const pairs = everyBooking.map((reserved) => ({ reserved, day: dayOf.get(reserved.inventoryDayId) }));
  if (pairs.some((pair) => !pair.day)) return 'ignored';
  const settle = (status: 'succeeded' | 'failed') => tx.update(payment).set({ status, updatedAt: sql`now()` }).where(eq(payment.id, paid.id));
  const ours = (pair: { reserved: typeof booking.$inferSelect; day?: typeof inventoryDay.$inferSelect }) =>
    pair.day!.state === 'held' && pair.day!.activeHoldId === pair.reserved.holdId;

  const cancelEverything = async () => {
    for (const pair of pairs) {
      await tx.update(booking).set({ status: 'cancelled' }).where(eq(booking.id, pair.reserved.id));
      if (ours(pair)) await freeDay(tx, pair.day!.id, pair.reserved.holdId, pair.reserved.promotionId);
    }
    for (const entry of perGroup) {
      await enqueue(tx, beachId, 'booking.cancelled', { bookingId: entry.members[0]!.booking.id });
    }
  };

  if (outcome === 'failed') {
    await settle('failed');
    await cancelEverything();
    return 'cancelled';
  }

  await settle('succeeded');
  if (pairs.every((pair) => ours(pair) || pair.day!.state === 'available')) {
    for (const entry of perGroup) {
      for (const member of entry.members) {
        const day = dayOf.get(member.booking.inventoryDayId)!;
        await tx.update(hold).set({ status: 'converted' }).where(eq(hold.id, member.booking.holdId));
        await tx.update(inventoryDay).set({ state: 'occupied', activeHoldId: null, updatedAt: sql`now()` }).where(eq(inventoryDay.id, day.id));
        await tx.update(booking).set({ status: 'confirmed', confirmedAt: sql`now()` }).where(eq(booking.id, member.booking.id));
        await recordSale(tx, beachId, { bookingId: member.booking.id, inventoryDayId: day.id, totalCents: member.booking.totalCents, extrasCents: member.booking.extrasCents });
      }
      await tx.insert(pass).values({ beachId, bookingId: entry.members[0]!.booking.id, groupId: entry.group.id });
      await enqueue(tx, beachId, 'booking.confirmed', { bookingId: entry.members[0]!.booking.id });
    }
    return 'confirmed';
  }

  // A day of ANY item went to someone else while the payment was in flight: the
  // order was all or nothing, so everything is given back and the money returns.
  await cancelEverything();
  const leadBookingId = perGroup[0]!.members[0]!.booking.id;
  await tx.insert(refund).values({ beachId, paymentId: paid.id, amountCents: paid.amountCents, reason: 'inventory_unavailable' });
  await recordRefundDue(tx, beachId, leadBookingId, paid.amountCents);
  await enqueue(tx, beachId, 'refund.due', { bookingId: leadBookingId });
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
  /**
   * What the confirmation asked for (D52): the opened payment — the deposit with
   * `payment_mode = 'deposit'`, the whole total otherwise — or the order quota for
   * a group born from an order; zero for a desk booking taken «da incassare».
   */
  dueNowCents: number;
  /** total − dueNow: the balance to settle at the beach club. */
  balanceCents: number;
  presence: (typeof booking.$inferSelect)['presence'];
  guestName: string;
  /** First day of the period; `from`–`to` and `days` carry the whole of it. */
  day: string;
  from: string;
  to: string;
  days: BookingDayView[];
  spot: { code: string; zoneName: string | null; rowNumber: number; umbrellas: number; sunbeds: number };
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
      .select({ booking, spot, zoneName: beachZone.name })
      .from(booking)
      .innerJoin(inventoryDay, eq(inventoryDay.id, booking.inventoryDayId))
      .innerJoin(spot, eq(spot.id, inventoryDay.spotId))
      .leftJoin(beachZone, eq(beachZone.id, spot.namedZoneId))
      .where(eq(booking.id, bookingId));
    if (!row) throw new DomainError('not_found', 'Booking not found');
    const members = await bookingsOfGroup(tx, row.booking.groupId);
    const [issued] = await tx.select().from(pass).where(eq(pass.groupId, row.booking.groupId));
    // One group now carries many payments (D31): the one opened with the group
    // keeps feeding the legacy fields, so the online checkout answer stays
    // exactly as it was; request payments only enter the aggregate.
    const payments = await tx.select().from(payment).where(eq(payment.groupId, row.booking.groupId)).orderBy(asc(payment.createdAt));
    const opened = payments.find((entry) => entry.purpose !== 'request') ?? null;
    // A group born from an order (D46) adds the quota its order payment covered.
    const quota = (await orderQuotaByGroup(tx, [row.booking.groupId])).get(row.booking.groupId) ?? 0;
    const paidCents = payments.filter((entry) => entry.status === 'succeeded').reduce((sum, entry) => sum + entry.amountCents, 0) + quota;

    const status = groupStatusOf(members.map((member) => member.booking.status));
    const live = members.filter((member) => member.booking.status !== 'cancelled');
    const counted = live.length > 0 ? live : members;
    const totalCents = counted.reduce((sum, member) => sum + member.booking.totalCents, 0);
    const listPrice = counted.reduce((sum, member) => sum + member.booking.listPriceCents, 0);
    const discount = counted.reduce((sum, member) => sum + member.booking.discountCents, 0);
    const extrasCents = counted.reduce((sum, member) => sum + member.booking.extrasCents, 0);
    const usable = status === 'confirmed' && issued && !issued.revoked;
    const dueNowCents = opened ? opened.amountCents : quota;
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
      dueNowCents,
      balanceCents: Math.max(0, totalCents - dueNowCents),
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
      spot: { code: row.spot.code, zoneName: row.zoneName, rowNumber: row.spot.rowNumber, umbrellas: row.spot.umbrellas, sunbeds: row.spot.sunbeds },
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
  /** Name of the manager's named zone (D50); null when the spot belongs to none. */
  zoneName: string | null;
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
        zoneName: beachZone.name,
        today: sql<boolean>`${inventoryDay.day} = (now() at time zone ${beach.timezone})::date`,
      })
      .from(booking)
      .innerJoin(inventoryDay, eq(inventoryDay.id, booking.inventoryDayId))
      .innerJoin(spot, eq(spot.id, inventoryDay.spotId))
      .leftJoin(beachZone, eq(beachZone.id, spot.namedZoneId))
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
    return { code: reserved.code, spotCode: current.spotCode, zoneName: current.zoneName, guestName: reserved.guestName, presence: target, extras };
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
  /** Name of the manager's named zone (D50); null when the spot belongs to none. */
  zoneName: string | null;
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
        zoneName: beachZone.name,
      })
      .from(booking)
      .innerJoin(inventoryDay, eq(inventoryDay.id, booking.inventoryDayId))
      .innerJoin(spot, eq(spot.id, inventoryDay.spotId))
      .leftJoin(beachZone, eq(beachZone.id, spot.namedZoneId))
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
    const cancelled = await cancelGroupWithin(tx, actor.beachId, group, input.reason);
    await tx.insert(auditEvent).values({
      beachId: actor.beachId,
      actorUserId: actor.userId,
      action: 'booking.cancel',
      target: group.code,
      detail: { reason: input.reason, days: cancelled.days },
    });
  });
}

/**
 * The heart of a group cancellation, shared by the beach club's path above and
 * the owner's path below (D53): days back on sale, pass revoked, shares
 * reversed, the refund of what was really paid recorded, the queue fed. The
 * caller writes its own audit row.
 */
async function cancelGroupWithin(tx: Transaction, beachId: string, group: typeof bookingGroup.$inferSelect, reason: string): Promise<{ days: number }> {
  await lockGroup(tx, group.id);
  {
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
    // give back. A group born from an order (D46) also draws from the order's
    // payments, up to its own quota. A group taken «da incassare» and never
    // collected refunds nothing.
    const paidRows = await tx
      .select()
      .from(payment)
      .where(and(group.orderId ? or(eq(payment.groupId, group.id), eq(payment.orderId, group.orderId)) : eq(payment.groupId, group.id), eq(payment.status, 'succeeded')))
      .orderBy(desc(payment.createdAt));
    const paidSum = paidRows.reduce((sum, row) => sum + row.amountCents, 0);
    let leftToRefund = Math.min(paidSum, refundableCents);
    const refundTotal = leftToRefund;
    for (const row of paidRows) {
      if (leftToRefund <= 0) break;
      const amountCents = Math.min(leftToRefund, row.amountCents);
      await tx.insert(refund).values({ beachId, paymentId: row.id, amountCents, reason });
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
      ...reversed.map((row) => ({ beachId, bookingId: row.bookingId, kind: 'adjustment', party: row.party, amountCents: -row.amountCents })),
      ...(!matured && cancelledExtrasCents > 0
        ? [{ beachId, bookingId: lead.booking.id, kind: 'adjustment', party: 'beach_club' as const, amountCents: -cancelledExtrasCents }]
        : []),
      ...(refundTotal > 0 ? [{ beachId, bookingId: lead.booking.id, kind: 'refund_due', amountCents: -refundTotal }] : []),
    ];
    if (entries.length > 0) await tx.insert(ledgerEntry).values(entries);
    await enqueue(tx, beachId, 'booking.cancelled', { bookingId: lead.booking.id });
    return { days: targets.length };
  }
}

/**
 * The owner cancels their own stay from the account (D53): only a confirmed
 * group with no matured day, and only while now is within the deadline —
 * midnight of the arrival day minus the club's hours, in the club's zone. The
 * refund is full (deposit included) through the very mechanics of the beach
 * club's path above; audit and `booking.cancelled` queue as there.
 */
export async function cancelByOwner(db: Database, input: { userId: string; groupId: string }): Promise<void> {
  // Ownership through the owner RLS path (D47): someone else's group is simply absent.
  const owned = await withUser(db, input.userId, async (tx) => {
    const [row] = await tx
      .select({ beachId: bookingGroup.beachId })
      .from(bookingGroup)
      .where(and(eq(bookingGroup.id, input.groupId), eq(bookingGroup.userId, input.userId)));
    return row ?? null;
  });
  if (!owned) throw new DomainError('not_found', 'Booking not found');

  return withActor(db, owned.beachId, input.userId, async (tx) => {
    const [group] = await tx.select().from(bookingGroup).where(eq(bookingGroup.id, input.groupId));
    if (!group) throw new DomainError('not_found', 'Booking not found');
    const members = await bookingsOfGroup(tx, group.id);
    const live = members.filter((member) => member.booking.status !== 'cancelled');
    // Not confirmed, or a day already matured: the page says to turn to the beach club.
    if (live.length === 0 || live.some((member) => member.booking.status !== 'confirmed')) {
      throw new DomainError('cancel_not_allowed', 'This booking cannot be cancelled from the account');
    }
    const arrival = live[0]!.day;
    const clock = await tx.execute<{ within: boolean; today: string }>(sql`
      select now() <= ((${arrival}::date::timestamp at time zone b.timezone) - make_interval(hours => b.cancel_deadline_hours)) as within,
        (now() at time zone b.timezone)::date::text as today
      from beach b where b.id = ${group.beachId}
    `);
    const now = clock.rows[0];
    if (!now || live.some((member) => member.day < now.today)) {
      throw new DomainError('cancel_not_allowed', 'This booking cannot be cancelled from the account');
    }
    if (!now.within) throw new DomainError('cancel_deadline_passed', 'The free-cancellation deadline has passed: turn to the beach club');

    const cancelled = await cancelGroupWithin(tx, group.beachId, group, 'owner_cancelled');
    await tx.insert(auditEvent).values({
      beachId: group.beachId,
      actorUserId: input.userId,
      action: 'booking.cancel',
      target: group.code,
      detail: { reason: 'owner_cancelled', by: 'owner', days: cancelled.days },
    });
  });
}

// ---- The order (D46): «Conferma e paga» the whole cart, all or nothing ----

function errorCode(error: unknown): string | undefined {
  const candidate = error as { code?: string; cause?: { code?: string } } | null;
  return candidate?.code ?? candidate?.cause?.code;
}

export interface OrderItemResult {
  /** Code of the booking group born from this cart item. */
  code: string;
  spotCode: string;
  /** Name of the manager's named zone (D50); null when the spot belongs to none. */
  zoneName: string | null;
  from: string;
  to: string;
}

export interface OrderResult {
  orderId: string;
  code: string;
  totalCents: number;
  /** What the single payment asks for now (D52): the sum of the items' deposits, or the whole total. */
  dueNowCents: number;
  /** total − dueNow: what remains to settle at the beach club. */
  balanceCents: number;
  payment: { provider: string; reference: string; amountCents: number };
  /** Lets the orderer read the order summary without an account. */
  accessToken: string;
  items: OrderItemResult[];
}

export interface ConfirmOrderInput {
  cartId: string;
  guestName: string;
  guestEmail: string;
  locale?: 'it' | 'en';
  /** The signed-in orderer, when the cart itself carries no account. */
  userId?: string | null;
}

/**
 * Confirms the whole cart in ONE transaction (D46): every item's period is
 * reserved through the ordinary hold families — one shared expiry, every day
 * locked in identifier order first — and ONE busy day rolls the whole thing
 * back, naming the offending item. Then the order is born (ORD-YYMMDD-NNN under
 * its own advisory lock), one booking group per item with its own code — the
 * item's holder as guest name, the orderer's email on every day — and one
 * single `sandbox` payment on the order total. The cart is deleted on success.
 */
export async function confirmOrder(db: Database, beachId: string, input: ConfirmOrderInput, secret: string, ttlSeconds: number): Promise<OrderResult> {
  try {
    return await withBeach(db, beachId, async (tx) => {
      const [basket] = await tx.select().from(cart).where(eq(cart.id, input.cartId));
      if (!basket) throw new DomainError('not_found', 'Cart not found');
      const items = await tx
        .select({ item: cartItem, spotCode: spot.code, zoneName: beachZone.name })
        .from(cartItem)
        .innerJoin(spot, eq(spot.id, cartItem.spotId))
        .leftJoin(beachZone, eq(beachZone.id, spot.namedZoneId))
        .where(eq(cartItem.cartId, input.cartId))
        .orderBy(asc(cartItem.createdAt), asc(cartItem.id));
      if (items.length === 0) throw new DomainError('invalid_state', 'The cart is empty');
      const extrasRows = await tx
        .select()
        .from(cartItemExtra)
        .where(inArray(cartItemExtra.cartItemId, items.map((entry) => entry.item.id)));
      const extrasOf = new Map<string, ExtraRequest[]>();
      for (const row of extrasRows) {
        const list = extrasOf.get(row.cartItemId) ?? [];
        list.push({ serviceId: row.serviceId, quantity: row.quantity });
        extrasOf.set(row.cartItemId, list);
      }

      // Every day of every item is locked first, in identifier order like every
      // multi-day path: two confirmations of overlapping carts queue up cleanly.
      await tx
        .select({ id: inventoryDay.id })
        .from(inventoryDay)
        .where(or(...items.map(({ item }) => and(eq(inventoryDay.spotId, item.spotId), inArray(inventoryDay.day, periodDays(item.dayFrom, item.dayTo))))))
        .orderBy(asc(inventoryDay.id))
        .for('update');

      let totalCents = 0;
      const holds: { holdId: string; from: string; to: string }[] = [];
      const perItemTotals: number[] = [];
      for (const [index, { item, spotCode }] of items.entries()) {
        try {
          const held = await acquireHoldWithin(tx, beachId, {
            spotId: item.spotId,
            day: item.dayFrom,
            to: item.dayTo,
            promoCode: item.promoCode,
            extras: extrasOf.get(item.id) ?? [],
            idempotencyKey: `order-${input.cartId}-${index}`,
            // One shared ttl: now() is transaction-stable, so every family expires together.
            ttlSeconds,
          });
          totalCents += held.quote.total;
          perItemTotals.push(held.quote.total);
          holds.push({ holdId: held.holdId, from: held.from, to: held.to });
        } catch (error) {
          if (error instanceof DomainError && (error.code === 'inventory_conflict' || error.code === 'not_found' || error.code === 'hold_expired')) {
            const period = item.dayFrom === item.dayTo ? item.dayFrom : `${item.dayFrom}–${item.dayTo}`;
            throw new DomainError('order_item_unavailable', `Spot ${spotCode} is no longer available for ${period}: remove or change that item`);
          }
          throw error;
        }
      }

      // One numbering per beach club and day of creation: ORD-YYMMDD-NNN. The
      // unique constraint on order_group is the backstop.
      const [clock] = await tx.select({ today: sql<string>`(now() at time zone ${beach.timezone})::date::text` }).from(beach).where(eq(beach.id, beachId));
      const today = clock!.today;
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${beachId}/order/${today}`}, 0))`);
      const stamp = today.slice(2).replaceAll('-', '');
      const [numbered] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(orderGroup)
        .where(like(orderGroup.code, `ORD-${stamp}-%`));
      const code = `ORD-${stamp}-${String((numbered?.n ?? 0) + 1).padStart(3, '0')}`;

      const guestEmail = input.guestEmail.toLowerCase();
      const userId = basket.userId ?? input.userId ?? null;
      const [order] = await tx
        .insert(orderGroup)
        .values({ beachId, code, guestName: input.guestName, guestEmail, userId, locale: input.locale ?? 'it', totalCents })
        .returning();
      if (!order) throw new Error('order was not created');

      const created: OrderItemResult[] = [];
      for (const [index, { item, spotCode, zoneName }] of items.entries()) {
        const members = await lockedHoldFamily(tx, holds[index]!.holdId);
        const { group } = await createGroupFromHolds(tx, beachId, members, {
          holdId: holds[index]!.holdId,
          // The item's holder, or the orderer when the field was left empty (D46).
          guestName: item.guestName.trim() || input.guestName,
          guestEmail,
          locale: input.locale ?? 'it',
          source: 'online',
          userId,
          orderId: order.id,
        });
        created.push({ code: group.code, spotCode, zoneName, from: holds[index]!.from, to: holds[index]!.to });
      }

      // «Caparra adesso, saldo al lido» (D52): the order payment is the SUM of the
      // per-item deposits — computed per group, so the per-item accounts add up.
      const [club] = await tx.select({ paymentMode: beach.paymentMode, depositPercent: beach.depositPercent }).from(beach).where(eq(beach.id, beachId));
      const dueNowCents =
        club?.paymentMode === 'deposit'
          ? holds.reduce((sum, _held, index) => sum + depositCents(perItemTotals[index]!, club.depositPercent), 0)
          : totalCents;
      const reference = `sbx_${randomBytes(12).toString('hex')}`;
      await tx.insert(payment).values({
        beachId,
        bookingId: null,
        groupId: null,
        orderId: order.id,
        provider: 'sandbox',
        providerRef: reference,
        status: 'in_progress',
        amountCents: dueNowCents,
        purpose: 'checkout',
      });
      await tx.delete(cart).where(eq(cart.id, basket.id));
      return {
        orderId: order.id,
        code,
        totalCents,
        dueNowCents,
        balanceCents: totalCents - dueNowCents,
        payment: { provider: 'sandbox', reference, amountCents: dueNowCents },
        accessToken: orderAccessToken(secret, order.id),
        items: created,
      };
    });
  } catch (error) {
    // Two confirmations of the same cart raced: the hold unique index stopped the second.
    if (errorCode(error) === '23505') throw new DomainError('inventory_conflict', 'This cart is already being confirmed');
    throw error;
  }
}

export interface OrderItemView {
  code: string;
  spotCode: string;
  /** Name of the manager's named zone (D50); null when the spot belongs to none. */
  zoneName: string | null;
  from: string;
  to: string;
  guestName: string;
  status: (typeof booking.$inferSelect)['status'];
  totalCents: number;
  /** This item's share of what the order payment asks for (D52): its deposit, or its whole total. */
  dueNowCents: number;
  balanceCents: number;
  /** The cancellation terms applied to THIS item's arrival day (D53). */
  cancellation: { deadlineHours: number; deadline: string | null; policyIt: string | null; policyEn: string | null };
  /** Text to show as a QR code; present only while the group is confirmed. */
  passCredential: string | null;
}

export interface OrderView {
  orderId: string;
  code: string;
  guestName: string;
  locale: string;
  totalCents: number;
  /** What the single order payment asks for (D52): sum of the items' deposits, or the total. */
  dueNowCents: number;
  balanceCents: number;
  paidCents: number;
  remainingCents: number;
  paymentState: PaymentState;
  payment: { provider: string; reference: string; status: (typeof payment.$inferSelect)['status'] } | null;
  /** The club's terms with the earliest deadline among the items (D53). */
  cancellation: { deadlineHours: number; deadline: string | null; policyIt: string | null; policyEn: string | null };
  items: OrderItemView[];
}

/** The orderer's own view of an order, opened with the token received at confirmation. */
export function getOrder(db: Database, beachId: string, orderId: string, accessToken: string, secret: string): Promise<OrderView> {
  if (!sameText(accessToken, orderAccessToken(secret, orderId))) {
    return Promise.reject(new DomainError('not_found', 'Order not found'));
  }
  return withBeach(db, beachId, async (tx) => {
    const [order] = await tx.select().from(orderGroup).where(eq(orderGroup.id, orderId));
    if (!order) throw new DomainError('not_found', 'Order not found');
    const groups = await tx.select().from(bookingGroup).where(eq(bookingGroup.orderId, orderId)).orderBy(asc(bookingGroup.code));
    const groupIds = groups.map((group) => group.id);
    const totals = await groupTotalsByGroup(tx, groupIds);
    const passes = groupIds.length > 0 ? await tx.select().from(pass).where(inArray(pass.groupId, groupIds)) : [];
    const passOf = new Map(passes.map((row) => [row.groupId, row]));
    const dayRows = groupIds.length > 0
      ? await tx
          .select({ groupId: booking.groupId, status: booking.status, guestName: booking.guestName, day: inventoryDay.day, spotCode: spot.code, zoneName: beachZone.name })
          .from(booking)
          .innerJoin(inventoryDay, eq(inventoryDay.id, booking.inventoryDayId))
          .innerJoin(spot, eq(spot.id, inventoryDay.spotId))
          .leftJoin(beachZone, eq(beachZone.id, spot.namedZoneId))
          .where(inArray(booking.groupId, groupIds))
          .orderBy(asc(inventoryDay.day))
      : [];
    const daysOf = new Map<string, typeof dayRows>();
    for (const row of dayRows) {
      const list = daysOf.get(row.groupId) ?? [];
      list.push(row);
      daysOf.set(row.groupId, list);
    }

    const payments = await tx.select().from(payment).where(eq(payment.orderId, orderId)).orderBy(asc(payment.createdAt));
    const opened = payments.find((entry) => entry.purpose !== 'request') ?? null;
    const paidCents = payments.filter((entry) => entry.status === 'succeeded').reduce((sum, entry) => sum + entry.amountCents, 0);

    // Each item's share of what the payment asks for (D52): the opened amount
    // apportioned over the totals frozen in the holds, like the paid quota is.
    const dueNowCents = opened?.amountCents ?? order.totalCents;
    const holdTotals = groupIds.length > 0
      ? await tx
          .select({ groupId: booking.groupId, totalCents: sql<number>`coalesce(sum(${hold.totalCents}), 0)::int` })
          .from(booking)
          .innerJoin(hold, eq(hold.id, booking.holdId))
          .where(inArray(booking.groupId, groupIds))
          .groupBy(booking.groupId)
      : [];
    const dueOf = apportionPaid(
      dueNowCents,
      holdTotals.map((row) => ({ key: row.groupId, totalCents: row.totalCents })).sort((left, right) => left.key.localeCompare(right.key)),
    );

    // The cancellation terms (D53), with the deadline computed per item's arrival day.
    const [terms] = await tx
      .select({ deadlineHours: beach.cancelDeadlineHours, policyIt: beach.cancelPolicyIt, policyEn: beach.cancelPolicyEn })
      .from(beach)
      .where(eq(beach.id, order.beachId));
    const arrivals = groups.map((group) => totals.get(group.id)?.from ?? daysOf.get(group.id)?.[0]?.day).filter((day): day is string => Boolean(day));
    const deadlines = terms ? await cancellationDeadlines(tx, order.beachId, arrivals) : new Map<string, string>();
    const cancellationOf = (arrival: string | null) => ({
      deadlineHours: terms?.deadlineHours ?? 48,
      deadline: arrival ? (deadlines.get(arrival) ?? null) : null,
      policyIt: terms?.policyIt ?? null,
      policyEn: terms?.policyEn ?? null,
    });

    const items = groups.map((group) => {
      const members = daysOf.get(group.id) ?? [];
      const status = groupStatusOf(members.map((member) => member.status));
      const issued = passOf.get(group.id);
      const total = totals.get(group.id);
      const from = total?.from ?? members[0]?.day ?? '';
      const itemDueNow = dueOf.get(group.id) ?? 0;
      return {
        code: group.code,
        spotCode: members[0]?.spotCode ?? '',
        zoneName: members[0]?.zoneName ?? null,
        from,
        to: total?.to ?? members[members.length - 1]?.day ?? '',
        guestName: members[0]?.guestName ?? order.guestName,
        status,
        totalCents: total?.totalCents ?? 0,
        dueNowCents: itemDueNow,
        balanceCents: Math.max(0, (total?.totalCents ?? 0) - itemDueNow),
        cancellation: cancellationOf(from || null),
        passCredential: status === 'confirmed' && issued && !issued.revoked ? passCredential(secret, issued.id) : null,
      };
    });

    const earliestDeadline = items.map((item) => item.cancellation.deadline).filter((deadline): deadline is string => deadline !== null).sort()[0] ?? null;
    return {
      orderId: order.id,
      code: order.code,
      guestName: order.guestName,
      locale: order.locale,
      totalCents: order.totalCents,
      dueNowCents,
      balanceCents: Math.max(0, order.totalCents - dueNowCents),
      paidCents,
      remainingCents: Math.max(0, order.totalCents - paidCents),
      paymentState: paymentStateOf(order.totalCents, paidCents),
      payment: opened ? { provider: opened.provider, reference: opened.providerRef, status: opened.status } : null,
      cancellation: { ...cancellationOf(null), deadline: earliestDeadline },
      items,
    };
  });
}
