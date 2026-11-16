import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { canTransition } from '@ombre/shared';
import { withActor, withBeach, type Database, type Transaction } from './client';
import { bookingExtraLines, bookingExtraLinesByBooking } from './extras';
import { acquireHold, conventionAppliesOn, DomainError, priceExtras, type ExtraLine, type ExtraRequest } from './inventory';
import { enqueue } from './jobs';
import { recordRefundDue, recordSale } from './ledger';
import type { Actor } from './manage';
import { accessEvent, allocation, auditEvent, beach, booking, bookingExtra, hold, holdExtra, hotelConvention, inventoryDay, ledgerEntry, pass, payment, paymentRequest, promotion, providerEvent, refund, spot } from './schema';

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
const passCredential = (secret: string, passId: string): string => `${passId}.${sign(secret, 'pass', passId).slice(0, 32)}`;

// ---- The payment aggregate (D31, spec §4.3) ----
// The residual is defined once: booking total minus the payments that really
// succeeded. The shown payment state is derived from it, never stored.

export type PaymentState = 'paid' | 'partial' | 'to_collect';

export function paymentStateOf(totalCents: number, paidCents: number): PaymentState {
  if (paidCents >= totalCents) return 'paid';
  return paidCents > 0 ? 'partial' : 'to_collect';
}

/** Sum of the succeeded payments of one booking, inside the current transaction. */
export async function paidCentsOf(tx: Transaction, bookingId: string): Promise<number> {
  const [row] = await tx
    .select({ paid: sql<number>`coalesce(sum(${payment.amountCents}), 0)::int` })
    .from(payment)
    .where(and(eq(payment.bookingId, bookingId), eq(payment.status, 'succeeded')));
  return row?.paid ?? 0;
}

