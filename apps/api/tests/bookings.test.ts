import { createHmac, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { upsertUser } from '@ombre/db';
import { createTestDatabase, insertBeach, testAdminUrl, type TestBeach, type TestDatabase } from '@ombre/db/testing';
import { createApp } from '../src/app';

const password = 'password-di-prova-123';
const signingSecret = 'segreto-di-prova-lungo-almeno-32-caratteri';
const sandboxWebhookSecret = 'segreto-del-fornitore-di-prova';
const slug = 'oggi';

describe.skipIf(!testAdminUrl)('booking, test payment, pass and front desk', () => {
  let database: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let beach: TestBeach;
  let today: string;
  let tomorrow: string;
  const tokens: Record<string, string> = {};
  let nextSpot = 0;

  beforeAll(async () => {
    database = await createTestDatabase(testAdminUrl!);
    const dates = await database.admin.query<{ today: string; tomorrow: string }>(
      "SELECT (now() AT TIME ZONE 'Europe/Rome')::date::text AS today, ((now() AT TIME ZONE 'Europe/Rome')::date + 1)::text AS tomorrow",
    );
    ({ today, tomorrow } = dates.rows[0]!);
    beach = await insertBeach(database.admin, slug, { spots: 9, day: today });
    await database.admin.query("INSERT INTO promotion (beach_id, code, percent_bps, max_uses) VALUES ($1, 'MARE10', 1000, 50)", [beach.beachId]);
    await database.admin.query(
      "INSERT INTO inventory_day (beach_id, spot_id, day, state, price_cents) VALUES ($1, $2, $3, 'available', 3000)",
      [beach.beachId, beach.spotIds[8], tomorrow],
    );
    for (const role of ['manager', 'reception', 'accounting'] as const) {
      await upsertUser(database.adminUrl, { email: `${role}@oggi.example`, name: role, password }, [{ beachId: beach.beachId, role }]);
    }
    app = createApp({ db: database.app.db, holdSeconds: 600, signingSecret, sandboxWebhookSecret, log: () => undefined });
    for (const role of ['manager', 'reception', 'accounting']) {
      const response = await json('POST', '/v1/auth/login', { email: `${role}@oggi.example`, password });
      tokens[role] = (response.body as { token: string }).token;
    }
  });

  afterAll(async () => {
    await database?.drop();
  });

  async function json(method: string, path: string, payload?: unknown, headers: Record<string, string> = {}) {
    const response = await app.request(path, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    const text = await response.text();
    return { status: response.status, body: text ? (JSON.parse(text) as unknown) : null };
  }
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function hold(spotId: string, day = today, promoCode?: string): Promise<string> {
    const response = await json('POST', '/v1/holds', { beachSlug: slug, spotId, day, promoCode }, { 'Idempotency-Key': `test-${randomUUID()}` });
    expect(response.status).toBe(201);
    return (response.body as { holdId: string }).holdId;
  }
  interface Checkout {
    bookingId: string;
    accessToken: string;
    status: string;
    payment: { reference: string; amountCents: number };
  }
  async function checkout(holdId: string): Promise<Checkout> {
    const response = await json('POST', '/v1/checkouts', { beachSlug: slug, holdId, guestName: 'Ada Prova', guestEmail: 'Ada@Example.org' });
    expect([200, 201]).toContain(response.status);
    return response.body as Checkout;
  }
  async function notify(reference: string, outcome: 'succeeded' | 'failed', eventId = `evt_${randomUUID()}`, secret = sandboxWebhookSecret) {
    const raw = JSON.stringify({ eventId, reference, outcome });
    const response = await app.request('/v1/payment-webhooks/sandbox', {
      method: 'POST',
      headers: { 'X-Ombre-Signature': createHmac('sha256', secret).update(raw).digest('hex') },
      body: raw,
    });
    return { status: response.status, result: ((await response.json()) as { result?: string }).result };
  }
  interface View {
    code: string;
    status: string;
    paymentStatus: string;
    presence: string;
    passCredential: string | null;
    totalCents: number;
  }
  const view = async (booked: Checkout) => (await json('GET', `/v1/beaches/${slug}/bookings/${booked.bookingId}`, undefined, bearer(booked.accessToken))).body as View;
  const stateOf = async (spotId: string, day = today) =>
    (await database.admin.query<{ state: string }>('SELECT state FROM inventory_day WHERE spot_id = $1 AND day = $2', [spotId, day])).rows[0]?.state;
  async function confirmedBooking(day = today, spotId = beach.spotIds[nextSpot++]!): Promise<Checkout & View> {
    const booked = await checkout(await hold(spotId, day));
    expect((await notify(booked.payment.reference, 'succeeded')).result).toBe('confirmed');
    return { ...booked, ...(await view(booked)) };
  }
  const scan = (credential: string, kind: 'entry' | 'exit', role = 'reception') =>
    json('POST', `/v1/manage/beaches/${slug}/access-events`, { credential, kind }, bearer(tokens[role]!));

  it('confirms a booking only when the payment succeeds, then issues the pass', async () => {
    const spotId = beach.spotIds[nextSpot++]!;
    const holdId = await hold(spotId, today, 'MARE10');
    const booked = await checkout(holdId);
    expect(booked.status).toBe('under_review');
    expect(booked.payment.amountCents).toBe(2700);
    expect((await checkout(holdId)).bookingId).toBe(booked.bookingId);

    const before = await view(booked);
    expect(before).toMatchObject({ status: 'under_review', paymentStatus: 'in_progress', passCredential: null, totalCents: 2700 });
    expect(await stateOf(spotId)).toBe('held');

    expect((await notify(booked.payment.reference, 'succeeded')).result).toBe('confirmed');
    const after = await view(booked);
    expect(after).toMatchObject({ status: 'confirmed', paymentStatus: 'succeeded', presence: 'expected' });
    expect(after.code).toMatch(/^OM-\d{6}-001$/);
    expect(after.passCredential).toMatch(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{32}$/);
    expect(await stateOf(spotId)).toBe('occupied');

    const wrongToken = await json('GET', `/v1/beaches/${slug}/bookings/${booked.bookingId}`, undefined, bearer('token-inventato-abbastanza-lungo'));
    expect(wrongToken.status).toBe(404);
  });

  it('applies each provider notification once, whatever arrives again or late', async () => {
    const booked = await checkout(await hold(beach.spotIds[nextSpot++]!));
    const eventId = `evt_${randomUUID()}`;
    expect((await notify(booked.payment.reference, 'succeeded', eventId)).result).toBe('confirmed');
    expect((await notify(booked.payment.reference, 'succeeded', eventId)).result).toBe('duplicate');
    expect((await notify(booked.payment.reference, 'failed')).result).toBe('ignored');
    expect((await notify('sbx_riferimento_sconosciuto', 'succeeded')).result).toBe('ignored');
    expect((await view(booked)).status).toBe('confirmed');
    const passes = await database.admin.query('SELECT 1 FROM pass WHERE booking_id = $1', [booked.bookingId]);
    expect(passes.rowCount).toBe(1);

    expect((await notify(booked.payment.reference, 'succeeded', undefined, 'segreto-sbagliato')).status).toBe(401);
    const noProvider = createApp({ db: database.app.db, holdSeconds: 600, signingSecret, log: () => undefined });
    expect((await noProvider.request('/v1/payment-webhooks/sandbox', { method: 'POST', body: '{}' })).status).toBe(503);
  });

  it('frees the spot and gives the promotion use back when the payment fails', async () => {
    const spotId = beach.spotIds[nextSpot++]!;
    const used = async () => (await database.admin.query<{ committed_uses: number }>("SELECT committed_uses FROM promotion WHERE code = 'MARE10'")).rows[0]!.committed_uses;
    const start = await used();
    const booked = await checkout(await hold(spotId, today, 'MARE10'));
    expect(await used()).toBe(start + 1);
    expect((await notify(booked.payment.reference, 'failed')).result).toBe('cancelled');
    expect(await view(booked)).toMatchObject({ status: 'cancelled', paymentStatus: 'failed', passCredential: null });
    expect(await stateOf(spotId)).toBe('available');
    expect(await used()).toBe(start);
  });

  it('handles a payment that succeeds after the hold ran out', async () => {
    const expire = (holdId: string) => database.admin.query("UPDATE hold SET expires_at = now() - interval '1 minute' WHERE id = $1", [holdId]);

    const stale = await hold(beach.spotIds[nextSpot]!);
    await expire(stale);
    const tooLate = await json('POST', '/v1/checkouts', { beachSlug: slug, holdId: stale, guestName: 'Ada', guestEmail: 'ada@example.org' });
    expect((tooLate.body as { error: { code: string } }).error.code).toBe('hold_expired');

    // Day still free: the booking is confirmed anyway.
    const freeSpot = beach.spotIds[nextSpot++]!;
    const lateHold = await hold(freeSpot);
    const late = await checkout(lateHold);
    await expire(lateHold);
    expect((await notify(late.payment.reference, 'succeeded')).result).toBe('confirmed');
    expect(await stateOf(freeSpot)).toBe('occupied');

    // Day taken by someone else in the meantime: no booking, a refund is recorded.
    const contested = beach.spotIds[nextSpot++]!;
    const firstHold = await hold(contested);
    const first = await checkout(firstHold);
    await expire(firstHold);
    await hold(contested);
    expect((await notify(first.payment.reference, 'succeeded')).result).toBe('refund_due');
    expect(await view(first)).toMatchObject({ status: 'cancelled', paymentStatus: 'succeeded', passCredential: null });
    const refunds = await database.admin.query<{ status: string; amount_cents: number; reason: string }>('SELECT status, amount_cents, reason FROM refund');
    expect(refunds.rows).toEqual([{ status: 'requested', amount_cents: 3000, reason: 'inventory_unavailable' }]);
    expect(await stateOf(contested)).toBe('held');
  });

  it('registers one entry per pass, then exit and re-entry, by QR text or short code', async () => {
    const booked = await confirmedBooking();
    const pass = booked.passCredential!;

    const entry = await scan(pass, 'entry');
    expect(entry.status).toBe(201);
    expect(entry.body).toMatchObject({ code: booked.code, guestName: 'Ada Prova', presence: 'inside' });
    const repeat = await scan(pass, 'entry');
    expect(repeat.status).toBe(409);
    expect((repeat.body as { error: { message: string } }).error.message).toBe('This guest is already inside');

    expect((await scan(pass, 'exit')).body).toMatchObject({ presence: 'outside_reentry_allowed' });
    expect((await scan(booked.code.toLowerCase(), 'entry')).body).toMatchObject({ presence: 'inside' });
    expect((await view(booked)).presence).toBe('inside');

    const simultaneous = await confirmedBooking();
    const scans = await Promise.all(Array.from({ length: 6 }, () => scan(simultaneous.passCredential!, 'entry')));
    expect(scans.filter((result) => result.status === 201)).toHaveLength(1);
    expect(scans.filter((result) => result.status === 409)).toHaveLength(5);
    const entries = await database.admin.query("SELECT 1 FROM access_event WHERE booking_id = $1 AND kind = 'entry'", [simultaneous.bookingId]);
    expect(entries.rowCount).toBe(1);
  });

  it('refuses forged passes, other days, cancelled bookings and roles without the permission', async () => {
    const booked = await confirmedBooking();
    const pass = booked.passCredential!;
    const forged = `${pass.slice(0, -1)}${pass.endsWith('A') ? 'B' : 'A'}`;
    expect((await scan(forged, 'entry')).status).toBe(422);
    expect((await scan(`${randomUUID()}.${pass.split('.')[1]}`, 'entry')).status).toBe(422);
    expect((await scan('OM-000000-999', 'entry')).status).toBe(422);
    expect((await scan(pass, 'exit')).status).toBe(409);
    expect((await scan(pass, 'entry', 'accounting')).status).toBe(403);
    expect((await json('POST', `/v1/manage/beaches/${slug}/access-events`, { credential: pass, kind: 'entry' })).status).toBe(401);

    const future = await confirmedBooking(tomorrow, beach.spotIds[8]!);
    const early = await scan(future.passCredential!, 'entry');
    expect((early.body as { error: { code: string } }).error.code).toBe('wrong_day');

    await database.admin.query("UPDATE booking SET status = 'cancelled' WHERE id = $1", [booked.bookingId]);
    expect((await scan(pass, 'entry')).status).toBe(422);
  });

  it('shows the front desk the bookings of the day without the guests email', async () => {
    const listed = await json('GET', `/v1/manage/beaches/${slug}/bookings?day=${today}`, undefined, bearer(tokens.reception!));
    const rows = (listed.body as { bookings: { code: string; presence: string }[] }).bookings;
    expect(rows.length).toBeGreaterThanOrEqual(6);
    expect(new Set(rows.map((row) => row.code)).size).toBe(rows.length);
    expect(rows.every((row) => /^OM-\d{6}-\d{3}$/.test(row.code))).toBe(true);
    expect(JSON.stringify(listed.body)).not.toMatch(/example\.org/);
    expect((await json('GET', `/v1/manage/beaches/${slug}/bookings?day=${today}`, undefined, bearer(tokens.accounting!))).status).toBe(403);
  });
});
