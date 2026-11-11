import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { and, asc, eq, sql } from 'drizzle-orm';
import { canTransition } from '@ombre/shared';
import { withActor, withBeach, type Database, type Transaction } from './client';
import { acquireHold, DomainError } from './inventory';
import { enqueue } from './jobs';
import { recordRefundDue, recordSale } from './ledger';
import type { Actor } from './manage';
import { accessEvent, allocation, auditEvent, beach, booking, hold, inventoryDay, ledgerEntry, pass, payment, promotion, providerEvent, refund, spot } from './schema';

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
  locale?: 'it' | 'en';
  source?: 'online' | 'desk';
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
      const [paid] = await tx.select().from(payment).where(eq(payment.bookingId, existing.id));
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
        code,
        status: 'under_review',
        guestName: request.guestName,
        guestEmail: request.guestEmail?.toLowerCase() ?? null,
        source: request.source ?? 'online',
        locale: request.locale ?? 'it',
        listPriceCents: held.listPriceCents,
        discountCents: held.discountCents,
        totalCents: held.totalCents,
        promoCode: held.promoCode,
      })
      .returning();
    if (!created) throw new Error('booking was not created');

    const provider = request.source === 'desk' ? 'desk' : 'sandbox';
    const reference = `${provider === 'desk' ? 'desk' : 'sbx'}_${randomBytes(12).toString('hex')}`;
    await tx.insert(payment).values({ beachId, bookingId: created.id, provider, providerRef: reference, status: 'in_progress', amountCents: held.totalCents });
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

export type PaymentOutcome = 'confirmed' | 'cancelled' | 'refund_due' | 'duplicate' | 'ignored';

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
      await recordSale(tx, beachId, { bookingId: reserved.id, inventoryDayId: day.id, totalCents: reserved.totalCents });
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
  paymentStatus: (typeof payment.$inferSelect)['status'];
  paymentProvider: string;
  paymentReference: string;
  presence: (typeof booking.$inferSelect)['presence'];
  guestName: string;
  day: string;
  spot: { code: string; rowNumber: number; umbrellas: number; sunbeds: number };
  quote: { listPrice: number; discount: number; total: number; promoCode: string | null };
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
      .select({ booking, paymentStatus: payment.status, paymentProvider: payment.provider, paymentReference: payment.providerRef, day: inventoryDay.day, spot, passId: pass.id, revoked: pass.revoked })
      .from(booking)
      .innerJoin(payment, eq(payment.bookingId, booking.id))
      .innerJoin(inventoryDay, eq(inventoryDay.id, booking.inventoryDayId))
      .innerJoin(spot, eq(spot.id, inventoryDay.spotId))
      .leftJoin(pass, eq(pass.bookingId, booking.id))
      .where(eq(booking.id, bookingId));
    if (!row) throw new DomainError('not_found', 'Booking not found');
    const usable = row.booking.status === 'confirmed' && row.passId && !row.revoked;
    return {
      bookingId: row.booking.id,
      code: row.booking.code,
      status: row.booking.status,
      paymentStatus: row.paymentStatus,
      paymentProvider: row.paymentProvider,
      paymentReference: row.paymentReference,
      presence: row.booking.presence,
      guestName: row.booking.guestName,
      day: row.day,
      spot: { code: row.spot.code, rowNumber: row.spot.rowNumber, umbrellas: row.spot.umbrellas, sunbeds: row.spot.sunbeds },
      quote: { listPrice: row.booking.listPriceCents, discount: row.booking.discountCents, total: row.booking.totalCents, promoCode: row.booking.promoCode },
      passCredential: usable && row.passId ? passCredential(secret, row.passId) : null,
    };
  });
}

export interface AccessResult {
  code: string;
  spotCode: string;
  guestName: string;
  presence: (typeof booking.$inferSelect)['presence'];
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
    return { code: reserved.code, spotCode: place.spotCode, guestName: reserved.guestName, presence: target };
  });
}

export interface BookingRow {
  code: string;
  status: (typeof booking.$inferSelect)['status'];
  presence: (typeof booking.$inferSelect)['presence'];
  guestName: string;
  spotCode: string;
  totalCents: number;
}

export function listBookings(db: Database, actor: Actor, day: string): Promise<BookingRow[]> {
  return withActor(db, actor.beachId, actor.userId, (tx) =>
    tx
      .select({ code: booking.code, status: booking.status, presence: booking.presence, guestName: booking.guestName, spotCode: spot.code, totalCents: booking.totalCents })
      .from(booking)
      .innerJoin(inventoryDay, eq(inventoryDay.id, booking.inventoryDayId))
      .innerJoin(spot, eq(spot.id, inventoryDay.spotId))
      .where(eq(inventoryDay.day, day))
      .orderBy(asc(booking.code)),
  );
}

/**
 * Booking taken at the front desk and paid there. It goes through the same hold and the
 * same row lock as a purchase on the website: no channel can jump the queue.
 */
export async function deskBooking(db: Database, actor: Actor, input: { spotId: string; day: string; guestName: string }, secret: string): Promise<{ code: string }> {
  const held = await acquireHold(db, actor.beachId, { spotId: input.spotId, day: input.day, idempotencyKey: `desk-${randomUUID()}`, ttlSeconds: 120 });
  const started = await startCheckout(db, actor.beachId, { holdId: held.holdId, guestName: input.guestName, guestEmail: null, source: 'desk' }, secret);
  const outcome = await applyPaymentOutcome(db, { provider: 'desk', eventId: `desk-${started.bookingId}`, reference: started.payment.reference, outcome: 'succeeded' });
  if (outcome !== 'confirmed') throw new DomainError('inventory_conflict', 'This spot has just been taken');
  await withActor(db, actor.beachId, actor.userId, (tx) =>
    tx.insert(auditEvent).values({ beachId: actor.beachId, actorUserId: actor.userId, action: 'booking.desk', target: started.code, detail: { totalCents: started.payment.amountCents } }),
  );
  return { code: started.code };
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

    const [paid] = await tx.select().from(payment).where(eq(payment.bookingId, reserved.id));
    if (paid) await tx.insert(refund).values({ beachId: actor.beachId, paymentId: paid.id, amountCents: paid.amountCents, reason: input.reason });
    const reversed = await tx.update(allocation).set({ state: 'adjusted' }).where(eq(allocation.bookingId, reserved.id)).returning({ party: allocation.party, amountCents: allocation.amountCents });
    await tx.insert(ledgerEntry).values([
      ...reversed.map((row) => ({ beachId: actor.beachId, bookingId: reserved.id, kind: 'adjustment', party: row.party, amountCents: -row.amountCents })),
      { beachId: actor.beachId, bookingId: reserved.id, kind: 'refund_due', amountCents: -reserved.totalCents },
    ]);
    await enqueue(tx, actor.beachId, 'booking.cancelled', { bookingId: reserved.id });
    await tx.insert(auditEvent).values({ beachId: actor.beachId, actorUserId: actor.userId, action: 'booking.cancel', target: reserved.code, detail: { reason: input.reason } });
  });
}