/** Succeeded cents per booking, for day lists: one query, a map back. */
export async function paidCentsByBooking(tx: Transaction, bookingIds: string[]): Promise<Map<string, number>> {
  if (bookingIds.length === 0) return new Map();
  const rows = await tx
    .select({ bookingId: payment.bookingId, paid: sql<number>`coalesce(sum(${payment.amountCents}), 0)::int` })
    .from(payment)
    .where(and(inArray(payment.bookingId, bookingIds), eq(payment.status, 'succeeded')))
    .groupBy(payment.bookingId);
  return new Map(rows.map((row) => [row.bookingId, row.paid]));
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

/**
 * Converts the active hold into a booking under review, with the day row already
 * locked by the caller: numbering, snapshot of the price and copy of the extras.
 */
async function createBookingFromHold(tx: Transaction, beachId: string, day: typeof inventoryDay.$inferSelect, request: CheckoutRequest) {
  const [held] = await tx
    .select()
    .from(hold)
    .where(and(eq(hold.id, request.holdId), eq(hold.status, 'active'), sql`${hold.expiresAt} > now()`));
  if (!held || day.activeHoldId !== held.id) throw new DomainError('hold_expired', 'The hold has run out: choose the spot again');

  // One numbering per beach club and day: OM-YYMMDD-NNN.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${beachId}/${day.day}`}, 0))`);
  const [count] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(booking)
    .innerJoin(inventoryDay, eq(inventoryDay.id, booking.inventoryDayId))
    .where(eq(inventoryDay.day, day.day));
  const code = `OM-${day.day.slice(2).replaceAll('-', '')}-${String((count?.n ?? 0) + 1).padStart(3, '0')}`;

  const [created] = await tx
    .insert(booking)
    .values({
      beachId,
      inventoryDayId: day.id,
      holdId: held.id,
      promotionId: held.promotionId,
      conventionId: held.conventionId,
      code,
      status: 'under_review',
      guestName: request.guestName,
      guestEmail: request.guestEmail?.toLowerCase() ?? null,
      guestPhone: request.guestPhone?.trim() || null,
      source: request.source ?? 'online',
      locale: request.locale ?? 'it',
      listPriceCents: held.listPriceCents,
      discountCents: held.discountCents,
      extrasCents: held.extrasCents,
      totalCents: held.totalCents,
      promoCode: held.promoCode,
    })
    .returning();
  if (!created) throw new Error('booking was not created');

  // The conversion copies the hold snapshot: quantities and the unit prices
  // frozen at reservation time (spec §4.2), whatever the catalogue says now.
  const frozen = await tx.select().from(holdExtra).where(eq(holdExtra.holdId, held.id));
  if (frozen.length > 0) {
    await tx
      .insert(bookingExtra)
      .values(frozen.map((line) => ({ beachId, bookingId: created.id, serviceId: line.serviceId, quantity: line.quantity, unitPriceCents: line.unitPriceCents })));
  }
  return { created, held };
}

/**
 * Turns an active hold into a booking under review and opens its payment. Sending it twice
 * for the same hold returns the same booking.
 */
export function startCheckout(db: Database, beachId: string, request: CheckoutRequest, secret: string): Promise<CheckoutResult> {
  return withBeach(db, beachId, async (tx) => {
    const [target] = await tx.select({ inventoryDayId: hold.inventoryDayId }).from(hold).where(eq(hold.id, request.holdId));
    if (!target) throw new DomainError('not_found', 'Hold not found');
    const [day] = await tx.select().from(inventoryDay).where(eq(inventoryDay.id, target.inventoryDayId)).for('update');
    if (!day) throw new DomainError('not_found', 'Hold not found');

    const [existing] = await tx.select().from(booking).where(eq(booking.holdId, request.holdId));
    if (existing) {
      // The replay answers with the payment the checkout opened, never with a
      // later payment-request one (D31).
      const [paid] = await tx.select().from(payment).where(and(eq(payment.bookingId, existing.id), inArray(payment.purpose, ['checkout', 'desk'])));
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

    const { created, held } = await createBookingFromHold(tx, beachId, day, request);

    const provider = request.source === 'desk' ? 'desk' : 'sandbox';
    const reference = `${provider === 'desk' ? 'desk' : 'sbx'}_${randomBytes(12).toString('hex')}`;
    await tx
      .insert(payment)
      .values({ beachId, bookingId: created.id, provider, providerRef: reference, status: 'in_progress', amountCents: held.totalCents, purpose: provider === 'desk' ? 'desk' : 'checkout' });
    return {
      bookingId: created.id,
      code: created.code,
      accessToken: bookingAccessToken(secret, created.id),
      status: created.status,
      payment: { provider, reference, amountCents: held.totalCents },
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
 * Applies a provider notification exactly once. A success that arrives after the hold ran
 * out confirms the booking only if the day is still free; otherwise a refund is recorded.
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
    // NEVER walks the checkout confirm/cancel path below — on a booking that is
    // already confirmed that path would treat the day as gone and cancel it.
    if (found.purpose === 'request') return settleRequestPayment(tx, beachId, notice.outcome, found);
    const [reserved] = await tx.select().from(booking).where(eq(booking.id, found.bookingId));
    if (!reserved) return 'ignored';
    const [day] = await tx.select().from(inventoryDay).where(eq(inventoryDay.id, reserved.inventoryDayId)).for('update');
    const [paid] = await tx.select().from(payment).where(eq(payment.id, found.id)).for('update');
    if (!day || !paid || paid.status === 'succeeded' || paid.status === 'failed') return 'ignored';

    const settle = (status: 'succeeded' | 'failed') => tx.update(payment).set({ status, updatedAt: sql`now()` }).where(eq(payment.id, paid.id));
    const ours = day.state === 'held' && day.activeHoldId === reserved.holdId;

    if (notice.outcome === 'failed') {
      await settle('failed');
      await tx.update(booking).set({ status: 'cancelled' }).where(eq(booking.id, reserved.id));
      if (ours) await freeDay(tx, day.id, reserved.holdId, reserved.promotionId);
      await enqueue(tx, beachId, 'booking.cancelled', { bookingId: reserved.id });
      return 'cancelled';
    }

    await settle('succeeded');
    if (ours || day.state === 'available') {
      await tx.update(hold).set({ status: 'converted' }).where(eq(hold.id, reserved.holdId));
      await tx.update(inventoryDay).set({ state: 'occupied', activeHoldId: null, updatedAt: sql`now()` }).where(eq(inventoryDay.id, day.id));
      await tx.update(booking).set({ status: 'confirmed', confirmedAt: sql`now()` }).where(eq(booking.id, reserved.id));
      await tx.insert(pass).values({ beachId, bookingId: reserved.id });
      await recordSale(tx, beachId, { bookingId: reserved.id, inventoryDayId: day.id, totalCents: reserved.totalCents, extrasCents: reserved.extrasCents });
      await enqueue(tx, beachId, 'booking.confirmed', { bookingId: reserved.id });
      return 'confirmed';
    }

    // The day went to someone else while the payment was in flight: the money goes back.
    await tx.update(booking).set({ status: 'cancelled' }).where(eq(booking.id, reserved.id));
    await tx.insert(refund).values({ beachId, paymentId: paid.id, amountCents: paid.amountCents, reason: 'inventory_unavailable' });
    await recordRefundDue(tx, beachId, reserved.id, paid.amountCents);
    await enqueue(tx, beachId, 'refund.due', { bookingId: reserved.id });
    return 'refund_due';
  });
}

/**
 * Outcome of a payment born from a payment request (D31, spec §4.3). It only ever
 * reduces the residual and closes its own request. `payment.status` records the
 * collection by the beach club, not the provider's capture: when the money cannot
 * be collected (booking cancelled in the meantime, or the residual fell below the
 * amount because two pending requests were both paid), the payment is settled as
 * `failed`, the WHOLE amount is recorded as a refund to execute (the simplest
 * semantics: never a partial collection) and the request closes as `cancelled`.
 * Lock order everywhere: booking → payment → payment_request.
 */
async function settleRequestPayment(tx: Transaction, beachId: string, outcome: 'succeeded' | 'failed', found: typeof payment.$inferSelect): Promise<PaymentOutcome> {
  const [reserved] = await tx.select().from(booking).where(eq(booking.id, found.bookingId)).for('update');
  const [paid] = await tx.select().from(payment).where(eq(payment.id, found.id)).for('update');
  if (!reserved || !paid || paid.status === 'succeeded' || paid.status === 'failed') return 'ignored';
  const settle = (status: 'succeeded' | 'failed') => tx.update(payment).set({ status, updatedAt: sql`now()` }).where(eq(payment.id, paid.id));

  if (outcome === 'failed') {
    // The provider refused: the request stays pending and can be paid again until it expires.
    await settle('failed');
    return 'request_failed';
  }

  const [request] = paid.requestId ? await tx.select().from(paymentRequest).where(eq(paymentRequest.id, paid.requestId)).for('update') : [];
  const residual = reserved.totalCents - (await paidCentsOf(tx, reserved.id));
  const collectable =
    (reserved.status === 'confirmed' || reserved.status === 'completed') && request !== undefined && request.status === 'pending' && paid.amountCents <= residual;

  if (collectable) {
    await settle('succeeded');
    await tx.update(paymentRequest).set({ status: 'paid', closedAt: sql`now()` }).where(eq(paymentRequest.id, request.id));
    // No ledger entry here: the sale was recorded in full at confirmation
    // (`payment_received` of the total); the collection lives in `payment`.
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
    reason: reserved.status === 'confirmed' || reserved.status === 'completed' ? 'over_collection' : 'booking_cancelled',
  });
  await recordRefundDue(tx, beachId, reserved.id, paid.amountCents);
  await enqueue(tx, beachId, 'refund.due', { bookingId: reserved.id });
  return 'refund_due';
}

async function freeDay(tx: Transaction, inventoryDayId: string, holdId: string, promotionId: string | null): Promise<void> {
  await tx.update(hold).set({ status: 'released' }).where(and(eq(hold.id, holdId), eq(hold.status, 'active')));
  if (promotionId) {
    await tx.update(promotion).set({ committedUses: sql`${promotion.committedUses} - 1` }).where(eq(promotion.id, promotionId));
  }
  await tx.update(inventoryDay).set({ state: 'available', activeHoldId: null, updatedAt: sql`now()` }).where(eq(inventoryDay.id, inventoryDayId));
}

export interface BookingView {
  bookingId: string;
  code: string;
  status: (typeof booking.$inferSelect)['status'];
  /**
   * The payment the checkout or the desk opened with the booking. A booking taken
   * «da incassare» has none: the three fields are null and the aggregate below
   * (`paidCents`, `remainingCents`, `paymentState`) tells the whole story (D31).
   */
  paymentStatus: (typeof payment.$inferSelect)['status'] | null;
  paymentProvider: string | null;
  paymentReference: string | null;
  /** Aggregate over every succeeded payment: residual = total − paidCents. */
  paidCents: number;
  remainingCents: number;
  paymentState: PaymentState;
  presence: (typeof booking.$inferSelect)['presence'];
  guestName: string;
  day: string;
  spot: { code: string; rowNumber: number; umbrellas: number; sunbeds: number };
  /** `total` is comprehensive: spot discounted price + extras. */
  quote: { listPrice: number; discount: number; total: number; promoCode: string | null; extrasCents: number; extras: ExtraLine[] };
  /** Text to show as a QR code. Present only while the booking is confirmed. */
  passCredential: string | null;
}

/** The guest's own view of a booking, opened with the token received at checkout. */
export function getBooking(db: Database, beachId: string, bookingId: string, accessToken: string, secret: string): Promise<BookingView> {
  if (!sameText(accessToken, bookingAccessToken(secret, bookingId))) {
    return Promise.reject(new DomainError('not_found', 'Booking not found'));
  }
  return withBeach(db, beachId, async (tx) => {
    const [row] = await tx
      .select({ booking, day: inventoryDay.day, spot, passId: pass.id, revoked: pass.revoked })
      .from(booking)
      .innerJoin(inventoryDay, eq(inventoryDay.id, booking.inventoryDayId))
      .innerJoin(spot, eq(spot.id, inventoryDay.spotId))
      .leftJoin(pass, eq(pass.bookingId, booking.id))
      .where(eq(booking.id, bookingId));
    if (!row) throw new DomainError('not_found', 'Booking not found');
    // One booking now carries many payments (D31): the one opened with the
    // booking keeps feeding the legacy fields, so the online checkout answer
    // stays exactly as it was; request payments only enter the aggregate.
    const payments = await tx.select().from(payment).where(eq(payment.bookingId, bookingId)).orderBy(asc(payment.createdAt));
    const opened = payments.find((entry) => entry.purpose !== 'request') ?? null;
    const paidCents = payments.filter((entry) => entry.status === 'succeeded').reduce((sum, entry) => sum + entry.amountCents, 0);
    const usable = row.booking.status === 'confirmed' && row.passId && !row.revoked;
    return {
      bookingId: row.booking.id,
      code: row.booking.code,
      status: row.booking.status,
      paymentStatus: opened?.status ?? null,
      paymentProvider: opened?.provider ?? null,
      paymentReference: opened?.providerRef ?? null,
      paidCents,
      remainingCents: Math.max(0, row.booking.totalCents - paidCents),
      paymentState: paymentStateOf(row.booking.totalCents, paidCents),
      presence: row.booking.presence,
      guestName: row.booking.guestName,
      day: row.day,
      spot: { code: row.spot.code, rowNumber: row.spot.rowNumber, umbrellas: row.spot.umbrellas, sunbeds: row.spot.sunbeds },
      quote: {
        listPrice: row.booking.listPriceCents,
        discount: row.booking.discountCents,
        total: row.booking.totalCents,
        promoCode: row.booking.promoCode,
        extrasCents: row.booking.extrasCents,
        extras: await bookingExtraLines(tx, row.booking.id),
      },
      passCredential: usable && row.passId ? passCredential(secret, row.passId) : null,
    };
  });
}

export interface AccessResult {
  code: string;
  spotCode: string;
  guestName: string;
  presence: (typeof booking.$inferSelect)['presence'];
  /** What the front desk hands over with the pass (spec §4.2). */
  extras: { name: { it: string; en: string | null }; quantity: number }[];
}

const shortCode = /^OM-\d{6}-\d{3}$/;

/**
 * Registers an entry or an exit at the front desk, from the QR text or the short code.
 * The booking row is locked, so two scans at the same instant give one entry.
 */
export function checkAccess(db: Database, actor: Actor, input: { credential: string; kind: 'entry' | 'exit' }, secret: string): Promise<AccessResult> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const invalid = () => new DomainError('pass_invalid', 'This pass is not valid');
    const credential = input.credential.trim();
    let bookingId: string | undefined;

    if (shortCode.test(credential.toUpperCase())) {
      const [byCode] = await tx.select({ id: booking.id }).from(booking).where(eq(booking.code, credential.toUpperCase()));
      bookingId = byCode?.id;
    } else {
      const [passId = '', signature = ''] = credential.split('.');
      if (!/^[0-9a-f-]{36}$/.test(passId) || !sameText(credential, passCredential(secret, passId)) || !signature) throw invalid();
      const [byPass] = await tx.select({ bookingId: pass.bookingId }).from(pass).where(and(eq(pass.id, passId), eq(pass.revoked, false)));
      bookingId = byPass?.bookingId;
    }
    if (!bookingId) throw invalid();

    const [reserved] = await tx.select().from(booking).where(eq(booking.id, bookingId)).for('update');
    if (!reserved || reserved.status !== 'confirmed') throw invalid();

    const [place] = await tx
      .select({ spotCode: spot.code, today: sql<boolean>`${inventoryDay.day} = (now() at time zone ${beach.timezone})::date` })
      .from(inventoryDay)
      .innerJoin(spot, eq(spot.id, inventoryDay.spotId))
      .innerJoin(beach, eq(beach.id, inventoryDay.beachId))
      .where(eq(inventoryDay.id, reserved.inventoryDayId));
    if (!place) throw invalid();
    if (!place.today) throw new DomainError('wrong_day', 'This booking is for another day');

    const target = input.kind === 'entry' ? 'inside' : 'outside_reentry_allowed';
    if (!canTransition('presence', reserved.presence, target)) {
      throw new DomainError('invalid_state', input.kind === 'entry' ? 'This guest is already inside' : 'This guest is not inside');
    }
    await tx.update(booking).set({ presence: target }).where(eq(booking.id, reserved.id));
    await tx.insert(accessEvent).values({ beachId: actor.beachId, bookingId: reserved.id, kind: input.kind, operatorUserId: actor.userId });
    await tx.insert(auditEvent).values({ beachId: actor.beachId, actorUserId: actor.userId, action: `access.${input.kind}`, target: reserved.code, detail: {} });
    const extras = (await bookingExtraLines(tx, reserved.id)).map((line) => ({ name: line.name, quantity: line.quantity }));
    return { code: reserved.code, spotCode: place.spotCode, guestName: reserved.guestName, presence: target, extras };
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
  totalCents: number;
  /** Aggregate of the succeeded payments (D31): the desk sees what is still owed. */
  paidCents: number;
  remainingCents: number;
  paymentState: PaymentState;
  /** Extras to hand over with the booking (spec §4.2). */
  extras: { name: { it: string; en: string | null }; quantity: number }[];
}

export function listBookings(db: Database, actor: Actor, day: string): Promise<BookingRow[]> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const rows = await tx
      .select({
        bookingId: booking.id,
        code: booking.code,
        status: booking.status,
        presence: booking.presence,
        guestName: booking.guestName,
        spotCode: spot.code,
        totalCents: booking.totalCents,
      })
      .from(booking)
      .innerJoin(inventoryDay, eq(inventoryDay.id, booking.inventoryDayId))
      .innerJoin(spot, eq(spot.id, inventoryDay.spotId))
      .where(eq(inventoryDay.day, day))
      .orderBy(asc(booking.code));
    const lines = await bookingExtraLinesByBooking(tx, rows.map((row) => row.bookingId));
    const paidOf = await paidCentsByBooking(tx, rows.map((row) => row.bookingId));
    return rows.map(({ bookingId, ...row }) => {
      const paidCents = paidOf.get(bookingId) ?? 0;
      return {
        ...row,
        paidCents,
        remainingCents: Math.max(0, row.totalCents - paidCents),
        paymentState: paymentStateOf(row.totalCents, paidCents),
        extras: (lines.get(bookingId) ?? []).map((line) => ({ name: line.name, quantity: line.quantity })),
      };
    });
  });
}

