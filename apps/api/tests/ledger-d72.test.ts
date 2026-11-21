import { createHmac, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setPaymentSettings, setSplitRule, upsertUser } from '@ombre/db';
import { createTestDatabase, insertBeach, testAdminUrl, type TestBeach, type TestDatabase } from '@ombre/db/testing';
import { createApp } from '../src/app';

// D72 (correzioni del gruppo A, iterazione 1 — criteri di accettazione 1 e 2):
// the ledger says only money that really arrived, and a desk sale carries no
// platform share — those basis points flow to the beach club.

const password = 'password-di-prova-123';
const signingSecret = 'segreto-di-prova-lungo-almeno-32-caratteri';
const sandboxWebhookSecret = 'segreto-del-fornitore-di-prova';
const siteUrl = 'https://ombre.example';
const slug = 'registro';
let day = '';
let seasonEnd = '';

describe.skipIf(!testAdminUrl)('D72: inflows only when collected, no platform share at the desk', () => {
  let database: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let beach: TestBeach;
  const tokens: Record<string, string> = {};
  let towelId = '';
  let managerId = '';
  let nextSpot = 0;

  beforeAll(async () => {
    database = await createTestDatabase(testAdminUrl!);
    const dates = await database.admin.query<{ today: string; season_end: string }>(
      "SELECT (now() AT TIME ZONE 'Europe/Rome')::date::text AS today, ((now() AT TIME ZONE 'Europe/Rome')::date + 90)::text AS season_end",
    );
    day = dates.rows[0]!.today;
    seasonEnd = dates.rows[0]!.season_end;
    beach = await insertBeach(database.admin, slug, { spots: 12, day });
    await setSplitRule(database.adminUrl, beach.beachId, { seasonHolder: 5000, beachClub: 4000, platform: 1000 });
    const towel = await database.admin.query<{ id: string }>(
      "INSERT INTO extra_service (beach_id, name_it, name_en, unit_price_cents) VALUES ($1, 'Telo mare', 'Beach towel', 500) RETURNING id",
      [beach.beachId],
    );
    towelId = towel.rows[0]!.id;
    for (const role of ['manager', 'reception'] as const) {
      const userId = await upsertUser(database.adminUrl, { email: `${role}@registro.example`, name: role, password }, [{ beachId: beach.beachId, role }]);
      if (role === 'manager') managerId = userId;
    }
    await upsertUser(database.adminUrl, { email: 'nora@registro.example', name: 'nora', password });
    app = createApp({ db: database.app.db, rateLimiter: { hit: () => 0 }, holdSeconds: 600, signingSecret, sandboxWebhookSecret, siteUrl, log: () => undefined });
    for (const name of ['manager', 'reception', 'nora']) {
      tokens[name] = ((await call('POST', '/v1/auth/login', { email: `${name}@registro.example`, password })).body as { token: string }).token;
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
  const admin = <T extends Record<string, unknown>>(text: string, values: unknown[] = []) => database.admin.query<T>(text, values);

  interface DeskInput {
    spotId?: string;
    collect?: 'now' | 'later';
    extras?: { serviceId: string; quantity: number }[];
  }
  async function desk(input: DeskInput = {}): Promise<string> {
    const spotId = input.spotId ?? beach.spotIds[nextSpot++]!;
    const response = await call('POST', `${manage}/desk-bookings`, { spotId, day, guestName: 'Rino Prova', ...input }, 'reception');
    expect(response.status).toBe(201);
    return (response.body as { code: string }).code;
  }

  async function notify(reference: string, outcome: 'succeeded' | 'failed') {
    const raw = JSON.stringify({ eventId: `evt_${randomUUID()}`, reference, outcome });
    const response = await app.request('/v1/payment-webhooks/sandbox', {
      method: 'POST',
      headers: { 'X-Ombre-Signature': createHmac('sha256', sandboxWebhookSecret).update(raw).digest('hex') },
      body: raw,
    });
    return ((await response.json()) as { result: string }).result;
  }

  /** The inflows of the group's ledger, smallest first: only money that arrived. */
  const receivedOf = async (code: string) =>
    (
      await admin<{ amount_cents: number }>(
        "SELECT e.amount_cents FROM ledger_entry e JOIN booking b ON b.id = e.booking_id WHERE b.code = $1 AND e.kind = 'payment_received' ORDER BY e.amount_cents",
        [code],
      )
    ).rows.map((row) => Number(row.amount_cents));

  /** The expected shares of the sale, in the enum order of the parties. */
  const allocationsOf = async (code: string) =>
    (
      await admin<{ party: string; amount_cents: number; bps: number }>(
        'SELECT a.party::text AS party, a.amount_cents, a.bps FROM allocation a JOIN booking b ON b.id = a.booking_id WHERE b.code = $1 ORDER BY a.party',
        [code],
      )
    ).rows.map((row) => ({ party: row.party, amountCents: Number(row.amount_cents), bps: Number(row.bps) }));

  // ---- Criterion 1: payment_received only when the money arrives ----

  it('writes no inflow for a desk booking «da incassare», one per collection, and their sum closes at the total', async () => {
    const code = await desk({ collect: 'later' });
    // (a) Confirmed «da incassare»: no payment_received at all for the group.
    expect(await receivedOf(code)).toEqual([]);

    // (b) A partial collection at the desk: the inflow exists for that amount alone.
    expect((await call('POST', `${manage}/bookings/${code}/collect`, { amountCents: 1200 }, 'reception')).status).toBe(200);
    expect(await receivedOf(code)).toEqual([1200]);

    // (d) A collection beyond the residual is refused as today and leaves no trace.
    const over = await call('POST', `${manage}/bookings/${code}/collect`, { amountCents: 2000 }, 'reception');
    expect(over.status).toBe(409);
    expect(errorCode(over)).toBe('invalid_state');
    expect(await receivedOf(code)).toEqual([1200]);

    // (c) After the balance, the inflows sum to the total of the group.
    expect((await call('POST', `${manage}/bookings/${code}/collect`, { amountCents: 1800 }, 'reception')).status).toBe(200);
    const inflows = await receivedOf(code);
    expect(inflows).toEqual([1200, 1800]);
    expect(inflows.reduce((sum, amount) => sum + amount, 0)).toBe(3000);
  });

  it('records the inflow when a payment request is collected, for the requested amount', async () => {
    const code = await desk({ collect: 'later' });
    const created = await call('POST', `${manage}/bookings/${code}/payment-requests`, { amountCents: 1000 }, 'reception');
    expect(created.status).toBe(201);
    const payUrl = (created.body as { payUrl: string }).payUrl;
    const started = await call('POST', `/v1/pay-requests/${payUrl.split('/').pop()!}/payments`);
    expect(started.status).toBe(201);
    const reference = (started.body as { payment: { reference: string } }).payment.reference;
    expect(await notify(reference, 'succeeded')).toBe('collected');
    expect(await receivedOf(code)).toEqual([1000]);
  });

  // ---- Criterion 2: no platform share on desk sales, online unchanged ----

  it('gives the beach club 100% of the spot price on a desk sale of an ordinary day', async () => {
    const code = await desk({ extras: [{ serviceId: towelId, quantity: 1 }] });
    // D72: sul banco nessuna quota di piattaforma — the club takes the whole
    // spot price; the extras stay out of the split, as always.
    const shares = await allocationsOf(code);
    expect(shares).toEqual([{ party: 'beach_club', amountCents: 3000, bps: 10000 }]);
    // The shares sum to the gross of the spot: total (3500) minus extras (500).
    expect(shares.reduce((sum, share) => sum + share.amountCents, 0)).toBe(3000);
    // Paid at the desk at once: the inflow is comprehensive and immediate.
    expect(await receivedOf(code)).toEqual([3500]);
  });

  it('keeps the seasonal share untouched and moves the platform share to the club on a desk sale of a shared day', async () => {
    // A season holder offers a day, the manager approves it at 3000 (as online).
    const contract = await call('POST', `${manage}/contracts`, { holderEmail: 'nora@registro.example', spotId: beach.spotIds[10], validFrom: day, validTo: seasonEnd }, 'manager');
    expect(contract.status).toBe(201);
    const contractId = (contract.body as { contractId: string }).contractId;
    expect((await call('PUT', `${manage}/sharing-settings`, { dailySharedCap: 1, sharedPriceCents: 3000 }, 'manager')).status).toBe(204);
    expect((await call('POST', `/v1/season/contracts/${contractId}/proposals`, { days: [day] }, 'nora')).status).toBe(200);
    const pending = ((await call('GET', `${manage}/proposals?status=proposed`, undefined, 'manager')).body as { proposals: { proposalId: string }[] }).proposals;
    expect((await call('POST', `${manage}/proposals/${pending[0]!.proposalId}/decision`, { approve: true }, 'manager')).status).toBe(204);

    const code = await desk({ spotId: beach.spotIds[10]! });
    // D72: sul banco nessuna quota di piattaforma — the seasonal share keeps the
    // same basis points as online (5000); the platform points join the club's.
    const shares = await allocationsOf(code);
    expect(shares).toEqual([
      { party: 'season_holder', amountCents: 1500, bps: 5000 },
      { party: 'beach_club', amountCents: 1500, bps: 5000 },
    ]);
    expect(shares.reduce((sum, share) => sum + share.amountCents, 0)).toBe(3000);
  });

  it('keeps the online quotas exactly as today', async () => {
    const spotId = beach.spotIds[nextSpot++]!;
    const held = await call('POST', '/v1/holds', { beachSlug: slug, spotId, day }, undefined, { 'Idempotency-Key': `test-${randomUUID()}` });
    expect(held.status).toBe(201);
    const booked = await call('POST', '/v1/checkouts', { beachSlug: slug, holdId: (held.body as { holdId: string }).holdId, guestName: 'Ada Prova', guestEmail: 'ada@example.org' });
    expect(booked.status).toBe(201);
    const checkout = booked.body as { payment: { reference: string } };
    expect(await notify(checkout.payment.reference, 'succeeded')).toBe('confirmed');

    const codes = await admin<{ code: string }>('SELECT b.code FROM booking b JOIN inventory_day d ON d.id = b.inventory_day_id WHERE d.spot_id = $1', [spotId]);
    const code = codes.rows[0]!.code;
    // Online nothing changes: ordinary day, 90/10 between club and platform.
    const shares = await allocationsOf(code);
    expect(shares).toEqual([
      { party: 'beach_club', amountCents: 2700, bps: 9000 },
      { party: 'platform', amountCents: 300, bps: 1000 },
    ]);
    expect(shares.reduce((sum, share) => sum + share.amountCents, 0)).toBe(3000);
    // Paid online at confirmation: the inflow is written at once, as today.
    expect(await receivedOf(code)).toEqual([3000]);
  });

  it('writes the deposit alone at an online confirmation in deposit mode, and the balance at its collection', async () => {
    await setPaymentSettings(database.app.db, { userId: managerId, beachId: beach.beachId, role: 'manager' }, { mode: 'deposit', depositPercent: 30 });
    const spotId = beach.spotIds[nextSpot++]!;
    const held = await call('POST', '/v1/holds', { beachSlug: slug, spotId, day }, undefined, { 'Idempotency-Key': `test-${randomUUID()}` });
    expect(held.status).toBe(201);
    const booked = await call('POST', '/v1/checkouts', { beachSlug: slug, holdId: (held.body as { holdId: string }).holdId, guestName: 'Ugo Prova', guestEmail: 'ugo@example.org' });
    expect(booked.status).toBe(201);
    const checkout = booked.body as { payment: { reference: string; amountCents: number } };
    expect(checkout.payment.amountCents).toBe(900);
    expect(await notify(checkout.payment.reference, 'succeeded')).toBe('confirmed');
    const codes = await admin<{ code: string }>('SELECT b.code FROM booking b JOIN inventory_day d ON d.id = b.inventory_day_id WHERE d.spot_id = $1', [spotId]);
    const code = codes.rows[0]!.code;

    // D72: una riga per pagamento, per l'incassato — the confirmation writes the
    // deposit the payment collected, never the whole total.
    expect(await receivedOf(code)).toEqual([900]);

    // The desk collects the balance: the inflows now sum to the total.
    expect((await call('POST', `${manage}/bookings/${code}/collect`, { amountCents: 2100 }, 'reception')).status).toBe(200);
    const inflows = await receivedOf(code);
    expect(inflows).toEqual([900, 2100]);
    expect(inflows.reduce((sum, amount) => sum + amount, 0)).toBe(3000);
  });
});
