import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { upsertUser } from '@ombre/db';
import { createTestDatabase, insertBeach, testAdminUrl, type TestBeach, type TestDatabase } from '@ombre/db/testing';
import { createApp } from '../src/app';

const password = 'password-di-prova-123';
const signingSecret = 'segreto-di-prova-lungo-almeno-32-caratteri';

const dayAfter = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

interface Cell {
  day: string;
  state: string;
  bookingCode: string | null;
  guestName: string | null;
}
interface Grid {
  from: string;
  to: string;
  days: string[];
  spots: { spotId: string; code: string; zone: string; rowNumber: number; col: number; typeName: string; typeMark: string; cells: Cell[] }[];
}

describe.skipIf(!testAdminUrl)('planner grid of a window', () => {
  let database: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let beach: TestBeach;
  let today: string;
  let tomorrow: string;
  let bookingCode: string;
  const tokens: Record<string, string> = {};

  const json = async (method: string, path: string, payload?: unknown, headers: Record<string, string> = {}) => {
    const response = await app.request(path, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    const text = await response.text();
    return { status: response.status, body: text ? (JSON.parse(text) as unknown) : null };
  };
  const bearer = (role: string) => ({ Authorization: `Bearer ${tokens[role]}` });
  const planner = (query: string, role = 'manager') => json('GET', `/v1/manage/beaches/planner/planner?${query}`, undefined, bearer(role));

  beforeAll(async () => {
    database = await createTestDatabase(testAdminUrl!);
    const dates = await database.admin.query<{ today: string }>("SELECT (now() AT TIME ZONE 'Europe/Rome')::date::text AS today");
    today = dates.rows[0]!.today;
    tomorrow = dayAfter(today, 1);
    beach = await insertBeach(database.admin, 'planner', { spots: 6, day: today });
    for (const role of ['manager', 'reception', 'accounting'] as const) {
      await upsertUser(database.adminUrl, { email: `${role}@planner.example`, name: role, password }, [{ beachId: beach.beachId, role }]);
    }
    app = createApp({ db: database.app.db, rateLimiter: { hit: () => 0 }, holdSeconds: 600, signingSecret, log: () => undefined });
    for (const role of ['manager', 'reception', 'accounting']) {
      const response = await json('POST', '/v1/auth/login', { email: `${role}@planner.example`, password });
      tokens[role] = (response.body as { token: string }).token;
    }

    const [a01, a02, a03, , a05, a06] = beach.spotIds;
    // A01 sold, A02 blocked, A03 withdrawn, A04 free, A05 moved to the shore for the zone filter, A06 under a live hold.
    const sold = await json('POST', '/v1/manage/beaches/planner/desk-bookings', { spotId: a01, day: today, guestName: 'Riservato Griglia' }, bearer('reception'));
    expect(sold.status).toBe(201);
    bookingCode = (sold.body as { code: string }).code;
    expect((await json('POST', '/v1/manage/beaches/planner/inventory/block', { spotId: a02, day: today, blocked: true, reason: 'Mareggiata' }, bearer('manager'))).status).toBe(204);
    await database.admin.query("UPDATE inventory_day SET state = 'unpublishable' WHERE spot_id = $1 AND day = $2", [a03, today]);
    await database.admin.query("UPDATE spot SET zone = 'riva', row_number = 1 WHERE id = $1", [a05]);
    expect((await app.request('/v1/holds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': `test-${randomUUID()}` },
      body: JSON.stringify({ beachSlug: 'planner', spotId: a06, day: today }),
    })).status).toBe(201);
  });

  afterAll(async () => {
    await database?.drop();
  });

  it('tells every spot-day cell apart: not published, free, blocked, withdrawn, booked', async () => {
    const response = await planner(`from=${today}&to=${tomorrow}`);
    expect(response.status).toBe(200);
    const grid = response.body as Grid;
    expect(grid.days).toEqual([today, tomorrow]);
    // The shore spot comes first, like everywhere else in the drawing.
    expect(grid.spots.map((entry) => entry.code)).toEqual(['A05', 'A01', 'A02', 'A03', 'A04', 'A06']);
    const byCode = Object.fromEntries(grid.spots.map((entry) => [entry.code, entry]));
    expect(byCode.A01!.cells.map((cell) => cell.state)).toEqual(['booked', 'not_published']);
    expect(byCode.A01!.cells[0]).toEqual({ day: today, state: 'booked', bookingCode, guestName: 'Riservato Griglia', period: { from: today, to: today } });
    expect(byCode.A02!.cells[0]!.state).toBe('blocked');
    expect(byCode.A03!.cells[0]!.state).toBe('not_for_sale');
    expect(byCode.A04!.cells[0]).toEqual({ day: today, state: 'free', bookingCode: null, guestName: null, period: null });
    // A hold is not a booking: the cell stays free until a sale really lands.
    expect(byCode.A06!.cells[0]!.state).toBe('free');
    expect(byCode.A01!).toMatchObject({ typeName: 'Ombrellone', typeMark: 'umbrella', rowNumber: 1 });
  });

  it('filters by zone without touching the window', async () => {
    const grid = (await planner(`from=${today}&to=${tomorrow}&zone=riva`)).body as Grid;
    expect(grid.spots.map((entry) => entry.code)).toEqual(['A05']);
    expect(grid.days).toEqual([today, tomorrow]);
    expect((await planner(`from=${today}&to=${today}&zone=collina`)).status).toBe(400);
  });

  it('serves at most 31 days and refuses a window that runs backwards', async () => {
    const within = await planner(`from=${today}&to=${dayAfter(today, 30)}`);
    expect(within.status).toBe(200);
    expect((within.body as Grid).days).toHaveLength(31);
    const over = await planner(`from=${today}&to=${dayAfter(today, 31)}`);
    expect(over.status).toBe(409);
    expect((over.body as { error: { code: string } }).error.code).toBe('cap_reached');
    expect((await planner(`from=${tomorrow}&to=${today}`)).status).toBe(400);
    expect((await planner(`from=oggi&to=${today}`)).status).toBe(400);
  });

  it('opens for manager and reception, for nobody else', async () => {
    const seen = await planner(`from=${today}&to=${today}`, 'reception');
    expect(seen.status).toBe(200);
    // Reception reads bookings, so the grid carries the guest.
    const byCode = Object.fromEntries((seen.body as Grid).spots.map((entry) => [entry.code, entry]));
    expect(byCode.A01!.cells[0]!.guestName).toBe('Riservato Griglia');
    expect((await planner(`from=${today}&to=${today}`, 'accounting')).status).toBe(403);
    expect((await json('GET', `/v1/manage/beaches/planner/planner?from=${today}&to=${today}`)).status).toBe(401);
  });

  it('keeps each beach club to its own grid', async () => {
    const other = await insertBeach(database.admin, 'planner-altro', { spots: 2, day: today });
    await upsertUser(database.adminUrl, { email: 'manager@planner-altro.example', name: 'altro', password }, [{ beachId: other.beachId, role: 'manager' }]);
    const signedIn = await json('POST', '/v1/auth/login', { email: 'manager@planner-altro.example', password });
    const headers = { Authorization: `Bearer ${(signedIn.body as { token: string }).token}` };

    const grid = (await json('GET', `/v1/manage/beaches/planner-altro/planner?from=${today}&to=${today}`, undefined, headers)).body as Grid;
    expect(grid.spots.map((entry) => entry.code)).toEqual(['A01', 'A02']);
    // The first club's sale never leaks into the second club's grid.
    expect(grid.spots[0]!.cells[0]).toEqual({ day: today, state: 'free', bookingCode: null, guestName: null, period: null });
    expect((await json('GET', `/v1/manage/beaches/planner/planner?from=${today}&to=${today}`, undefined, headers)).status).toBe(403);
  });
});