/**
 * Booking taken at the front desk and paid there. It goes through the same hold and the
 * same row lock as a purchase on the website: no channel can jump the queue. The desk
 * picks a hotel convention from a list (its identifier, never a typed code, spec §4.1);
 * the identifier is resolved to the code here and then follows the ordinary path.
 * Extras (spec §4.2) travel the same internal hold: the snapshot and the ledger
 * movement are exactly those of an online purchase.
 */
export async function deskBooking(
  db: Database,
  actor: Actor,
  input: {
    spotId: string;
    day: string;
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
  const held = await acquireHold(db, actor.beachId, { spotId: input.spotId, day: input.day, promoCode, extras: input.extras, idempotencyKey: `desk-${randomUUID()}`, ttlSeconds: 120 });
  const guest = { guestName: input.guestName, guestEmail: input.guestEmail?.trim() || null, guestPhone: input.guestPhone ?? null };

  let code: string;
  let totalCents: number;
  if (input.collect === 'later') {
    // «Da incassare» (D31): confirmed at once, pass at once (D5: paying is not
    // entering), the sale recorded at confirmation exactly as today — but NO
    // payment row: the residual equals the total until the desk collects it.
    const confirmed = await withBeach(db, actor.beachId, async (tx) => {
      const [target] = await tx.select({ inventoryDayId: hold.inventoryDayId }).from(hold).where(eq(hold.id, held.holdId));
      if (!target) throw new DomainError('not_found', 'Hold not found');
      const [day] = await tx.select().from(inventoryDay).where(eq(inventoryDay.id, target.inventoryDayId)).for('update');
      if (!day) throw new DomainError('not_found', 'Hold not found');
      const { created } = await createBookingFromHold(tx, actor.beachId, day, { holdId: held.holdId, ...guest, source: 'desk' });
      await tx.update(hold).set({ status: 'converted' }).where(eq(hold.id, held.holdId));
      await tx.update(inventoryDay).set({ state: 'occupied', activeHoldId: null, updatedAt: sql`now()` }).where(eq(inventoryDay.id, day.id));
      await tx.update(booking).set({ status: 'confirmed', confirmedAt: sql`now()` }).where(eq(booking.id, created.id));
      await tx.insert(pass).values({ beachId: actor.beachId, bookingId: created.id });
      await recordSale(tx, actor.beachId, { bookingId: created.id, inventoryDayId: day.id, totalCents: created.totalCents, extrasCents: created.extrasCents });
      await enqueue(tx, actor.beachId, 'booking.confirmed', { bookingId: created.id });
      return created;
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
      detail: { totalCents, conventionId: input.conventionId ?? null, collect: input.collect ?? 'now' },
    }),
  );
  return { code };
}

/**
 * Collects (part of) the outstanding balance at the front desk: a `desk` payment
 * that succeeds at once. The ledger is untouched — the sale was recorded in full
 * at confirmation; the collection lives in the payment aggregate (D31).
 */
export function collectAtDesk(db: Database, actor: Actor, input: { code: string; amountCents: number }): Promise<{ paidCents: number; remainingCents: number; paymentState: PaymentState }> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) throw new DomainError('invalid_state', 'The amount must be a positive amount of cents');
    const found = await confirmedByCode(tx, input.code);
    const [reserved] = await tx.select().from(booking).where(eq(booking.id, found.id)).for('update');
    if (!reserved || (reserved.status !== 'confirmed' && reserved.status !== 'completed')) {
      throw new DomainError('invalid_state', 'Only a confirmed booking can be collected');
    }
    const residual = reserved.totalCents - (await paidCentsOf(tx, reserved.id));
    if (input.amountCents > residual) throw new DomainError('invalid_state', 'The amount exceeds the outstanding balance');
    await tx.insert(payment).values({
      beachId: actor.beachId,
      bookingId: reserved.id,
      provider: 'desk',
      providerRef: `desk_${randomBytes(12).toString('hex')}`,
      status: 'succeeded',
      amountCents: input.amountCents,
      purpose: 'desk',
    });
    await tx.insert(auditEvent).values({ beachId: actor.beachId, actorUserId: actor.userId, action: 'booking.collect', target: reserved.code, detail: { amountCents: input.amountCents } });
    const paidCents = await paidCentsOf(tx, reserved.id);
    return { paidCents, remainingCents: Math.max(0, reserved.totalCents - paidCents), paymentState: paymentStateOf(reserved.totalCents, paidCents) };
  });
}

