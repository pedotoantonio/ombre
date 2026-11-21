import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  acquireHold,
  addItem,
  applyPaymentOutcome,
  cancelByBeachClub,
  cancelByOwner,
  collectAtDesk,
  confirmOrder,
  createCart,
  createReview,
  deskBooking,
  DomainError,
  findActiveBeach,
  flagReview,
  getCart,
  getOrder,
  listMyBookings,
  listPublicReviews,
  listReviewsForManager,
  registerAccount,
  relinkBookings,
  replyToReview,
  setCancellationPolicy,
  setPaymentSettings,
  setSplitRule,
  startCheckout,
  upsertUser,
  bookingMailData,
  type Actor,
} from '../src/index';
import { createTestDatabase, insertBeach, testAdminUrl, type TestBeach, type TestDatabase } from '../src/testing';

const signingSecret = 'segreto-di-prova-lungo-almeno-32-caratteri';
const day = '2099-07-01';
const key = () => `test-${randomUUID()}`;

async function codeOf(work: () => Promise<unknown>): Promise<string> {
  try {
    await work();
    return 'no error';
  } catch (error) {
    return error instanceof DomainError ? error.code : `unexpected: ${String(error)}`;
  }
}

describe.skipIf(!testAdminUrl)('reviews, deposit and owner cancellation on a real PostgreSQL (D51, D52, D53)', () => {
  let database: TestDatabase;
  let dune: TestBeach;
  let manager: Actor;
  let nextSpot = 0;

  beforeAll(async () => {
    database = await createTestDatabase(testAdminUrl!);
    dune = await insertBeach(database.admin, 'dune', { spots: 14, day, priceCents: 3000 });
    await setSplitRule(database.adminUrl, dune.beachId, { seasonHolder: 5000, beachClub: 4000, platform: 1000 });
    const userId = await upsertUser(database.adminUrl, { email: 'gestore@example.org', name: 'Gea', password: 'password-di-prova-123' }, [
      { beachId: dune.beachId, role: 'manager' },
    ]);
    manager = { userId, beachId: dune.beachId, role: 'manager' };
  });

  afterAll(async () => {
    await database?.drop();
  });

  const db = () => database.app.db;

  async function userIdOf(email: string): Promise<string> {
    const row = await database.admin.query<{ id: string }>('SELECT id FROM app_user WHERE email = $1', [email.toLowerCase()]);
    return row.rows[0]!.id;
  }

  // Each stay that will be concluded gets its OWN day: the OM code numbering
  // counts the bookings of one day, so moving a shared day into the past would
  // make the next group reuse a code.
  let nextDayOffset = 0;
  const futureDay = () => new Date(Date.UTC(2099, 8, 1 + nextDayOffset++)).toISOString().slice(0, 10);

  /** A confirmed online booking group for one future day; returns its group id and code. */
  async function confirmedBooking(guestEmail: string, onDay = day): Promise<{ groupId: string; code: string; paidCents: number }> {
    const spotId = dune.spotIds[nextSpot++]!;
    if (onDay !== day) {
      await database.admin.query(
        "INSERT INTO inventory_day (beach_id, spot_id, day, state, price_cents) VALUES ($1, $2, $3, 'available', 3000) ON CONFLICT DO NOTHING",
        [dune.beachId, spotId, onDay],
      );
    }
    const held = await acquireHold(db(), dune.beachId, { spotId, day: onDay, idempotencyKey: key(), ttlSeconds: 600 });
    const booked = await startCheckout(db(), dune.beachId, { holdId: held.holdId, guestName: 'Ada', guestEmail }, signingSecret);
    expect(await applyPaymentOutcome(db(), { provider: 'sandbox', eventId: randomUUID(), reference: booked.payment.reference, outcome: 'succeeded' })).toBe('confirmed');
    const group = await database.admin.query<{ id: string }>('SELECT id FROM booking_group WHERE code = $1', [booked.code]);
    return { groupId: group.rows[0]!.id, code: booked.code, paidCents: booked.payment.amountCents };
  }

  /** Moves every day of a group into the past, so the stay reads as concluded. */
  async function concludeStay(groupId: string): Promise<void> {
    await database.admin.query(
      "UPDATE inventory_day SET day = day - interval '80 years' WHERE id IN (SELECT inventory_day_id FROM booking WHERE group_id = $1)",
      [groupId],
    );
  }

  describe('reviews (D51)', () => {
    it('refuses a stay that is not concluded, accepts it once concluded, and refuses the second review', async () => {
      const stay = await confirmedBooking('nina@example.org', futureDay());
      expect(await registerAccount(db(), { email: 'nina@example.org', name: 'Nina', locale: 'it' })).toBe('created');
      const nina = await userIdOf('nina@example.org');

      expect(await codeOf(() => createReview(db(), { userId: nina, groupId: stay.groupId, rating: 5, body: 'Bellissimo' }))).toBe('review_not_allowed');

      await concludeStay(stay.groupId);
      const created = await createReview(db(), { userId: nina, groupId: stay.groupId, rating: 5, body: 'Bellissimo' });
      expect(created.rating).toBe(5);
      // Platform audit, like the account actions: no beach club, the author as actor.
      const audited = await database.admin.query("SELECT beach_id, actor_user_id FROM audit_event WHERE action = 'review.create'");
      expect(audited.rows).toEqual([{ beach_id: null, actor_user_id: nina }]);

      expect(await codeOf(() => createReview(db(), { userId: nina, groupId: stay.groupId, rating: 4, body: null }))).toBe('review_exists');
    });

    it('refuses a cancelled stay and a stranger, and never shows the email', async () => {
      const stay = await confirmedBooking('otto@example.org', futureDay());
      await cancelByBeachClub(db(), manager, { code: stay.code, reason: 'chiusura' });
      expect(await registerAccount(db(), { email: 'otto@example.org', name: 'Otto', locale: 'it' })).toBe('created');
      const otto = await userIdOf('otto@example.org');
      await concludeStay(stay.groupId);
      expect(await codeOf(() => createReview(db(), { userId: otto, groupId: stay.groupId, rating: 3, body: null }))).toBe('review_not_allowed');

      // Someone else's group is simply absent through the owner path.
      const nina = await userIdOf('nina@example.org');
      expect(await codeOf(() => createReview(db(), { userId: nina, groupId: stay.groupId, rating: 3, body: null }))).toBe('not_found');

      const published = await listPublicReviews(db(), 'dune');
      expect(published).toHaveLength(1);
      expect(published[0]).toMatchObject({ rating: 5, body: 'Bellissimo', authorName: 'Nina', status: 'published', reply: null });
      expect(JSON.stringify(published)).not.toContain('example.org');
    });

    it('lets the manager flag once with a written reason and reply, keeping the review visible', async () => {
      const rows = await listReviewsForManager(db(), manager);
      expect(rows).toHaveLength(1);
      const reviewId = rows[0]!.reviewId;

      await flagReview(db(), manager, { reviewId, reason: 'Parla di un altro stabilimento' });
      expect(await codeOf(() => flagReview(db(), manager, { reviewId, reason: 'Di nuovo' }))).toBe('invalid_state');

      await replyToReview(db(), manager, { reviewId, reply: 'Grazie della visita!' });
      await replyToReview(db(), manager, { reviewId, reply: 'Grazie, torna a trovarci.' });

      const published = await listPublicReviews(db(), 'dune');
      expect(published[0]).toMatchObject({ status: 'flagged', reply: 'Grazie, torna a trovarci.' });
      const managed = await listReviewsForManager(db(), manager);
      expect(managed[0]).toMatchObject({ flagReason: 'Parla di un altro stabilimento' });
    });

    it('computes average and count on the public beach answers, to one decimal', async () => {
      const stay = await confirmedBooking('pia@example.org', futureDay());
      expect(await registerAccount(db(), { email: 'pia@example.org', name: 'Pia', locale: 'it' })).toBe('created');
      await concludeStay(stay.groupId);
      await createReview(db(), { userId: await userIdOf('pia@example.org'), groupId: stay.groupId, rating: 4, body: null });

      const found = await findActiveBeach(db(), 'dune');
      expect(found?.rating).toEqual({ average: 4.5, count: 2 });
    });

    it('shows the own review and canReview in «Le mie prenotazioni»', async () => {
      const mine = await listMyBookings(db(), await userIdOf('pia@example.org'), signingSecret);
      expect(mine.past[0]).toMatchObject({ review: { rating: 4, body: null }, canReview: false, status: 'completed' });

      const stay = await confirmedBooking('pia@example.org', futureDay());
      await relinkBookings(db(), await userIdOf('pia@example.org'), 'pia@example.org');
      await concludeStay(stay.groupId);
      const again = await listMyBookings(db(), await userIdOf('pia@example.org'), signingSecret);
      const fresh = again.past.find((group) => group.code === stay.code);
      expect(fresh).toMatchObject({ review: null, canReview: true });
    });
  });

  describe('deposit (D52)', () => {
    it('sizes the online payment to the per-group deposit, confirms in full and settles at the desk', async () => {
      await setPaymentSettings(db(), manager, { mode: 'deposit', depositPercent: 30 });

      const held = await acquireHold(db(), dune.beachId, { spotId: dune.spotIds[nextSpot++]!, day, idempotencyKey: key(), ttlSeconds: 600 });
      expect(held.quote.total).toBe(3000);
      const booked = await startCheckout(db(), dune.beachId, { holdId: held.holdId, guestName: 'Rea', guestEmail: 'rea@example.org' }, signingSecret);
      expect(booked.payment.amountCents).toBe(900);
      expect(await applyPaymentOutcome(db(), { provider: 'sandbox', eventId: randomUUID(), reference: booked.payment.reference, outcome: 'succeeded' })).toBe('confirmed');

      // The confirmation is full: shares on the whole total, pass issued, state
      // partial (D72: the inflow row says the deposit alone, what really arrived).
      const group = await database.admin.query<{ id: string }>('SELECT id FROM booking_group WHERE code = $1', [booked.code]);
      const pass = await database.admin.query('SELECT 1 FROM pass WHERE group_id = $1 AND NOT revoked', [group.rows[0]!.id]);
      expect(pass.rowCount).toBe(1);
      const mailData = await bookingMailData(db(), dune.beachId, booked.bookingId);
      expect(mailData).toMatchObject({ totalCents: 3000, paidCents: 900 });

      // The ledger balances: the sale is whole and the allocations sum to the booking total.
      const allocated = await database.admin.query<{ total: string }>(
        'SELECT coalesce(sum(amount_cents), 0)::text AS total FROM allocation WHERE booking_id IN (SELECT id FROM booking WHERE group_id = $1)',
        [group.rows[0]!.id],
      );
      expect(Number(allocated.rows[0]!.total)).toBe(3000);

      // The balance is collected at the desk with the collection that already exists.
      const settled = await collectAtDesk(db(), manager, { code: booked.code, amountCents: 2100 });
      expect(settled).toMatchObject({ paidCents: 3000, remainingCents: 0, paymentState: 'paid' });
      const mailAfter = await bookingMailData(db(), dune.beachId, booked.bookingId);
      expect(mailAfter).toMatchObject({ paidCents: 3000 });
    });

    it('sums the per-item deposits on the order and hands each group its own quota back', async () => {
      // Two items with different totals: 3333 and 3000 → deposits 1000 and 900.
      const [spotA, spotB] = [dune.spotIds[nextSpot++]!, dune.spotIds[nextSpot++]!];
      await database.admin.query('UPDATE inventory_day SET price_cents = 3333 WHERE spot_id = $1 AND day = $2', [spotA, day]);

      const opened = await createCart(db(), dune.beachId, null);
      await addItem(db(), dune.beachId, opened.cartId, { spotId: spotA, day });
      await addItem(db(), dune.beachId, opened.cartId, { spotId: spotB, day });

      const cart = await getCart(db(), dune.beachId, opened.cartId);
      expect(cart.totalCents).toBe(6333);
      expect(cart.items.map((item) => item.dueNowCents)).toEqual([1000, 900]);
      expect(cart.items.map((item) => item.balanceCents)).toEqual([2333, 2100]);
      expect(cart).toMatchObject({ dueNowCents: 1900, balanceCents: 4433, payment: { mode: 'deposit', depositPercent: 30 } });

      const order = await confirmOrder(db(), dune.beachId, { cartId: opened.cartId, guestName: 'Ugo', guestEmail: 'ugo@example.org' }, signingSecret, 600);
      expect(order).toMatchObject({ totalCents: 6333, dueNowCents: 1900, balanceCents: 4433 });
      expect(order.payment.amountCents).toBe(1900);
      expect(await applyPaymentOutcome(db(), { provider: 'sandbox', eventId: randomUUID(), reference: order.payment.reference, outcome: 'succeeded' })).toBe('confirmed');

      // The paid quota is computed on what was PAID, not on the item totals.
      const view = await getOrder(db(), dune.beachId, order.orderId, order.accessToken, signingSecret);
      expect(view).toMatchObject({ totalCents: 6333, dueNowCents: 1900, paidCents: 1900, remainingCents: 4433, paymentState: 'partial' });
      const byTotal = new Map(view.items.map((item) => [item.totalCents, item]));
      expect(byTotal.get(3333)).toMatchObject({ dueNowCents: 1000, balanceCents: 2333 });
      expect(byTotal.get(3000)).toMatchObject({ dueNowCents: 900, balanceCents: 2100 });

      // The desk collects one item's balance: that group becomes paid, the registers agree.
      const itemA = view.items.find((item) => item.totalCents === 3333)!;
      const settled = await collectAtDesk(db(), manager, { code: itemA.code, amountCents: 2333 });
      expect(settled).toMatchObject({ paidCents: 3333, remainingCents: 0, paymentState: 'paid' });
    });

    it('keeps the desk and the full mode exactly as they were', async () => {
      // «Da incassare» at the desk under deposit mode: still no payment at all.
      const taken = await deskBooking(db(), manager, { spotId: dune.spotIds[nextSpot++]!, day, guestName: 'Leo', collect: 'later' }, signingSecret);
      const paid = await database.admin.query(
        'SELECT 1 FROM payment WHERE group_id = (SELECT id FROM booking_group WHERE code = $1)',
        [taken.code],
      );
      expect(paid.rowCount).toBe(0);

      await setPaymentSettings(db(), manager, { mode: 'full', depositPercent: 30 });
      const held = await acquireHold(db(), dune.beachId, { spotId: dune.spotIds[nextSpot++]!, day, idempotencyKey: key(), ttlSeconds: 600 });
      const booked = await startCheckout(db(), dune.beachId, { holdId: held.holdId, guestName: 'Ida', guestEmail: 'ida@example.org' }, signingSecret);
      // Full mode: dueNow = the whole total, balance 0, nothing changed.
      expect(booked.payment.amountCents).toBe(3000);
    });
  });

  describe('cancellation from the account (D53)', () => {
    /** Tomorrow in the beach club's zone, so the 48h default deadline has already passed. */
    async function tomorrow(): Promise<string> {
      const row = await database.admin.query<{ day: string }>("SELECT ((now() at time zone 'Europe/Rome')::date + 1)::text AS day");
      return row.rows[0]!.day;
    }

    it('refuses beyond the deadline, refunds in full within it, and refuses a matured stay', async () => {
      await setPaymentSettings(db(), manager, { mode: 'deposit', depositPercent: 30 });
      const arrival = await tomorrow();
      const stay = await confirmedBooking('vera@example.org', arrival);
      expect(stay.paidCents).toBe(900);
      expect(await registerAccount(db(), { email: 'vera@example.org', name: 'Vera', locale: 'it' })).toBe('created');
      const vera = await userIdOf('vera@example.org');

      // Arrival tomorrow, deadline 48 hours: the term has passed.
      expect(await codeOf(() => cancelByOwner(db(), { userId: vera, groupId: stay.groupId }))).toBe('cancel_deadline_passed');
      const mine = await listMyBookings(db(), vera, signingSecret);
      expect(mine.upcoming.find((group) => group.code === stay.code)?.cancellation.allowed).toBe(false);

      // Deadline at zero hours: midnight of the arrival day is still ahead.
      await setCancellationPolicy(db(), manager, { deadlineHours: 0, policyIt: 'Annullamento gratuito', policyEn: 'Free cancellation' });
      const allowed = await listMyBookings(db(), vera, signingSecret);
      expect(allowed.upcoming.find((group) => group.code === stay.code)?.cancellation).toMatchObject({ allowed: true });

      // A stranger finds nothing; the owner cancels with a full refund of what was paid.
      const nina = await userIdOf('nina@example.org');
      expect(await codeOf(() => cancelByOwner(db(), { userId: nina, groupId: stay.groupId }))).toBe('not_found');
      await cancelByOwner(db(), { userId: vera, groupId: stay.groupId });

      const refunded = await database.admin.query<{ amount_cents: number; reason: string }>(
        'SELECT amount_cents, reason FROM refund WHERE payment_id IN (SELECT id FROM payment WHERE group_id = $1)',
        [stay.groupId],
      );
      expect(refunded.rows).toEqual([{ amount_cents: 900, reason: 'owner_cancelled' }]);
      const freed = await database.admin.query<{ state: string }>(
        'SELECT state FROM inventory_day WHERE id IN (SELECT inventory_day_id FROM booking WHERE group_id = $1)',
        [stay.groupId],
      );
      expect(freed.rows).toEqual([{ state: 'available' }]);
      const queued = await database.admin.query(
        "SELECT 1 FROM outbox WHERE kind = 'booking.cancelled' AND payload->>'bookingId' IN (SELECT id::text FROM booking WHERE group_id = $1)",
        [stay.groupId],
      );
      expect(queued.rowCount).toBe(1);
      const audited = await database.admin.query<{ actor_user_id: string }>(
        "SELECT actor_user_id FROM audit_event WHERE action = 'booking.cancel' AND target = $1",
        [stay.code],
      );
      expect(audited.rows).toEqual([{ actor_user_id: vera }]);

      // Cancelled already: the gesture is refused, not replayed.
      expect(await codeOf(() => cancelByOwner(db(), { userId: vera, groupId: stay.groupId }))).toBe('cancel_not_allowed');

      // A matured stay never cancels from the account.
      const past = await confirmedBooking('vera@example.org', futureDay());
      await relinkBookings(db(), vera, 'vera@example.org');
      await concludeStay(past.groupId);
      expect(await codeOf(() => cancelByOwner(db(), { userId: vera, groupId: past.groupId }))).toBe('cancel_not_allowed');
    });

    it('leaves the beach club path exactly as it was, matured days included', async () => {
      const stay = await confirmedBooking('walt@example.org');
      await cancelByBeachClub(db(), manager, { code: stay.code, reason: 'maltempo' });
      const refunded = await database.admin.query<{ amount_cents: number }>(
        'SELECT amount_cents FROM refund WHERE payment_id IN (SELECT id FROM payment WHERE group_id = $1)',
        [stay.groupId],
      );
      // Full mode at booking time... the group was paid in deposit mode (900): the
      // refund is what was really paid, exactly as before.
      expect(refunded.rows).toEqual([{ amount_cents: stay.paidCents }]);
      const audited = await database.admin.query<{ detail: { reason: string } }>(
        "SELECT detail FROM audit_event WHERE action = 'booking.cancel' AND target = $1",
        [stay.code],
      );
      expect(audited.rows[0]!.detail).toMatchObject({ reason: 'maltempo', days: 1 });
    });
  });
});
