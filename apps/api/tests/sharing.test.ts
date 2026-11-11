import { createHmac, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDay, setSplitRule, upsertUser } from '@ombre/db';
import { createTestDatabase, insertBeach, testAdminUrl, type TestBeach, type TestDatabase } from '@ombre/db/testing';
import { createApp } from '../src/app';

const password = 'password-di-prova-123';
const signingSecret = 'segreto-di-prova-lungo-almeno-32-caratteri';
const sandboxWebhookSecret = 'segreto-del-fornitore-di-prova';
const slug = 'riva';
const ordinaryDay = '2099-07-01';
const period = { validFrom: '2099-06-01', validTo: '2099-08-31' };

describe.skipIf(!testAdminUrl)('season sharing, shares and statements', () => {
  let database: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let beach: TestBeach;
  const tokens: Record<string, string> = {};
  const contracts: Record<string, string> = {};

  beforeAll(async () => {
    database = await createTestDatabase(testAdminUrl!);
    beach = await insertBeach(database.admin, slug, { spots: 6, day: ordinaryDay });
    await database.admin.query("INSERT INTO promotion (beach_id, code, percent_bps) VALUES ($1, 'MARE10', 1000)", [beach.beachId]);
    await setSplitRule(database.adminUrl, beach.beachId, { seasonHolder: 5000, beachClub: 4000, platform: 1000 });
    const other = await insertBeach(database.admin, 'altra-riva', { spots: 1, day: ordinaryDay });
    await upsertUser(database.adminUrl, { email: 'manager@riva.example', name: 'Gestore', password }, [{ beachId: beach.beachId, role: 'manager' }]);
    await upsertUser(database.adminUrl, { email: 'accounting@riva.example', name: 'Contabile', password }, [{ beachId: beach.beachId, role: 'accounting' }]);
    await upsertUser(database.adminUrl, { email: 'reception@riva.example', name: 'Reception', password }, [{ beachId: beach.beachId, role: 'reception' }]);
    await upsertUser(database.adminUrl, { email: 'intruso@altra-riva.example', name: 'Intruso', password }, [{ beachId: other.beachId, role: 'manager' }]);
    for (const name of ['anna', 'bruno', 'carla']) await upsertUser(database.adminUrl, { email: `${name}@stagionali.example`, name, password });
    app = createApp({ db: database.app.db, holdSeconds: 600, signingSecret, sandboxWebhookSecret, log: () => undefined });
    for (const email of ['manager@riva.example', 'accounting@riva.example', 'reception@riva.example', 'intruso@altra-riva.example', 'anna@stagionali.example', 'bruno@stagionali.example', 'carla@stagionali.example']) {
      tokens[email.split('@')[0]!] = ((await call('POST', '/v1/auth/login', { email, password })).body as { token: string }).token;
    }
  });

  afterAll(async () => {
    await database?.drop();
  });

  async function call(method: string, path: string, payload?: unknown, as?: string, headers: Record<string, string> = {}) {
    const response = await app.request(path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(as ? { Authorization: `Bearer ${tokens[as]}` } : {}), ...headers },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    const text = await response.text();
    return { status: response.status, body: text ? (JSON.parse(text) as unknown) : null };
  }
  const manage = `/v1/manage/beaches/${slug}`;
  const errorCode = (result: { body: unknown }) => (result.body as { error?: { code?: string } }).error?.code;
  const proposals = async (status?: string) =>
    ((await call('GET', `${manage}/proposals${status ? `?status=${status}` : ''}`, undefined, 'manager')).body as { proposals: { proposalId: string; day: string; spotCode: string; status: string }[] }).proposals;
  const freeCodes = async (day: string) =>
    ((await call('GET', `/v1/beaches/${slug}/availability?day=${day}`)).body as { spots: { code: string; spotId: string; shared: boolean; priceCents: number }[] }).spots;

  async function buy(spotId: string, day: string, promoCode?: string): Promise<string> {
    const held = await call('POST', '/v1/holds', { beachSlug: slug, spotId, day, promoCode }, undefined, { 'Idempotency-Key': `test-${randomUUID()}` });
    expect(held.status).toBe(201);
    const booked = (await call('POST', '/v1/checkouts', { beachSlug: slug, holdId: (held.body as { holdId: string }).holdId, guestName: 'Ospite Riservato', guestEmail: 'ospite@example.org' })).body as { bookingId: string; payment: { reference: string } };
    const raw = JSON.stringify({ eventId: `evt_${randomUUID()}`, reference: booked.payment.reference, outcome: 'succeeded' });
    const notified = await app.request('/v1/payment-webhooks/sandbox', { method: 'POST', headers: { 'X-Ombre-Signature': createHmac('sha256', sandboxWebhookSecret).update(raw).digest('hex') }, body: raw });
    expect(((await notified.json()) as { result: string }).result).toBe('confirmed');
    return booked.bookingId;
  }

  it('lets only the manager register season passes, one per spot and period', async () => {
    const request = { holderEmail: 'anna@stagionali.example', spotId: beach.spotIds[0], ...period };
    expect((await call('POST', `${manage}/contracts`, request, 'reception')).status).toBe(403);
    expect((await call('POST', `${manage}/contracts`, request, 'intruso')).status).toBe(403);
    expect((await call('POST', `${manage}/contracts`, { ...request, holderEmail: 'nessuno@stagionali.example' }, 'manager')).status).toBe(404);

    const created = await call('POST', `${manage}/contracts`, request, 'manager');
    expect(created.status).toBe(201);
    contracts.anna = (created.body as { contractId: string }).contractId;
    const overlap = await call('POST', `${manage}/contracts`, { ...request, holderEmail: 'bruno@stagionali.example', validFrom: '2099-08-01', validTo: '2099-09-15' }, 'manager');
    expect(errorCode(overlap)).toBe('invalid_state');

    contracts.bruno = ((await call('POST', `${manage}/contracts`, { ...request, holderEmail: 'bruno@stagionali.example', spotId: beach.spotIds[1] }, 'manager')).body as { contractId: string }).contractId;
    contracts.carla = ((await call('POST', `${manage}/contracts`, { ...request, holderEmail: 'carla@stagionali.example', spotId: beach.spotIds[2], sharingMode: 'automatic' }, 'manager')).body as { contractId: string }).contractId;

    const mine = (await call('GET', '/v1/season/contracts', undefined, 'anna')).body as { contracts: Record<string, unknown>[] };
    expect(mine.contracts).toEqual([{ contractId: contracts.anna, beachSlug: slug, beachName: 'Bagno riva', spotCode: 'A01', ...period, status: 'active', sharingMode: 'per_day' }]);
  });

  it('expands a recurrence and tells the holder what happened to each day', async () => {
    const summary = await call('POST', `/v1/season/contracts/${contracts.anna}/proposals`, { recurrence: { from: '2099-07-06', to: '2099-07-19', weekdays: [2, 4] } }, 'anna');
    expect(summary.body).toEqual({ added: ['2099-07-07', '2099-07-09', '2099-07-14', '2099-07-16'], alreadyPresent: [], outsidePeriod: [], waiting: [] });

    const again = await call('POST', `/v1/season/contracts/${contracts.anna}/proposals`, { days: ['2099-07-07', '2099-09-10', '2099-07-21'] }, 'anna');
    expect(again.body).toEqual({ added: ['2099-07-21'], alreadyPresent: ['2099-07-07'], outsidePeriod: ['2099-09-10'], waiting: [] });

    expect((await call('POST', `/v1/season/contracts/${contracts.anna}/proposals`, { days: ['2099-07-08'] }, 'bruno')).status).toBe(404);
    expect((await call('POST', `/v1/season/contracts/${contracts.anna}/proposals`, { days: ['2099-07-08'] })).status).toBe(401);
    expect((await freeCodes('2099-07-07')).length).toBe(0);
  });

  it('publishes a day only after the manager approves it, at the price the manager sets', async () => {
    const pending = await proposals('proposed');
    expect(pending.map((row) => row.day)).toEqual(['2099-07-07', '2099-07-09', '2099-07-14', '2099-07-16', '2099-07-21']);
    const first = pending[0]!;

    expect(errorCode(await call('POST', `${manage}/proposals/${first.proposalId}/decision`, { approve: true }, 'manager'))).toBe('invalid_state');
    expect((await call('PUT', `${manage}/sharing-settings`, { dailySharedCap: 1, sharedPriceCents: 3000 }, 'reception')).status).toBe(403);
    expect((await call('PUT', `${manage}/sharing-settings`, { dailySharedCap: 1, sharedPriceCents: 3000 }, 'manager')).status).toBe(204);

    expect((await call('POST', `${manage}/proposals/${first.proposalId}/decision`, { approve: true }, 'anna')).status).toBe(403);
    expect((await call('POST', `${manage}/proposals/${first.proposalId}/decision`, { approve: true }, 'manager')).status).toBe(204);
    expect(errorCode(await call('POST', `${manage}/proposals/${first.proposalId}/decision`, { approve: false }, 'manager'))).toBe('invalid_state');
    expect((await call('POST', `${manage}/proposals/${pending[1]!.proposalId}/decision`, { approve: false }, 'manager')).status).toBe(204);

    expect(await freeCodes('2099-07-07')).toMatchObject([{ code: 'A01', shared: true, priceCents: 3000 }]);
    expect((await freeCodes('2099-07-09')).length).toBe(0);
  });

  it('never exceeds the daily limit of shared days, even with approvals at the same instant', async () => {
    await call('POST', `/v1/season/contracts/${contracts.bruno}/proposals`, { days: ['2099-07-07', '2099-07-14'] }, 'bruno');
    const second = (await proposals('proposed')).find((row) => row.day === '2099-07-07' && row.spotCode === 'A02')!;
    expect(errorCode(await call('POST', `${manage}/proposals/${second.proposalId}/decision`, { approve: true }, 'manager'))).toBe('cap_reached');

    const sameDay = (await proposals('proposed')).filter((row) => row.day === '2099-07-14');
    expect(sameDay).toHaveLength(2);
    const decisions = await Promise.all(sameDay.map((row) => call('POST', `${manage}/proposals/${row.proposalId}/decision`, { approve: true }, 'manager')));
    expect(decisions.map((result) => result.status).sort()).toEqual([204, 409]);
    expect((await freeCodes('2099-07-14')).length).toBe(1);
  });

  it('publishes automatically for passes approved once, within the same limit', async () => {
    const summary = await call('POST', `/v1/season/contracts/${contracts.carla}/proposals`, { days: ['2099-07-07', '2099-07-28'] }, 'carla');
    expect(summary.body).toEqual({ added: ['2099-07-07', '2099-07-28'], alreadyPresent: [], outsidePeriod: [], waiting: ['2099-07-07'] });
    expect(await freeCodes('2099-07-28')).toMatchObject([{ code: 'A03', shared: true }]);
  });

  it('lets the holder take back a free day but not one that is held or sold', async () => {
    expect((await call('POST', `/v1/season/contracts/${contracts.carla}/withdrawals`, { day: '2099-07-28' }, 'carla')).status).toBe(204);
    expect((await freeCodes('2099-07-28')).length).toBe(0);
    expect((await call('POST', `/v1/season/contracts/${contracts.carla}/withdrawals`, { day: '2099-07-28' }, 'carla')).status).toBe(404);

    const [spot] = await freeCodes('2099-07-07');
    const held = await call('POST', '/v1/holds', { beachSlug: slug, spotId: spot!.spotId, day: '2099-07-07' }, undefined, { 'Idempotency-Key': `test-${randomUUID()}` });
    expect(held.status).toBe(201);
    const refused = await call('POST', `/v1/season/contracts/${contracts.anna}/withdrawals`, { day: '2099-07-07' }, 'anna');
    expect(errorCode(refused)).toBe('invalid_state');
    await database.admin.query("UPDATE hold SET expires_at = now() - interval '1 minute' WHERE id = $1", [(held.body as { holdId: string }).holdId]);
  });

  it('splits a shared sale 50/40/10 and keeps the holder share inside the beach club on ordinary days', async () => {
    const [shared] = await freeCodes('2099-07-07');
    const sharedBooking = await buy(shared!.spotId, '2099-07-07', 'MARE10');
    const ordinaryBooking = await buy(beach.spotIds[5]!, ordinaryDay, 'MARE10');

    const parts = async (bookingId: string) =>
      (await database.admin.query<{ party: string; amount_cents: number; bps: number }>('SELECT a.party::text AS party, a.amount_cents, a.bps FROM allocation a WHERE a.booking_id = $1 ORDER BY a.party', [bookingId])).rows;
    expect(await parts(sharedBooking)).toEqual([
      { party: 'season_holder', amount_cents: 1350, bps: 5000 },
      { party: 'beach_club', amount_cents: 1080, bps: 4000 },
      { party: 'platform', amount_cents: 270, bps: 1000 },
    ]);
    expect(await parts(ordinaryBooking)).toEqual([
      { party: 'beach_club', amount_cents: 2430, bps: 9000 },
      { party: 'platform', amount_cents: 270, bps: 1000 },
    ]);

    const unbalanced = await database.admin.query(
      'SELECT b.id FROM booking b JOIN allocation a ON a.booking_id = b.id GROUP BY b.id, b.total_cents HAVING sum(a.amount_cents) <> b.total_cents',
    );
    expect(unbalanced.rowCount).toBe(0);
    await expect(database.admin.query('UPDATE ledger_entry SET amount_cents = 0')).rejects.toThrow(/cannot be changed/);
    await expect(database.admin.query('DELETE FROM ledger_entry')).rejects.toThrow(/cannot be changed/);
  });

  it('shows each role its own figures: summary for accounting, share without guest data for the holder', async () => {
    const reportPath = `${manage}/reports/summary?from=2099-07-01&to=2099-07-31`;
    expect((await call('GET', reportPath, undefined, 'reception')).status).toBe(403);
    const before = (await call('GET', reportPath, undefined, 'accounting')).body as Record<string, unknown>;
    expect(before).toMatchObject({
      bookings: { shared: 1, ordinary: 1 },
      grossCents: { shared: 2700, ordinary: 2700 },
      byParty: {
        season_holder: { expected: 1350, accrued: 0 },
        beach_club: { expected: 3510, accrued: 0 },
        platform: { expected: 540, accrued: 0 },
      },
    });

    expect(await closeDay(database.app.db, beach.beachId, '2099-07-07')).toEqual({ completed: 1, accrued: 3 });
    expect(await closeDay(database.app.db, beach.beachId, '2099-07-07')).toEqual({ completed: 0, accrued: 0 });
    const after = (await call('GET', reportPath, undefined, 'manager')).body as { byParty: Record<string, { expected: number; accrued: number }> };
    expect(after.byParty.season_holder).toMatchObject({ expected: 0, accrued: 1350 });
    expect(after.byParty.beach_club).toMatchObject({ expected: 2430, accrued: 1080 });

    const statement = await call('GET', `/v1/season/contracts/${contracts.anna}/statement`, undefined, 'anna');
    const sold = (statement.body as { days: { day: string; sold: boolean; shareCents: number | null; shareState: string | null; proposal: string }[] }).days;
    expect(sold.find((row) => row.day === '2099-07-07')).toEqual({ day: '2099-07-07', proposal: 'approved', sold: true, shareCents: 1350, shareState: 'accrued' });
    expect(sold.find((row) => row.day === '2099-07-09')).toMatchObject({ proposal: 'rejected', sold: false, shareCents: null });
    expect(JSON.stringify(statement.body)).not.toMatch(/Ospite|example\.org/);
    expect((await call('GET', `/v1/season/contracts/${contracts.anna}/statement`, undefined, 'bruno')).status).toBe(404);
  });

  it('stops new sales when a pass is suspended and leaves confirmed bookings alone', async () => {
    const day = '2099-07-21';
    const pending = (await proposals('proposed')).find((row) => row.day === day)!;
    expect((await call('POST', `${manage}/proposals/${pending.proposalId}/decision`, { approve: true }, 'manager')).status).toBe(204);
    expect((await freeCodes(day)).length).toBe(1);

    expect((await call('POST', `${manage}/contracts/${contracts.anna}/status`, { status: 'suspended' }, 'manager')).status).toBe(204);
    expect((await freeCodes(day)).length).toBe(0);
    expect(errorCode(await call('POST', `/v1/season/contracts/${contracts.anna}/proposals`, { days: ['2099-07-30'] }, 'anna'))).toBe('invalid_state');
    const kept = await database.admin.query("SELECT 1 FROM booking WHERE status = 'completed'");
    expect(kept.rowCount).toBe(1);

    expect((await call('POST', `${manage}/contracts/${contracts.anna}/status`, { status: 'active' }, 'manager')).status).toBe(204);
    expect((await freeCodes(day)).length).toBe(1);
  });
});
