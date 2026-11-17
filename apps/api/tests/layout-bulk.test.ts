import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { upsertUser } from '@ombre/db';
import { createTestDatabase, insertBeach, testAdminUrl, type TestBeach, type TestDatabase } from '@ombre/db/testing';
import { createApp } from '../src/app';

const password = 'password-di-prova-123';
const signingSecret = 'segreto-di-prova-lungo-almeno-32-caratteri';

describe.skipIf(!testAdminUrl)('bulk generation of rows', () => {
  let database: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let beach: TestBeach;
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
  const bulk = (payload: unknown, role = 'manager') => json('POST', '/v1/manage/beaches/blocco/layout/rows/bulk', payload, bearer(role));
  const codesLike = async (prefix: string) => {
    const counted = await database.admin.query<{ n: string }>("SELECT count(*) AS n FROM spot WHERE beach_id = $1 AND code LIKE $2 || '%'", [beach.beachId, prefix]);
    return Number(counted.rows[0]!.n);
  };

  beforeAll(async () => {
    database = await createTestDatabase(testAdminUrl!);
    const dates = await database.admin.query<{ today: string }>("SELECT (now() AT TIME ZONE 'Europe/Rome')::date::text AS today");
    beach = await insertBeach(database.admin, 'blocco', { spots: 3, day: dates.rows[0]!.today });
    for (const role of ['manager', 'reception'] as const) {
      await upsertUser(database.adminUrl, { email: `${role}@blocco.example`, name: role, password }, [{ beachId: beach.beachId, role }]);
    }
    app = createApp({ db: database.app.db, rateLimiter: { hit: () => 0 }, holdSeconds: 600, signingSecret, log: () => undefined });
    for (const role of ['manager', 'reception']) {
      const response = await json('POST', '/v1/auth/login', { email: `${role}@blocco.example`, password });
      tokens[role] = (response.body as { token: string }).token;
    }
  });

  afterAll(async () => {
    await database?.drop();
  });

  it('creates 3×10 rows with one numbering across the rows, and one audited event with the counts', async () => {
    const response = await bulk({ zone: 'ombrelloni', prefix: 'B', rows: 3, perRow: 10 });
    expect(response.status).toBe(201);
    const outcome = response.body as { rowNumbers: number[]; spotIds: string[]; firstCode: string; lastCode: string };
    // The three rows queue after row 1 of the zone; the codes run B01–B30.
    expect(outcome.rowNumbers).toEqual([2, 3, 4]);
    expect(outcome.spotIds).toHaveLength(30);
    expect(outcome).toMatchObject({ firstCode: 'B01', lastCode: 'B30' });

    const drawn = await json('GET', '/v1/manage/beaches/blocco/layout', undefined, bearer('manager'));
    const { spots } = drawn.body as { spots: { code: string; zone: string; rowNumber: number; col: number; typeName: string }[] };
    const created = spots.filter((entry) => entry.code.startsWith('B'));
    expect(created).toHaveLength(30);
    expect(created.map((entry) => entry.code)).toEqual(Array.from({ length: 30 }, (_, index) => `B${String(index + 1).padStart(2, '0')}`));
    const byCode = Object.fromEntries(created.map((entry) => [entry.code, entry]));
    // The numbering crosses the rows: B11 opens the second row, B21 the third.
    expect(byCode.B10).toMatchObject({ rowNumber: 2, col: 10 });
    expect(byCode.B11).toMatchObject({ rowNumber: 3, col: 1 });
    expect(byCode.B21).toMatchObject({ rowNumber: 4, col: 1 });
    expect(byCode.B01).toMatchObject({ typeName: 'Ombrellone' });

    const trail = await database.admin.query<{ target: string; detail: Record<string, unknown> }>(
      "SELECT target, detail FROM audit_event WHERE action = 'layout.rows-add' AND beach_id = $1",
      [beach.beachId],
    );
    expect(trail.rows).toHaveLength(1);
    expect(trail.rows[0]!.target).toBe('ombrelloni/2-4');
    expect(trail.rows[0]!.detail).toMatchObject({ prefix: 'B', rows: 3, perRow: 10, spots: 30, firstCode: 'B01', lastCode: 'B30' });
  });

  it('sizes the leading zeroes by the total: 200 spots run from Z001 to Z200', async () => {
    const response = await bulk({ zone: 'monte', prefix: 'Z', rows: 10, perRow: 20 });
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ firstCode: 'Z001', lastCode: 'Z200' });
    expect(await codesLike('Z')).toBe(200);
  });

  it('fails whole on a code collision: no row is created', async () => {
    // A01–A03 already exist: the first ten A-codes collide.
    const refused = await bulk({ zone: 'ombrelloni', prefix: 'A', rows: 2, perRow: 10 });
    expect(refused.status).toBe(409);
    expect((refused.body as { error: { code: string } }).error.code).toBe('invalid_state');
    expect(await codesLike('A')).toBe(3);
    // No audit either: the transaction rolled back as one.
    const trail = await database.admin.query<{ n: string }>(
      "SELECT count(*) AS n FROM audit_event WHERE action = 'layout.rows-add' AND detail ->> 'prefix' = 'A'",
    );
    expect(Number(trail.rows[0]!.n)).toBe(0);
  });

  it('refuses more than 10 rows, more than 50 per row, more than 200 spots, and a bad prefix', async () => {
    expect((await bulk({ zone: 'ombrelloni', prefix: 'C', rows: 11, perRow: 5 })).status).toBe(400);
    expect((await bulk({ zone: 'ombrelloni', prefix: 'C', rows: 2, perRow: 51 })).status).toBe(400);
    expect((await bulk({ zone: 'ombrelloni', prefix: 'C', rows: 5, perRow: 41 })).status).toBe(400);
    expect((await bulk({ zone: 'ombrelloni', prefix: 'c', rows: 1, perRow: 5 })).status).toBe(400);
    expect(await codesLike('C')).toBe(0);
  });

  it('belongs to the manager alone, like the single row', async () => {
    expect((await bulk({ zone: 'ombrelloni', prefix: 'D', rows: 1, perRow: 5 }, 'reception')).status).toBe(403);
    expect((await json('POST', '/v1/manage/beaches/blocco/layout/rows/bulk', { zone: 'ombrelloni', prefix: 'D', rows: 1, perRow: 5 })).status).toBe(401);
    expect(await codesLike('D')).toBe(0);
  });
});
