import { createHmac, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { releaseExpiredHolds, setSplitRule, upsertUser } from '@ombre/db';
import { createTestDatabase, insertBeach, testAdminUrl, type TestBeach, type TestDatabase } from '@ombre/db/testing';
import { createApp } from '../src/app';

// Extra services in the purchase flow (spec §4.2, acceptance criterion 5).

const password = 'password-di-prova-123';
const signingSecret = 'segreto-di-prova-lungo-almeno-32-caratteri';
const sandboxWebhookSecret = 'segreto-del-fornitore-di-prova';
const slug = 'servizi';
// The pass is scanned on the booked day, so the suite works on today in the
// beach club's time zone, like the booking suite does.
let day = '';
let seasonEnd = '';

interface Line {
  serviceId: string;
  name: { it: string; en: string | null };
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
}

describe.skipIf(!testAdminUrl)('extra services in the purchase flow', () => {
  let database: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let beach: TestBeach;
  const tokens: Record<string, string> = {};
  const services: Record<string, string> = {};
  let nextSpot = 0;

  beforeAll(async () => {
    database = await createTestDatabase(testAdminUrl!);
    const dates = await database.admin.query<{ today: string; season_end: string }>(
      "SELECT (now() AT TIME ZONE 'Europe/Rome')::date::text AS today, ((now() AT TIME ZONE 'Europe/Rome')::date + 90)::text AS season_end",
    );
    day = dates.rows[0]!.today;
    seasonEnd = dates.rows[0]!.season_end;
    beach = await insertBeach(database.admin, slug, { spots: 12, day });
    await database.admin.query("INSERT INTO promotion (beach_id, code, percent_bps) VALUES ($1, 'MARE10', 1000)", [beach.beachId]);
    await setSplitRule(database.adminUrl, beach.beachId, { seasonHolder: 5000, beachClub: 4000, platform: 1000 });
    for (const role of ['manager', 'reception', 'accounting'] as const) {
      await upsertUser(database.adminUrl, { email: `${role}@servizi.example`, name: role, password }, [{ beachId: beach.beachId, role }]);
    }
    await upsertUser(database.adminUrl, { email: 'anna@servizi.example', name: 'anna', password });
    app = createApp({ db: database.app.db, rateLimiter: { hit: () => 0 }, holdSeconds: 600, signingSecret, sandboxWebhookSecret, log: () => undefined });
    for (const name of ['manager', 'reception', 'accounting', 'anna']) {
      tokens[name] = ((await call('POST', '/v1/auth/login', { email: `${name}@servizi.example`, password })).body as { token: string }).token;
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

  type Extras = { serviceId: string; quantity: number }[];
  interface Money {
    listPriceCents: number;
    discountCents: number;
    extrasCents: number;
    totalCents: number;
    promoCode: string | null;
    extras: Line[];
  }
  const quote = (spotId: string, extras?: Extras, promoCode?: string) => call('POST', '/v1/quotes', { beachSlug: slug, spotId, day, promoCode, extras });
  const holdRequest = (spotId: string, extras?: Extras, promoCode?: string, key = `test-${randomUUID()}`) =>
    call('POST', '/v1/holds', { beachSlug: slug, spotId, day, promoCode, extras }, undefined, { 'Idempotency-Key': key });
  async function checkout(holdId: string) {
    const response = await call('POST', '/v1/checkouts', { beachSlug: slug, holdId, guestName: 'Ada Prova', guestEmail: 'ada@example.org' });
    expect([200, 201]).toContain(response.status);
    return response.body as { bookingId: string; accessToken: string; payment: { reference: string; amountCents: number } };
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
  const ledgerOf = async (bookingId: string) =>
    (await database.admin.query<{ kind: string; party: string | null; amount_cents: number }>('SELECT kind, party, amount_cents FROM ledger_entry WHERE booking_id = $1 ORDER BY kind, party', [bookingId])).rows;

  it('manages the catalogue: create, list, retire; prices appear only inside the booking flow', async () => {
    const create = (payload: unknown, as = 'manager') => call('POST', `${manage}/extras`, payload, as);
    expect((await create({ nameIt: 'Telo mare', unitPriceCents: 500 }, 'reception')).status).toBe(403);
    expect((await call('POST', `${manage}/extras`, { nameIt: 'Telo mare', unitPriceCents: 500 })).status).toBe(401);

    const towel = await create({ nameIt: 'Telo mare', nameEn: 'Beach towel', unitPriceCents: 500, position: 1 });
    expect(towel.status).toBe(201);
    services.towel = (towel.body as { extra: { serviceId: string } }).extra.serviceId;
    services.safe = ((await create({ nameIt: 'Cassaforte', unitPriceCents: 300, position: 2 })).body as { extra: { serviceId: string } }).extra.serviceId;
    services.lesson = ((await create({ nameIt: 'Lezione di nuoto', nameEn: 'Swimming lesson', unitPriceCents: 2000, position: 3 })).body as { extra: { serviceId: string } }).extra.serviceId;

    // The whole catalogue for the manager, retired ones included once retired.
    expect((await call('GET', `${manage}/extras`, undefined, 'accounting')).status).toBe(403);
    const listed = (await call('GET', `${manage}/extras`, undefined, 'manager')).body as { extras: { serviceId: string; nameIt: string; nameEn: string | null; active: boolean }[] };
    expect(listed.extras.map((row) => row.nameIt)).toEqual(['Telo mare', 'Cassaforte', 'Lezione di nuoto']);
    expect(listed.extras[1]).toMatchObject({ nameEn: null, active: true });

    // Retiring hides the service from the public list but keeps it for the manager.
    expect((await call('POST', `${manage}/extras/${services.lesson}/status`, { active: false }, 'manager')).status).toBe(204);
    const open = (await call('GET', `/v1/beaches/${slug}/extras`)).body as { extras: { serviceId: string; name: { it: string; en: string | null }; unitPriceCents: number }[] };
    expect(open.extras).toEqual([
      { serviceId: services.towel, name: { it: 'Telo mare', en: 'Beach towel' }, unitPriceCents: 500 },
      { serviceId: services.safe, name: { it: 'Cassaforte', en: null }, unitPriceCents: 300 },
    ]);

    // Every write lands in the audit trail.
    const audited = await database.admin.query<{ action: string }>("SELECT action FROM audit_event WHERE action LIKE 'extra.%' ORDER BY created_at");
    expect(audited.rows.map((row) => row.action)).toEqual(['extra.create', 'extra.create', 'extra.create', 'extra.status']);

    // Deleting a never-used service works; a used one is refused later in this suite.
    const throwaway = ((await create({ nameIt: 'Sdraio in più', unitPriceCents: 700 })).body as { extra: { serviceId: string } }).extra.serviceId;
    expect((await call('DELETE', `${manage}/extras/${throwaway}`, undefined, 'manager')).status).toBe(204);
  });

  it('answers the public routes outside the booking flow exactly as before, without extras', async () => {
    const availability = (await call('GET', `/v1/beaches/${slug}/availability?day=${day}`)).body as Record<string, unknown>;
    expect(availability).not.toHaveProperty('extras');
    expect(JSON.stringify(availability)).not.toContain('extra');
    const beaches = (await call('GET', `/v1/beaches?day=${day}`)).body as Record<string, unknown>;
    expect(JSON.stringify(beaches)).not.toContain('extra');
  });

  it('quotes per line, freezes prices in the hold and copies them to the booking; the discount touches the spot alone', async () => {
    const spotId = beach.spotIds[nextSpot++]!;
    const extras: Extras = [
      { serviceId: services.towel!, quantity: 2 },
      { serviceId: services.safe!, quantity: 1 },
    ];
    const quoted = (await quote(spotId, extras, 'MARE10')).body as Money;
    // Per-line quote with names, quantities, unit prices and subtotals; the
    // comprehensive total adds extras after the spot-only discount.
    expect(quoted).toMatchObject({ listPriceCents: 3000, discountCents: 300, extrasCents: 1300, totalCents: 4000, promoCode: 'MARE10' });
    expect(quoted.extras).toEqual([
      { serviceId: services.towel, name: { it: 'Telo mare', en: 'Beach towel' }, quantity: 2, unitPriceCents: 500, subtotalCents: 1000 },
      { serviceId: services.safe, name: { it: 'Cassaforte', en: null }, quantity: 1, unitPriceCents: 300, subtotalCents: 300 },
    ]);

    const held = await holdRequest(spotId, extras, 'MARE10');
    expect(held.status).toBe(201);
    const heldBody = held.body as Money & { holdId: string };
    expect(heldBody).toMatchObject({ listPriceCents: 3000, discountCents: 300, extrasCents: 1300, totalCents: 4000 });
    const snapshot = await database.admin.query<{ quantity: number; unit_price_cents: number }>('SELECT quantity, unit_price_cents FROM hold_extra WHERE hold_id = $1 ORDER BY unit_price_cents DESC', [heldBody.holdId]);
    expect(snapshot.rows).toEqual([
      { quantity: 2, unit_price_cents: 500 },
      { quantity: 1, unit_price_cents: 300 },
    ]);

    // A price change after the reservation never touches the frozen snapshot.
    await database.admin.query('UPDATE extra_service SET unit_price_cents = 999 WHERE id = $1', [services.towel]);
    const shown = (await call('GET', `/v1/beaches/${slug}/holds/${heldBody.holdId}`)).body as Money;
    expect(shown).toMatchObject({ extrasCents: 1300, totalCents: 4000 });

    const booked = await checkout(heldBody.holdId);
    expect(booked.payment.amountCents).toBe(4000);
    expect(await notify(booked.payment.reference, 'succeeded')).toBe('confirmed');
    await database.admin.query('UPDATE extra_service SET unit_price_cents = 500 WHERE id = $1', [services.towel]);

    const copied = await database.admin.query<{ quantity: number; unit_price_cents: number }>('SELECT quantity, unit_price_cents FROM booking_extra WHERE booking_id = $1 ORDER BY unit_price_cents DESC', [booked.bookingId]);
    expect(copied.rows).toEqual([
      { quantity: 2, unit_price_cents: 500 },
      { quantity: 1, unit_price_cents: 300 },
    ]);
    const totals = await database.admin.query<{ list_price_cents: number; discount_cents: number; extras_cents: number; total_cents: number }>(
      'SELECT list_price_cents, discount_cents, extras_cents, total_cents FROM booking WHERE id = $1',
      [booked.bookingId],
    );
    expect(totals.rows[0]).toEqual({ list_price_cents: 3000, discount_cents: 300, extras_cents: 1300, total_cents: 4000 });

    // The guest's own view carries the lines and the comprehensive total, with the pass.
    const view = (await call('GET', `/v1/beaches/${slug}/bookings/${booked.bookingId}`, undefined, undefined, { Authorization: `Bearer ${booked.accessToken}` })).body as Money & { passCredential: string; code: string };
    expect(view).toMatchObject({ extrasCents: 1300, totalCents: 4000 });
    expect(view.extras.map((line) => `${line.name.it}×${line.quantity}`)).toEqual(['Telo mare×2', 'Cassaforte×1']);

    // The ledger: payment comprehensive, a dedicated movement entirely of the beach
    // club for the extras, the ordinary split on the discounted spot price alone.
    const trail = await ledgerOf(booked.bookingId);
    expect(trail).toContainEqual({ kind: 'payment_received', party: null, amount_cents: 4000 });
    expect(trail).toContainEqual({ kind: 'extras_revenue', party: 'beach_club', amount_cents: 1300 });
    const allocations = trail.filter((row) => row.kind === 'allocation_expected');
    expect(allocations.reduce((sum, row) => sum + row.amount_cents, 0)).toBe(2700);

    // Front desk operations: the day list and the pass verification expose the extras to hand over.
    const listed = (await call('GET', `${manage}/bookings?day=${day}`, undefined, 'reception')).body as { bookings: { code: string; extras: { name: { it: string }; quantity: number }[] }[] };
    const mine = listed.bookings.find((row) => row.code === view.code)!;
    expect(mine.extras).toEqual([
      { name: { it: 'Telo mare', en: 'Beach towel' }, quantity: 2 },
      { name: { it: 'Cassaforte', en: null }, quantity: 1 },
    ]);
    const scanned = await call('POST', `${manage}/access-events`, { credential: view.passCredential, kind: 'entry' }, 'reception');
    expect(scanned.status).toBe(201);
    expect((scanned.body as { extras: unknown }).extras).toEqual([
      { name: { it: 'Telo mare', en: 'Beach towel' }, quantity: 2 },
      { name: { it: 'Cassaforte', en: null }, quantity: 1 },
    ]);
  });

  it('tells apart two reservations equal in everything but the quantities', async () => {
    const spotId = beach.spotIds[nextSpot++]!;
    const key = `test-${randomUUID()}`;
    const first = await holdRequest(spotId, [{ serviceId: services.towel!, quantity: 1 }], undefined, key);
    expect(first.status).toBe(201);
    // Same request, same key: the same reservation, with its lines, nothing new.
    const replay = await holdRequest(spotId, [{ serviceId: services.towel!, quantity: 1 }], undefined, key);
    expect(replay.status).toBe(200);
    expect((replay.body as { holdId: string }).holdId).toBe((first.body as { holdId: string }).holdId);
    expect((replay.body as Money).extras).toHaveLength(1);
    // Different quantities: a different request, refused under the same key.
    const different = await holdRequest(spotId, [{ serviceId: services.towel!, quantity: 2 }], undefined, key);
    expect(different.status).toBe(422);
    expect(errorCode(different)).toBe('idempotency_mismatch');
    // The canonical form ignores the order of the services.
    const towelAndSafe = `test-${randomUUID()}`;
    const spotTwo = beach.spotIds[nextSpot++]!;
    const sorted = await holdRequest(spotTwo, [{ serviceId: services.towel!, quantity: 1 }, { serviceId: services.safe!, quantity: 1 }], undefined, towelAndSafe);
    expect(sorted.status).toBe(201);
    const shuffled = await holdRequest(spotTwo, [{ serviceId: services.safe!, quantity: 1 }, { serviceId: services.towel!, quantity: 1 }], undefined, towelAndSafe);
    expect(shuffled.status).toBe(200);
    expect((shuffled.body as { holdId: string }).holdId).toBe((sorted.body as { holdId: string }).holdId);
  });

  it('leaves nothing committed when the reservation runs out', async () => {
    const spotId = beach.spotIds[nextSpot++]!;
    const held = await holdRequest(spotId, [{ serviceId: services.safe!, quantity: 3 }]);
    const holdId = (held.body as { holdId: string }).holdId;
    await database.admin.query("UPDATE hold SET expires_at = now() - interval '1 minute' WHERE id = $1", [holdId]);
    await releaseExpiredHolds(database.app.db, beach.beachId);
    const state = await database.admin.query<{ state: string }>('SELECT state FROM inventory_day WHERE spot_id = $1 AND day = $2', [spotId, day]);
    expect(state.rows[0]!.state).toBe('available');
    // No booking, no booking snapshot, no ledger movement: the hold snapshot dies with its hold.
    const bookings = await database.admin.query('SELECT 1 FROM booking WHERE hold_id = $1', [holdId]);
    expect(bookings.rowCount).toBe(0);
    const committed = await database.admin.query('SELECT 1 FROM booking_extra be JOIN booking b ON b.id = be.booking_id WHERE b.hold_id = $1', [holdId]);
    expect(committed.rowCount).toBe(0);
    // The spot can be reserved again by someone else, extras included.
    expect((await holdRequest(spotId, [{ serviceId: services.towel!, quantity: 1 }])).status).toBe(201);
  });

  it('refuses a retired or unknown service and unreasonable quantities with clear errors', async () => {
    const spotId = beach.spotIds[nextSpot]!;
    const retired = await quote(spotId, [{ serviceId: services.lesson!, quantity: 1 }]);
    expect(retired.status).toBe(422);
    expect(errorCode(retired)).toBe('extra_not_available');
    const retiredHold = await holdRequest(spotId, [{ serviceId: services.lesson!, quantity: 1 }]);
    expect(retiredHold.status).toBe(422);
    expect(errorCode(retiredHold)).toBe('extra_not_available');
    const unknown = await quote(spotId, [{ serviceId: randomUUID(), quantity: 1 }]);
    expect(errorCode(unknown)).toBe('extra_not_available');
    expect((await quote(spotId, [{ serviceId: services.towel!, quantity: 0 }])).status).toBe(400);
    expect((await quote(spotId, [{ serviceId: services.towel!, quantity: 21 }])).status).toBe(400);
    expect((await quote(spotId, [{ serviceId: services.towel!, quantity: 1 }, { serviceId: services.towel!, quantity: 2 }])).status).toBe(400);
    // A used service cannot be deleted, only retired.
    const used = await call('DELETE', `${manage}/extras/${services.towel}`, undefined, 'manager');
    expect(used.status).toBe(409);
    expect(errorCode(used)).toBe('invalid_state');
  });

  it('books at the front desk with the same extras path and cancels refunding spot and extras', async () => {
    const spotId = beach.spotIds[nextSpot++]!;
    const booked = await call('POST', `${manage}/desk-bookings`, { spotId, day, guestName: 'Cliente al banco', extras: [{ serviceId: services.towel!, quantity: 1 }] }, 'reception');
    expect(booked.status).toBe(201);
    const code = (booked.body as { code: string }).code;
    const saved = await database.admin.query<{ id: string; extras_cents: number; total_cents: number }>('SELECT id, extras_cents, total_cents FROM booking WHERE code = $1', [code]);
    expect(saved.rows[0]).toMatchObject({ extras_cents: 500, total_cents: 3500 });
    const bookingId = saved.rows[0]!.id;
    const trail = await ledgerOf(bookingId);
    expect(trail).toContainEqual({ kind: 'extras_revenue', party: 'beach_club', amount_cents: 500 });

    // Cancellation with refund: the amount covers the spot and the extras, the
    // ledger of the booking closes at zero.
    expect((await call('POST', `${manage}/bookings/${code}/cancel`, { reason: 'Chiusura per maltempo' }, 'manager')).status).toBe(204);
    const refunds = await database.admin.query<{ amount_cents: number }>(
      'SELECT r.amount_cents FROM refund r JOIN payment p ON p.id = r.payment_id WHERE p.booking_id = $1',
      [bookingId],
    );
    expect(refunds.rows).toEqual([{ amount_cents: 3500 }]);
    const balance = await database.admin.query<{ total: string }>('SELECT sum(amount_cents) AS total FROM ledger_entry WHERE booking_id = $1', [bookingId]);
    expect(Number(balance.rows[0]!.total)).toBe(0);
  });

  it('keeps the seasonal share on the spot price alone when a shared day sells with extras', async () => {
    // A season holder offers a day, the manager approves it at 3000.
    const contract = await call('POST', `${manage}/contracts`, { holderEmail: 'anna@servizi.example', spotId: beach.spotIds[10], validFrom: day, validTo: seasonEnd }, 'manager');
    expect(contract.status).toBe(201);
    const contractId = (contract.body as { contractId: string }).contractId;
    expect((await call('PUT', `${manage}/sharing-settings`, { dailySharedCap: 1, sharedPriceCents: 3000 }, 'manager')).status).toBe(204);
    expect((await call('POST', `/v1/season/contracts/${contractId}/proposals`, { days: [day] }, 'anna')).status).toBe(200);
    const pending = ((await call('GET', `${manage}/proposals?status=proposed`, undefined, 'manager')).body as { proposals: { proposalId: string }[] }).proposals;
    expect((await call('POST', `${manage}/proposals/${pending[0]!.proposalId}/decision`, { approve: true }, 'manager')).status).toBe(204);

    const held = await holdRequest(beach.spotIds[10]!, [{ serviceId: services.safe!, quantity: 2 }]);
    expect(held.status).toBe(201);
    expect(held.body as Money).toMatchObject({ listPriceCents: 3000, extrasCents: 600, totalCents: 3600 });
    const booked = await checkout((held.body as { holdId: string }).holdId);
    expect(await notify(booked.payment.reference, 'succeeded')).toBe('confirmed');

    // The seasonal quota comes out of the spot price alone: 50% of 3000, never of the extras.
    const shares = await database.admin.query<{ party: string; amount_cents: number }>('SELECT party, amount_cents FROM allocation WHERE booking_id = $1 ORDER BY party', [booked.bookingId]);
    // The enum order of the parties: season holder, beach club, platform.
    expect(shares.rows).toEqual([
      { party: 'season_holder', amount_cents: 1500 },
      { party: 'beach_club', amount_cents: 1200 },
      { party: 'platform', amount_cents: 300 },
    ]);
    const trail = await ledgerOf(booked.bookingId);
    expect(trail).toContainEqual({ kind: 'extras_revenue', party: 'beach_club', amount_cents: 600 });
    expect(trail).toContainEqual({ kind: 'payment_received', party: null, amount_cents: 3600 });
  });

  it('books without extras exactly as before: zero extras, same totals, empty lines', async () => {
    const spotId = beach.spotIds[nextSpot++]!;
    const quoted = (await quote(spotId)).body as Money;
    expect(quoted).toMatchObject({ listPriceCents: 3000, discountCents: 0, extrasCents: 0, totalCents: 3000, extras: [] });
    const held = await holdRequest(spotId);
    expect(held.status).toBe(201);
    expect(held.body as Money).toMatchObject({ extrasCents: 0, totalCents: 3000, extras: [] });
    const booked = await checkout((held.body as { holdId: string }).holdId);
    expect(booked.payment.amountCents).toBe(3000);
    expect(await notify(booked.payment.reference, 'succeeded')).toBe('confirmed');
    const trail = await ledgerOf(booked.bookingId);
    expect(trail.some((row) => row.kind === 'extras_revenue')).toBe(false);
    expect(trail.filter((row) => row.kind === 'allocation_expected').reduce((sum, row) => sum + row.amount_cents, 0)).toBe(3000);
  });
});