/**
 * Adds extras to a sale already made (spec §4.3, closing §4.2): the total and the
 * snapshot grow, a dedicated `extras_revenue` movement is recorded together with
 * the grown sale, and the collection happens at the desk now (`desk` payment) or
 * stays in the residual. A service already on the booking keeps its frozen unit
 * price: the new quantity is priced at that frozen price, a new service at the
 * catalogue price of today. Only for a confirmed booking of a day not yet past.
 */
export function addExtrasToBooking(
  db: Database,
  actor: Actor,
  input: { code: string; extras: ExtraRequest[]; collect: 'desk' | 'later' },
): Promise<{ addedCents: number; totalCents: number; paidCents: number; remainingCents: number; paymentState: PaymentState; extras: ExtraLine[] }> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    if (input.extras.length === 0) throw new DomainError('invalid_state', 'Nothing to add');
    const found = await confirmedByCode(tx, input.code);
    const [reserved] = await tx.select().from(booking).where(eq(booking.id, found.id)).for('update');
    if (!reserved || reserved.status !== 'confirmed') throw new DomainError('invalid_state', 'Only a confirmed booking can take more extras');
    const [when] = await tx
      .select({ past: sql<boolean>`${inventoryDay.day} < (now() at time zone ${beach.timezone})::date` })
      .from(inventoryDay)
      .innerJoin(beach, eq(beach.id, inventoryDay.beachId))
      .where(eq(inventoryDay.id, reserved.inventoryDayId));
    if (!when || when.past) throw new DomainError('invalid_state', 'This booking is for a day that is over');

    const { lines } = await priceExtras(tx, input.extras);
    const existing = await tx.select().from(bookingExtra).where(eq(bookingExtra.bookingId, reserved.id));
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
          .values({ beachId: actor.beachId, bookingId: reserved.id, serviceId: line.serviceId, quantity: line.quantity, unitPriceCents: line.unitPriceCents });
        addedCents += line.subtotalCents;
      }
    }
    await tx
      .update(booking)
      .set({ extrasCents: reserved.extrasCents + addedCents, totalCents: reserved.totalCents + addedCents })
      .where(eq(booking.id, reserved.id));
    // The sale grows: the dedicated extras movement and the grown sale amount are
    // both recorded, mirroring what recordSale wrote at confirmation.
    await tx.insert(ledgerEntry).values([
      { beachId: actor.beachId, bookingId: reserved.id, kind: 'payment_received', amountCents: addedCents },
      { beachId: actor.beachId, bookingId: reserved.id, kind: 'extras_revenue', party: 'beach_club' as const, amountCents: addedCents },
    ]);
    if (input.collect === 'desk') {
      await tx.insert(payment).values({
        beachId: actor.beachId,
        bookingId: reserved.id,
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
      target: reserved.code,
      detail: { addedCents, collect: input.collect, extras: input.extras.map((entry) => ({ serviceId: entry.serviceId, quantity: entry.quantity })) },
    });
    const totalCents = reserved.totalCents + addedCents;
    const paidCents = await paidCentsOf(tx, reserved.id);
    return {
      addedCents,
      totalCents,
      paidCents,
      remainingCents: Math.max(0, totalCents - paidCents),
      paymentState: paymentStateOf(totalCents, paidCents),
      extras: await bookingExtraLines(tx, reserved.id),
    };
  });
}

