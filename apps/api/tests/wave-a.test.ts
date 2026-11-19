import { createHmac, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { upsertUser } from '@ombre/db';
import { suggestSpot } from '@ombre/shared';
import { createTestDatabase, insertBeach, testAdminUrl, type TestBeach, type TestDatabase } from '@ombre/db/testing';
import { createApp } from '../src/app';

const password = 'password-di-prova-123';
const signingSecret = 'segreto-di-prova-lungo-almeno-32-caratteri';
const sandboxWebhookSecret = 'segreto-del-fornitore-di-prova';

interface Harness {
  database: TestDatabase;
  app: ReturnType<typeof createApp>;
  beach: TestBeach;
  today: string;
  tomorrow: string;
  tokens: Record<string, string>;
  json: (method: string, path: string, payload?: unknown, headers?: Record<string, string>) => Promise<{ status: number; body: unknown }>;
  bearer: (role: string) => Record<string, string>;
  desk: (spotId: string, guestName: string) => Promise<string>;
  access: (credential: string, kind: 'entry' | 'exit') => Promise<void>;
}

/** A migrated database, a beach club published today, the three staff accounts, the app. */
async function start(slug: string, spots: number): Promise<Harness> {
  const database = await createTestDatabase(testAdminUrl!);
  const dates = await database.admin.query<{ today: string; tomorrow: string }>(
    "SELECT (now() AT TIME ZONE 'Europe/Rome')::date::text AS today, ((now() AT TIME ZONE 'Europe/Rome')::date + 1)::text AS tomorrow",
  );
  const { today, tomorrow } = dates.rows[0]!;
  const beach = await insertBeach(database.admin, slug, { spots, day: today });
  for (const role of ['manager', 'reception', 'accounting'] as const) {
    await upsertUser(database.adminUrl, { email: `${role}@${slug}.example`, name: role, password }, [{ beachId: beach.beachId, role }]);
  }
  const app = createApp({ db: database.app.db, rateLimiter: { hit: () => 0 }, holdSeconds: 600, signingSecret, sandboxWebhookSecret, log: () => undefined });

  const json: Harness['json'] = async (method, path, payload, headers = {}) => {
    const response = await app.request(path, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    const text = await response.text();
    return { status: response.status, body: text ? (JSON.parse(text) as unknown) : null };
  };
  const tokens: Record<string, string> = {};
  for (const role of ['manager', 'reception', 'accounting']) {
    const response = await json('POST', '/v1/auth/login', { email: `${role}@${slug}.example`, password });
    tokens[role] = (response.body as { token: string }).token;
  }
  const bearer = (role: string) => ({ Authorization: `Bearer ${tokens[role]}` });
  const desk = async (spotId: string, guestName: string) => {
    const response = await json('POST', `/v1/manage/beaches/${slug}/desk-bookings`, { spotId, day: today, guestName }, bearer('reception'));
    expect(response.status).toBe(201);
    return (response.body as { code: string }).code;
  };
  const access = async (credential: string, kind: 'entry' | 'exit') => {
    const response = await json('POST', `/v1/manage/beaches/${slug}/access-events`, { credential, kind }, bearer('reception'));
    expect(response.status).toBe(201);
  };
  return { database, app, beach, today, tomorrow, tokens, json, bearer, desk, access };
}

describe.skipIf(!testAdminUrl)('operational console and bulk blocks', () => {
  let h: Harness;
  let extraSpotId: string;
  const codes: Record<string, string> = {};

  beforeAll(async () => {
    h = await start('console', 8);
    // A spot that exists in the drawing but was never published for the day.
    const extra = await h.database.admin.query<{ id: string }>("INSERT INTO spot (beach_id, code, row_number) VALUES ($1, 'X01', 2) RETURNING id", [h.beach.beachId]);
    extraSpotId = extra.rows[0]!.id;

    const [a01, a02, a03, a04, a05, a06, , a08] = h.beach.spotIds;
    // A01 reserved by a live hold.
    const held = await h.json('POST', '/v1/holds', { beachSlug: 'console', spotId: a01, day: h.today }, { 'Idempotency-Key': `test-${randomUUID()}` });
    expect(held.status).toBe(201);
    // A02 sold and waited for, A03 inside, A04 entered and gone out.
    codes.a02 = await h.desk(a02!, 'Riservato Attesa');
    codes.a03 = await h.desk(a03!, 'Riservato Dentro');
    codes.a04 = await h.desk(a04!, 'Riservato Uscito');
    await h.access(codes.a03!, 'entry');
    await h.access(codes.a04!, 'entry');
    await h.access(codes.a04!, 'exit');
    // A05 blocked with the existing single action; A06 withdrawn from sale; A08 a shared day.
    expect((await h.json('POST', '/v1/manage/beaches/console/inventory/block', { spotId: a05, day: h.today, blocked: true, reason: 'Manutenzione' }, h.bearer('reception'))).status).toBe(204);
    await h.database.admin.query("UPDATE inventory_day SET state = 'unpublishable' WHERE spot_id = $1 AND day = $2", [a06, h.today]);
    // A shared day always belongs to a season pass.
    const holder = await h.database.admin.query<{ id: string }>(
      "INSERT INTO app_user (email, name, password_hash) VALUES ('stagionale@console.example', 'Stagionale', 'none') RETURNING id",
    );
    const contract = await h.database.admin.query<{ id: string }>(
      "INSERT INTO season_contract (beach_id, holder_user_id, spot_id, valid_from, valid_to) VALUES ($1, $2, $3, $4, $4) RETURNING id",
      [h.beach.beachId, holder.rows[0]!.id, a08, h.today],
    );
    await h.database.admin.query('UPDATE inventory_day SET shared = true, contract_id = $3 WHERE spot_id = $1 AND day = $2', [a08, h.today, contract.rows[0]!.id]);
  });

  afterAll(async () => {
    await h?.database.drop();
  });

  interface ConsoleSpot {
    spotId: string;
    code: string;
    state: string;
    notForSale: string | null;
    shared: boolean;
    guestName: string | null;
    bookingCode: string | null;
    col: number;
    maxGuests: number;
    typeName: string;
    typeMark: string;
    umbrellas: number;
    sunbeds: number;
  }
  interface Console {
    day: string;
    spots: ConsoleSpot[];
    summary: { counts: Record<string, number>; expectedGuests: number; presentGuests: number; revenueCents: number | null };
  }
  const consoleOf = async (role: string) => {
    const response = await h.json('GET', `/v1/manage/beaches/console/operations?day=${h.today}`, undefined, h.bearer(role));
    expect(response.status).toBe(200);
    return response.body as Console;
  };

  it('derives the operational state of every card from inventory, holds, presence and accesses', async () => {
    const view = await consoleOf('manager');
    expect(view.spots.map((spot) => `${spot.code}:${spot.state}`)).toEqual([
      'A01:reserved',
      'A02:expected',
      'A03:present',
      'A04:departed',
      'A05:blocked',
      'A06:not_for_sale',
      'A07:free',
      'A08:free',
      'X01:not_for_sale',
    ]);
    const byCode = Object.fromEntries(view.spots.map((spot) => [spot.code, spot]));
    // The never published day and the withdrawn one share the card; the table tells them apart.
    expect(byCode.A06!.notForSale).toBe('withdrawn');
    expect(byCode.X01!.notForSale).toBe('never_published');
    expect(byCode.A07!.notForSale).toBeNull();
    // The S badge, the surname and the equipment of the card.
    expect(byCode.A08!.shared).toBe(true);
    expect(byCode.A02!.guestName).toBe('Riservato Attesa');
    expect(byCode.A02!.bookingCode).toBe(codes.a02);
    expect(byCode.A02!).toMatchObject({ typeName: 'Ombrellone', typeMark: 'umbrella', umbrellas: 1, sunbeds: 2, maxGuests: 2, col: 2 });

    // Maintenance (D56) joined the operational states: zero here, nobody is under the wrench.
    expect(view.summary.counts).toEqual({ free: 2, reserved: 1, expected: 1, present: 1, departed: 1, blocked: 1, not_for_sale: 2, maintenance: 0 });
    expect(view.summary.expectedGuests).toBe(1);
    expect(view.summary.presentGuests).toBe(1);
    // Three sold days at 30.00 each.
    expect(view.summary.revenueCents).toBe(9000);
  });

  it('hides the takings without reports.read, the names without bookings.read, the page without inventory.read', async () => {
    const view = await consoleOf('reception');
    expect(view.summary.revenueCents).toBeNull();
    expect(view.spots.find((spot) => spot.code === 'A02')?.guestName).toBe('Riservato Attesa');
    expect((await h.json('GET', `/v1/manage/beaches/console/operations?day=${h.today}`, undefined, h.bearer('accounting'))).status).toBe(403);
    expect((await h.json('GET', `/v1/manage/beaches/console/operations?day=${h.today}`)).status).toBe(401);
    expect((await h.json('GET', '/v1/manage/beaches/console/operations?day=oggi', undefined, h.bearer('manager'))).status).toBe(400);
  });

  it('shows a run out hold as free, and an ended presence by whether the guest ever entered', async () => {
    await h.database.admin.query("UPDATE hold SET expires_at = now() - interval '1 second' WHERE status = 'active'");
    // The evening closes every presence as ended: only the access trail still differs.
    await h.database.admin.query("UPDATE booking SET presence = 'ended' WHERE code IN ($1, $2)", [codes.a03, codes.a02]);
    const view = await consoleOf('manager');
    const byCode = Object.fromEntries(view.spots.map((spot) => [spot.code, spot.state]));
    expect(byCode.A01).toBe('free');
    expect(byCode.A03).toBe('departed');
    expect(byCode.A02).toBe('expected');
  });

  it('blocks many spots at once, refuses the taken ones, and writes the audit trail', async () => {
    const [a01, a02, , , a05, , a07] = h.beach.spotIds;
    // A01 carries an expired hold (freed on the way), A02 is sold, A05 is already
    // blocked, A07 is free, X01 was never published.
    const response = await h.json(
      'POST',
      '/v1/manage/beaches/console/inventory/bulk-block',
      { day: h.today, spotIds: [a01, a02, a05, a07, extraSpotId], blocked: true, reason: 'Mareggiata' },
      h.bearer('reception'),
    );
    expect(response.status).toBe(200);
    const outcome = response.body as { day: string; blocked: boolean; done: number; refused: { spotId: string; reason: string }[] };
    expect(outcome).toMatchObject({ day: h.today, blocked: true, done: 3 });
    expect(outcome.refused).toEqual([
      { spotId: a02, reason: 'occupied' },
      { spotId: extraSpotId, reason: 'not_published' },
    ]);
    const states = await consoleOf('manager');
    const byCode = Object.fromEntries(states.spots.map((spot) => [spot.code, spot.state]));
    expect([byCode.A01, byCode.A05, byCode.A07]).toEqual(['blocked', 'blocked', 'blocked']);

    // A live hold is refused as held, never forced.
    const a08 = h.beach.spotIds[7]!;
    const held = await h.json('POST', '/v1/holds', { beachSlug: 'console', spotId: a08, day: h.today }, { 'Idempotency-Key': `test-${randomUUID()}` });
    expect(held.status).toBe(201);
    const refusedHeld = await h.json('POST', '/v1/manage/beaches/console/inventory/bulk-block', { day: h.today, spotIds: [a08], blocked: true }, h.bearer('reception'));
    expect(refusedHeld.body).toMatchObject({ done: 0, refused: [{ spotId: a08, reason: 'held' }] });

    // Only the spots that really changed are audited: A01 and A07, not the already blocked A05.
    const trail = await h.database.admin.query<{ n: string }>(
      "SELECT count(*) AS n FROM audit_event WHERE action = 'inventory.block' AND detail ->> 'bulk' = 'true' AND detail ->> 'reason' = 'Mareggiata'",
    );
    expect(Number(trail.rows[0]!.n)).toBe(2);
  });

  it('unblocks in bulk, counting the already free ones as done and refusing the sold ones', async () => {
    const [a01, a02, , , a05, a06] = h.beach.spotIds;
    const response = await h.json(
      'POST',
      '/v1/manage/beaches/console/inventory/bulk-block',
      { day: h.today, spotIds: [a01, a05, a02, a06], blocked: false },
      h.bearer('manager'),
    );
    const outcome = response.body as { done: number; refused: { spotId: string; reason: string }[] };
    expect(outcome.done).toBe(2);
    expect(outcome.refused).toEqual([
      { spotId: a02, reason: 'not_blocked' },
      { spotId: a06, reason: 'not_blocked' },
    ]);
    expect((await h.json('POST', '/v1/manage/beaches/console/inventory/bulk-block', { day: h.today, spotIds: [a01], blocked: true }, h.bearer('accounting'))).status).toBe(403);
  });
});

describe.skipIf(!testAdminUrl)('statistics of a period', () => {
  let h: Harness;
  const statistics = (query: string, role = 'manager') => h.json('GET', `/v1/manage/beaches/statistiche/reports/statistics?${query}`, undefined, h.bearer(role));

  beforeAll(async () => {
    h = await start('statistiche', 8);
    const [a01, a02, a03, a04, a05, a06] = h.beach.spotIds;
    // A03 costs more, so the averages are told apart by hand.
    expect((await h.json('PUT', '/v1/manage/beaches/statistiche/inventory/price', { spotId: a03, day: h.today, priceCents: 4000 }, h.bearer('manager'))).status).toBe(204);

    // Two desk sales (A01 entered, A03 not), one online sale (A04), one cancelled sale (A02).
    const first = await h.desk(a01!, 'Riservato Primo');
    await h.access(first, 'entry');
    await h.desk(a03!, 'Riservato Terzo');
    const cancelled = await h.desk(a02!, 'Riservato Annullato');
    expect((await h.json('POST', `/v1/manage/beaches/statistiche/bookings/${cancelled}/cancel`, { reason: 'Prova di annullo' }, h.bearer('manager'))).status).toBe(204);

    const held = await h.json('POST', '/v1/holds', { beachSlug: 'statistiche', spotId: a04, day: h.today }, { 'Idempotency-Key': `test-${randomUUID()}` });
    const { holdId } = (held.body as { holdId: string });
    const checkout = await h.json('POST', '/v1/checkouts', { beachSlug: 'statistiche', holdId, guestName: 'Riservato Online', guestEmail: 'online@example.org' });
    const { payment } = checkout.body as { payment: { reference: string } };
    const raw = JSON.stringify({ eventId: `evt_${randomUUID()}`, reference: payment.reference, outcome: 'succeeded' });
    const notified = await h.app.request('/v1/payment-webhooks/sandbox', {
      method: 'POST',
      headers: { 'X-Ombre-Signature': createHmac('sha256', sandboxWebhookSecret).update(raw).digest('hex') },
      body: raw,
    });
    expect(notified.status).toBe(200);

    // A05 blocked (stays in the denominator), A06 withdrawn from sale (leaves it).
    expect((await h.json('POST', '/v1/manage/beaches/statistiche/inventory/block', { spotId: a05, day: h.today, blocked: true }, h.bearer('manager'))).status).toBe(204);
    await h.database.admin.query("UPDATE inventory_day SET state = 'unpublishable' WHERE spot_id = $1 AND day = $2", [a06, h.today]);
  });

  afterAll(async () => {
    await h?.database.drop();
  });

  it('returns the aggregates of the period exactly as counted by hand', async () => {
    const response = await statistics(`from=${h.today}&to=${h.tomorrow}`);
    expect(response.status).toBe(200);
    const report = response.body as {
      currency: string;
      timezone: string;
      soldDays: number;
      grossCents: number;
      cancelled: { bookings: number; grossCents: number };
      averageCents: number;
      occupancy: { soldDays: number; publishedDays: number; rateBps: number };
      byChannel: { source: string; bookings: number; grossCents: number }[];
      byPaymentStatus: { status: string; bookings: number }[];
      arrivals: { arrived: number; notArrived: number };
      byType: { name: string; mark: string; soldDays: number; grossCents: number }[];
      topSpots: { code: string; grossCents: number; soldDays: number; publishedDays: number; rateBps: number | null }[];
      bottomSpots: { code: string; grossCents: number }[];
      heatmap: { code: string; publishedDays: number; soldDays: number; rateBps: number | null }[];
    };
    // 3 sold days: 30.00 + 40.00 + 30.00; the cancelled one counted apart.
    expect(report.currency).toBe('EUR');
    expect(report.timezone).toBe('Europe/Rome');
    expect(report.soldDays).toBe(3);
    expect(report.grossCents).toBe(10_000);
    expect(report.cancelled).toEqual({ bookings: 1, grossCents: 3000 });
    expect(report.averageCents).toBe(3333);
    // 8 spots published today, minus the withdrawn one; the blocked one stays in.
    expect(report.occupancy).toEqual({ soldDays: 3, publishedDays: 7, rateBps: 4286 });
    expect(report.byChannel).toEqual([
      { source: 'desk', bookings: 2, grossCents: 7000 },
      { source: 'online', bookings: 1, grossCents: 3000 },
    ]);
    // Since B3 the statuses are derived from the residual (D31): same shape, new values.
    expect(report.byPaymentStatus).toEqual([{ status: 'paid', bookings: 3 }]);
    // Arrivals come from the access events: one entry registered, two no-shows so far.
    expect(report.arrivals).toEqual({ arrived: 1, notArrived: 2 });
    expect(report.byType).toEqual([expect.objectContaining({ name: 'Ombrellone', mark: 'umbrella', soldDays: 3, grossCents: 10_000 })]);

    expect(report.topSpots.map((spot) => `${spot.code}:${spot.grossCents}`)).toEqual(['A03:4000', 'A01:3000', 'A04:3000', 'A02:0', 'A05:0']);
    expect(report.bottomSpots.map((spot) => `${spot.code}:${spot.grossCents}`)).toEqual(['A08:0', 'A07:0', 'A05:0', 'A02:0', 'A04:3000']);
    expect(report.topSpots[0]).toMatchObject({ publishedDays: 1, soldDays: 1, rateBps: 10_000 });

    const heat = Object.fromEntries(report.heatmap.map((spot) => [spot.code, spot]));
    expect(report.heatmap).toHaveLength(8);
    expect(heat.A01).toMatchObject({ publishedDays: 1, soldDays: 1, rateBps: 10_000 });
    expect(heat.A05).toMatchObject({ publishedDays: 1, soldDays: 0, rateBps: 0 });
    expect(heat.A06).toMatchObject({ publishedDays: 0, soldDays: 0, rateBps: null });

    // Numbers only: no guest ever appears in the statistics.
    expect(JSON.stringify(report)).not.toContain('Riservato');
  });

  it('anchors nothing to the guest and nothing to other roles: accounting reads, reception does not', async () => {
    expect((await statistics(`from=${h.today}&to=${h.today}`, 'accounting')).status).toBe(200);
    expect((await statistics(`from=${h.today}&to=${h.today}`, 'reception')).status).toBe(403);
    expect((await h.json('GET', `/v1/manage/beaches/statistiche/reports/statistics?from=${h.today}&to=${h.today}`)).status).toBe(401);
  });

  it('refuses a period that runs backwards or longer than 366 days', async () => {
    expect((await statistics('from=2027-06-02&to=2027-06-01')).status).toBe(400);
    expect((await statistics('from=2027-01-01&to=2028-01-02')).status).toBe(400);
    expect((await statistics('from=2027-01-01&to=2028-01-01')).status).toBe(200);
    expect((await statistics('from=ieri&to=2027-01-01')).status).toBe(400);
  });

  it('counts an empty period as zero, with no average and no occupancy rate', async () => {
    const response = await statistics('from=2030-01-01&to=2030-01-31');
    expect(response.body).toMatchObject({
      soldDays: 0,
      grossCents: 0,
      averageCents: null,
      occupancy: { soldDays: 0, publishedDays: 0, rateBps: null },
      byChannel: [],
      arrivals: { arrived: 0, notArrived: 0 },
      topSpots: [],
      bottomSpots: [],
    });
  });
});

describe.skipIf(!testAdminUrl)('suggested spot in the public availability and at the desk', () => {
  let h: Harness;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    h = await start('consigli', 6);
    const [a01, a02, a03, a04] = h.beach.spotIds;
    Object.assign(ids, { a01, a02, a03, a04 });
    // A01: fits 2, dearer, shore row. A02: fits 2, cheaper, far land row. A03: fits 4,
    // cheapest. A04: fits 4, same price as A03, shore row. A05, A06: fit 2 at list price.
    await h.database.admin.query("UPDATE spot SET zone = 'riva', row_number = 1 WHERE id = $1", [a01]);
    await h.database.admin.query("UPDATE spot SET zone = 'monte', row_number = 3 WHERE id = $1", [a02]);
    await h.database.admin.query('UPDATE inventory_day SET price_cents = 2500 WHERE spot_id = $1', [a02]);
    await h.database.admin.query('UPDATE spot SET max_guests = 4 WHERE id IN ($1, $2)', [a03, a04]);
    await h.database.admin.query('UPDATE inventory_day SET price_cents = 1000 WHERE spot_id IN ($1, $2)', [a03, a04]);
    await h.database.admin.query("UPDATE spot SET zone = 'riva', row_number = 1 WHERE id = $1", [a04]);
  });

  afterAll(async () => {
    await h?.database.drop();
  });

  const availability = async (query = '') => {
    const response = await h.json('GET', `/v1/beaches/consigli/availability?day=${h.today}${query}`);
    expect(response.status).toBe(200);
    return response.body as { guests?: number; suggestedSpotId?: string | null; spots: { spotId: string }[] };
  };

  it('suggests by the documented order: surplus beats price, price beats zone and row', async () => {
    // Two guests: the cheap large A03 loses to every exact fit; among those A02 is the cheapest.
    expect(await availability('&guests=2')).toMatchObject({ guests: 2, suggestedSpotId: ids.a02 });
    // Three guests: only the two large ones fit; same price, the shore row wins.
    expect(await availability('&guests=3')).toMatchObject({ guests: 3, suggestedSpotId: ids.a04 });
    // Nobody fits seven: the field is there, empty — never an obligation.
    expect((await availability('&guests=7')).suggestedSpotId).toBeNull();
    expect((await h.json('GET', `/v1/beaches/consigli/availability?day=${h.today}&guests=0`)).status).toBe(400);
  });

  it('adds nothing to the public answer without guests, and moves on when the suggested spot is taken', async () => {
    const plain = await availability();
    expect('suggestedSpotId' in plain).toBe(false);
    expect('guests' in plain).toBe(false);

    const held = await h.json('POST', '/v1/holds', { beachSlug: 'consigli', spotId: ids.a02, day: h.today }, { 'Idempotency-Key': `test-${randomUUID()}` });
    expect(held.status).toBe(201);
    // A02 is reserved: the next exact fit at list price, the shore one, takes the label.
    expect((await availability('&guests=2')).suggestedSpotId).toBe(ids.a01);
  });

  it('gives the desk the same fields and therefore the same suggestion as the public page', async () => {
    const response = await h.json('GET', `/v1/manage/beaches/consigli/inventory?day=${h.today}`, undefined, h.bearer('reception'));
    expect(response.status).toBe(200);
    const { spots } = response.body as { spots: { spotId: string; state: string; zone: 'riva' | 'ombrelloni' | 'monte'; rowNumber: number; col: number; maxGuests: number; priceCents: number | null }[] };
    const free = spots.flatMap((spot) => (spot.state === 'available' && spot.priceCents !== null ? [{ ...spot, priceCents: spot.priceCents }] : []));
    // The shared heuristic applied to the desk inventory agrees with the public answer.
    expect(suggestSpot(free, 2)?.spotId).toBe(ids.a01);
    expect(suggestSpot(free, 3)?.spotId).toBe(ids.a04);
  });
});
