import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { demoAccounts, demoBeach, demoHolderEmail, seedDemo, upsertUser } from '@ombre/db';
import { createTestDatabase, testAdminUrl, type TestDatabase } from '@ombre/db/testing';
import { createApp } from '../src/app';

const password = 'password-di-prova-123';
const day = '2027-07-10';

interface LayoutSpot {
  spotId: string;
  code: string;
  zone: string;
  rowNumber: number;
  umbrellas: number;
  sunbeds: number;
  maxGuests: number;
  rentalType: string | null;
  rentalNotes: string | null;
  retired: boolean;
  activeContract: { contractId: string } | null;
}

describe.skipIf(!testAdminUrl)('position on the map and layout of the beach', () => {
  let database: TestDatabase;
  let app: ReturnType<typeof createApp>;
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    database = await createTestDatabase(testAdminUrl!);
    const { beachId } = await seedDemo(database.adminUrl);
    app = createApp({ db: database.app.db, rateLimiter: { hit: () => 0 }, holdSeconds: 600, signingSecret: 'segreto-di-prova-lungo-almeno-32-caratteri', log: () => undefined });
    for (const account of demoAccounts) {
      await upsertUser(database.adminUrl, { email: account.email, name: account.name, password }, [{ beachId, role: account.role }]);
      const response = await send('POST', '/v1/auth/login', { email: account.email, password });
      tokens[account.role] = ((await response.json()) as { token: string }).token;
    }
  });

  afterAll(async () => {
    await database?.drop();
  });

  const send = (method: string, path: string, payload?: unknown, token?: string) =>
    app.request(path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });

  const manage = `/v1/manage/beaches/${demoBeach.slug}`;
  const manager = () => tokens.manager!;
  const reception = () => tokens.reception!;
  const accounting = () => tokens.accounting!;
  const layout = async (token = manager()) =>
    (await (await send('GET', `${manage}/layout`, undefined, token)).json()) as { shoreGapRows: number; landGapRows: number; spots: LayoutSpot[] };
  const publicAvailability = async (onDay: string) =>
    (await (await send('GET', `/v1/beaches/${demoBeach.slug}/availability?day=${onDay}`)).json()) as {
      beach: { latitude: number | null; longitude: number | null };
      gaps: { shoreGapRows: number; landGapRows: number };
      spots: { spotId: string; code: string; zone: string }[];
      layout: { code: string; zone: string }[];
    };
  const hold = (spotId: string, onDay: string, key: string) =>
    app.request('/v1/holds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify({ beachSlug: demoBeach.slug, spotId, day: onDay }),
    });

  it('lets the manager set, clear and correct the position; the public sees it', async () => {
    // The seed ships demonstrative coordinates; the manager can clear them.
    expect((await send('PUT', `${manage}/position`, { latitude: null, longitude: null }, manager())).status).toBe(204);
    let shown = await publicAvailability(demoBeach.day);
    expect(shown.beach).toMatchObject({ latitude: null, longitude: null });

    expect((await send('PUT', `${manage}/position`, { latitude: 44.7131, longitude: 12.2421 }, manager())).status).toBe(204);
    shown = await publicAvailability(demoBeach.day);
    expect(shown.beach).toMatchObject({ latitude: 44.7131, longitude: 12.2421 });
    const listed = (await (await send('GET', '/v1/beaches')).json()) as { beaches: { latitude: number | null; longitude: number | null }[] };
    expect(listed.beaches[0]).toMatchObject({ latitude: 44.7131, longitude: 12.2421 });

    // Out of range, or half a position: refused before touching the database.
    for (const bad of [
      { latitude: 90.5, longitude: 12 },
      { latitude: 44, longitude: -180.01 },
      { latitude: 44, longitude: null },
      { latitude: null, longitude: 12 },
    ]) {
      expect((await send('PUT', `${manage}/position`, bad, manager())).status).toBe(400);
    }
    expect((await send('PUT', `${manage}/position`, { latitude: 44, longitude: 12 }, reception())).status).toBe(403);
  });

  it('limits the reception to the distances and keeps accounting out', async () => {
    expect((await send('PUT', `${manage}/layout/gaps`, { shoreGapRows: 2, landGapRows: 3 }, reception())).status).toBe(204);
    const seen = await layout(reception());
    expect(seen).toMatchObject({ shoreGapRows: 2, landGapRows: 3 });

    expect((await send('PUT', `${manage}/layout/gaps`, { shoreGapRows: 11, landGapRows: 0 }, reception())).status).toBe(400);
    expect((await send('PUT', `${manage}/layout/gaps`, { shoreGapRows: 1, landGapRows: 1 }, accounting())).status).toBe(403);
    expect((await send('GET', `${manage}/layout`, undefined, accounting())).status).toBe(403);

    // The structure belongs to the manager alone.
    expect((await send('POST', `${manage}/layout/rows`, { zone: 'riva', prefix: 'R', count: 2 }, reception())).status).toBe(403);
    expect((await send('POST', `${manage}/layout/spots`, { zone: 'monte', code: 'M01' }, reception())).status).toBe(403);
    const [first] = (await layout()).spots;
    expect((await send('PUT', `${manage}/layout/spots/${first!.spotId}`, { sunbeds: 3 }, reception())).status).toBe(403);
    expect((await send('PUT', `${manage}/layout/spots/${first!.spotId}/retired`, { retired: true }, reception())).status).toBe(403);
    expect((await send('DELETE', `${manage}/layout/spots/${first!.spotId}`, undefined, reception())).status).toBe(403);
  });

  it('builds shore and land spots with single-sunbed defaults, and the public can book one', async () => {
    const added = await send('POST', `${manage}/layout/rows`, { zone: 'riva', prefix: 'R', count: 2 }, manager());
    expect(added.status).toBe(201);
    expect(((await added.json()) as { rowNumber: number; spotIds: string[] }).rowNumber).toBe(1);
    expect((await send('POST', `${manage}/layout/spots`, { zone: 'monte', code: 'M01' }, manager())).status).toBe(201);
    // A code already in use is refused, not overwritten.
    expect((await send('POST', `${manage}/layout/spots`, { zone: 'riva', code: 'A01' }, manager())).status).toBe(409);

    const drawn = await layout();
    expect(drawn.spots.map((spot) => spot.code)).toEqual(['R01', 'R02', 'A01', 'A02', 'A03', 'A04', 'B01', 'B02', 'B03', 'B04', 'M01']);
    expect(drawn.spots[0]).toMatchObject({ zone: 'riva', rowNumber: 1, umbrellas: 0, sunbeds: 1, maxGuests: 1, retired: false });
    expect(drawn.spots.at(-1)).toMatchObject({ code: 'M01', zone: 'monte', umbrellas: 0, sunbeds: 1, maxGuests: 1 });

    expect(await (await send('POST', `${manage}/inventory/publish`, { day, priceCents: 1500 }, manager())).json()).toEqual({ published: 11 });
    const open = await publicAvailability(day);
    expect(open.gaps).toEqual({ shoreGapRows: 2, landGapRows: 3 });
    expect(open.layout.map((spot) => spot.code).slice(0, 2)).toEqual(['R01', 'R02']);
    const shore = open.spots.find((spot) => spot.code === 'R01');
    expect(shore?.zone).toBe('riva');

    const booked = await hold(shore!.spotId, day, 'test-layout-shore-1');
    expect(booked.status).toBe(201);
  });

  it('keeps rental labels and notes for spot and row in the back office only', async () => {
    const before = await layout();
    const a02 = before.spots.find((spot) => spot.code === 'A02')!;
    expect((await send('PUT', `${manage}/layout/spots/${a02.spotId}`, { rentalType: 'Stagionale', rentalNotes: 'Famiglia Rossi' }, manager())).status).toBe(204);
    const renamed = await send('PUT', `${manage}/layout/rows/rental`, { zone: 'ombrelloni', rowNumber: 2, rentalType: 'Albergo', rentalNotes: 'Hotel di prova' }, manager());
    expect(await renamed.json()).toEqual({ updated: 4 });
    expect((await send('PUT', `${manage}/layout/spots/${a02.spotId}`, { rentalType: 'x'.repeat(41) }, manager())).status).toBe(400);
    expect((await send('PUT', `${manage}/layout/rows/rental`, { zone: 'monte', rowNumber: 9, rentalType: null, rentalNotes: null }, manager())).status).toBe(404);

    // The label "Stagionale" is an annotation: the real season contract shows up next to it.
    await database.admin.query(
      `INSERT INTO season_contract (beach_id, holder_user_id, spot_id, valid_from, valid_to)
       SELECT s.beach_id, (SELECT id FROM app_user WHERE email = $1), s.id, current_date - 10, current_date + 10
       FROM spot s WHERE s.id = $2`,
      [demoHolderEmail, a02.spotId],
    );
    const after = await layout();
    const spot = after.spots.find((entry) => entry.code === 'A02')!;
    expect(spot).toMatchObject({ rentalType: 'Stagionale', rentalNotes: 'Famiglia Rossi' });
    expect(spot.activeContract).not.toBeNull();
    expect(after.spots.find((entry) => entry.code === 'B01')).toMatchObject({ rentalType: 'Albergo', rentalNotes: 'Hotel di prova' });

    // Clearing with null works, and nothing of this ever reaches the public.
    expect((await send('PUT', `${manage}/layout/spots/${a02.spotId}`, { rentalNotes: null }, manager())).status).toBe(204);
    expect((await layout()).spots.find((entry) => entry.code === 'A02')).toMatchObject({ rentalType: 'Stagionale', rentalNotes: null });
    const open = JSON.stringify(await publicAvailability(day));
    expect(open).not.toMatch(/rentalType|rentalNotes|retired|Albergo|Stagionale/);
  });

  it('refuses to delete a used spot, retires it instead, and skips it in new publishes', async () => {
    const drawn = await layout();
    const a01 = drawn.spots.find((spot) => spot.code === 'A01')!;

    // A01 has published days since the seed: deletion is refused with the alternative.
    const refused = await send('DELETE', `${manage}/layout/spots/${a01.spotId}`, undefined, manager());
    expect(refused.status).toBe(409);
    expect(((await refused.json()) as { error: { message: string } }).error.message).toMatch(/retire/);

    // A spot never used can be deleted.
    const fresh = (await (await send('POST', `${manage}/layout/spots`, { zone: 'monte', code: 'M09' }, manager())).json()) as { spotId: string };
    expect((await send('DELETE', `${manage}/layout/spots/${fresh.spotId}`, undefined, manager())).status).toBe(204);
    expect((await layout()).spots.map((spot) => spot.code)).not.toContain('M09');

    // Retired: hidden from the public, not bookable, skipped by new publishes; the history stays.
    expect((await send('PUT', `${manage}/layout/spots/${a01.spotId}/retired`, { retired: true }, manager())).status).toBe(204);
    const open = await publicAvailability(demoBeach.day);
    expect(open.layout.map((spot) => spot.code)).not.toContain('A01');
    expect(open.spots.map((spot) => spot.code)).not.toContain('A01');
    expect((await hold(a01.spotId, demoBeach.day, 'test-layout-retired-1')).status).toBe(409);
    expect(await (await send('POST', `${manage}/inventory/publish`, { day: '2027-07-11', priceCents: 2000 }, manager())).json()).toEqual({ published: 10 });
    expect(Number((await database.admin.query<{ n: string }>("SELECT count(*) AS n FROM inventory_day d JOIN spot s ON s.id = d.spot_id WHERE s.code = 'A01'")).rows[0]!.n)).toBeGreaterThan(0);

    // Back on sale: the next publish includes it again, and the manager sees it retired meanwhile.
    expect((await layout()).spots.find((spot) => spot.code === 'A01')).toMatchObject({ retired: true });
    expect((await send('PUT', `${manage}/layout/spots/${a01.spotId}/retired`, { retired: false }, manager())).status).toBe(204);
    expect(await (await send('POST', `${manage}/inventory/publish`, { day: '2027-07-12', priceCents: 2000 }, manager())).json()).toEqual({ published: 11 });
  });

  it('writes every layout action to the audit trail', async () => {
    const trail = await database.admin.query<{ action: string }>("SELECT DISTINCT action FROM audit_event WHERE action LIKE 'layout.%' OR action = 'beach.position'");
    const actions = trail.rows.map((row) => row.action).sort();
    expect(actions).toEqual([
      'beach.position',
      // The demo seed draws its scene through addElement, audited like every drawing.
      'layout.element-add',
      'layout.gaps',
      'layout.restore',
      'layout.retire',
      'layout.row-add',
      'layout.row-rental',
      'layout.spot-add',
      'layout.spot-delete',
      'layout.spot-update',
    ]);
  });
});