async function confirmedByCode(tx: Transaction, code: string) {
  const [found] = await tx.select({ id: booking.id, inventoryDayId: booking.inventoryDayId }).from(booking).where(eq(booking.code, code.toUpperCase()));
  if (!found) throw new DomainError('not_found', 'Booking not found');
  return found;
}

/**
 * Moves a confirmed booking to another spot on the same day. The new spot is taken and the
 * old one released in one transaction; rows are locked in a fixed order to avoid deadlocks.
 */
export function moveBooking(db: Database, actor: Actor, input: { code: string; spotId: string }): Promise<void> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const found = await confirmedByCode(tx, input.code);
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
    await tx.insert(auditEvent).values({ beachId: actor.beachId, actorUserId: actor.userId, action: 'booking.move', target: reserved.code, detail: { from: from.spotId, to: to.spotId } });
  });
}

/**
 * The beach club cancels a confirmed booking (closure, bad weather, a mistake). The spot is
 * free again, the pass stops working, the refund is recorded and the shares are reversed
 * with new ledger entries.
 */
export function cancelByBeachClub(db: Database, actor: Actor, input: { code: string; reason: string }): Promise<void> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const found = await confirmedByCode(tx, input.code);
    const [day] = await tx.select().from(inventoryDay).where(eq(inventoryDay.id, found.inventoryDayId)).for('update');
    const [reserved] = await tx.select().from(booking).where(eq(booking.id, found.id)).for('update');
    if (!day || !reserved || reserved.status !== 'confirmed' || reserved.inventoryDayId !== day.id) throw new DomainError('invalid_state', 'Only a confirmed booking can be cancelled');

    await tx.update(booking).set({ status: 'cancelled' }).where(eq(booking.id, reserved.id));
    await tx.update(pass).set({ revoked: true }).where(eq(pass.bookingId, reserved.id));
    await tx.update(inventoryDay).set({ state: 'available', updatedAt: sql`now()` }).where(eq(inventoryDay.id, day.id));
    if (reserved.promotionId) {
      await tx.update(promotion).set({ committedUses: sql`${promotion.committedUses} - 1` }).where(eq(promotion.id, reserved.promotionId));
    }

    // The refund is what was really paid (D31): the sum of the succeeded
    // payments, deposit included — one refund row per payment. A booking taken
    // «da incassare» and never collected refunds nothing.
    const paidRows = await tx
      .select()
      .from(payment)
      .where(and(eq(payment.bookingId, reserved.id), eq(payment.status, 'succeeded')))
      .orderBy(asc(payment.createdAt));
    if (paidRows.length > 0) {
      await tx.insert(refund).values(paidRows.map((row) => ({ beachId: actor.beachId, paymentId: row.id, amountCents: row.amountCents, reason: input.reason })));
    }
    const paidSum = paidRows.reduce((sum, row) => sum + row.amountCents, 0);
    // A pending payment request can no longer be paid: its late outcome, if any,
    // walks the refund path of the webhook.
    await tx
      .update(paymentRequest)
      .set({ status: 'cancelled', closedAt: sql`now()` })
      .where(and(eq(paymentRequest.bookingId, reserved.id), eq(paymentRequest.status, 'pending')));
    const reversed = await tx.update(allocation).set({ state: 'adjusted' }).where(eq(allocation.bookingId, reserved.id)).returning({ party: allocation.party, amountCents: allocation.amountCents });
    // The reversal is comprehensive (discounted spot + extras: totalCents carries both,
    // spec §4.2); the extras movement is reversed like the shares are.
    const entries = [
      ...reversed.map((row) => ({ beachId: actor.beachId, bookingId: reserved.id, kind: 'adjustment', party: row.party, amountCents: -row.amountCents })),
      ...(reserved.extrasCents > 0 ? [{ beachId: actor.beachId, bookingId: reserved.id, kind: 'adjustment', party: 'beach_club' as const, amountCents: -reserved.extrasCents }] : []),
      ...(paidSum > 0 ? [{ beachId: actor.beachId, bookingId: reserved.id, kind: 'refund_due', amountCents: -paidSum }] : []),
    ];
    if (entries.length > 0) await tx.insert(ledgerEntry).values(entries);
    await enqueue(tx, actor.beachId, 'booking.cancelled', { bookingId: reserved.id });
    await tx.insert(auditEvent).values({ beachId: actor.beachId, actorUserId: actor.userId, action: 'booking.cancel', target: reserved.code, detail: { reason: input.reason } });
  });
}
