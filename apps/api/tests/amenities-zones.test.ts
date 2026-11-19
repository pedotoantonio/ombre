import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { demoAccounts, demoBeach, seedDemo, upsertUser } from '@ombre/db';
import { createTestDatabase, testAdminUrl, type TestDatabase } from '@ombre/db/testing';
import { createApp } from '../src/app';

const password = 'password-di-prova-123';
const slug = demoBeach.slug;
const manage = `/v1/manage/beaches/${slug}`;

describe.skipIf(!testAdminUrl)('amenities and named zones over the API (D49, D50)', () => {
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
  const manager = () => tokens.manager!;
  const reception = () => tokens.reception!;

  it('replaces the amenity set from the settings panel and shows it on the public card', async () => {
    // Only the manager (site.edit): the reception sets no amenities.
    expect((await send('PUT', `${manage}/amenities`, { amenities: ['bar'] }, reception())).status).toBe(403);
    expect((await send('PUT', `${manage}/amenities`, { amenities: ['bar'] })).status).toBe(401);
    expect((await send('PUT', `${manage}/amenities`, { amenities: ['sauna'] }, manager())).status).toBe(400);

    const set = await send('PUT', `${manage}/amenities`, { amenities: ['wifi', 'bar', 'playground'] }, manager());
    expect(set.status).toBe(200);
    expect(await set.json()).toEqual({ amenities: ['bar', 'playground', 'wifi'] });

    const shown = (await (await send('GET', `/v1/beaches/${slug}`)).json()) as { beach: { amenities: string[] } };
    expect(shown.beach.amenities).toEqual(['bar', 'playground', 'wifi']);
  });

  it('filters the search with ALL the requested amenities', async () => {
    const list = async (query: string) => {
      const response = await send('GET', `/v1/beaches${query}`);
      return { status: response.status, body: (await response.json()) as { beaches?: { slug: string; amenities: string[] }[] } };
    };
    expect((await list('?amenities=bar,wifi')).body.beaches!.map((club) => club.slug)).toEqual([slug]);
    expect((await list('?amenities=bar,pets')).body.beaches).toEqual([]);
    expect((await list(`?day=${demoBeach.day}&amenities=bar,wifi`)).body.beaches!.map((club) => club.slug)).toEqual([slug]);
    expect((await list('?amenities=bar,sauna')).status).toBe(400);
    expect((await list('?amenities=')).status).toBe(400);
  });

  it('creates, renames, assigns per spot and per row, and deletes zones from the planimetria', async () => {
    expect((await send('POST', `${manage}/zones`, { name: 'Zona Relax' }, reception())).status).toBe(403);
    const created = await send('POST', `${manage}/zones`, { name: 'Zona Relax' }, manager());
    expect(created.status).toBe(201);
    const { zoneId } = (await created.json()) as { zoneId: string };
    expect((await send('POST', `${manage}/zones`, { name: 'Zona Relax' }, manager())).status).toBe(409);
    expect((await send('POST', `${manage}/zones`, { name: 'X' }, manager())).status).toBe(400);

    // The row gesture, like the rental per row: row 1 of the umbrellas (A01–A04).
    const rowed = await send('PUT', `${manage}/layout/rows/zone`, { zone: 'ombrelloni', rowNumber: 1, zoneId }, manager());
    expect(rowed.status).toBe(200);
    expect(await rowed.json()).toEqual({ updated: 4 });

    // One spot apart, through the spot edit form; the layout shows both fields.
    const layout = (await (await send('GET', `${manage}/layout`, undefined, manager())).json()) as { spots: { spotId: string; code: string; namedZoneId: string | null; zoneName: string | null }[] };
    const a02 = layout.spots.find((place) => place.code === 'A02')!;
    expect(a02).toMatchObject({ namedZoneId: zoneId, zoneName: 'Zona Relax' });
    expect((await send('PUT', `${manage}/layout/spots/${a02.spotId}`, { namedZoneId: null }, manager())).status).toBe(204);

    expect((await send('PUT', `${manage}/zones/${zoneId}`, { name: 'Prima fila' }, manager())).status).toBe(204);

    // The public map carries the name next to the code, nothing denormalized.
    const publicMap = (await (await send('GET', `/v1/beaches/${slug}/availability?day=${demoBeach.day}`)).json()) as { layout: { code: string; zoneName: string | null }[] };
    const nameOf = new Map(publicMap.layout.map((place) => [place.code, place.zoneName]));
    expect(nameOf.get('A01')).toBe('Prima fila');
    expect(nameOf.get('A02')).toBeNull();
    expect(nameOf.get('B01')).toBeNull();

    const removed = await send('DELETE', `${manage}/zones/${zoneId}`, undefined, manager());
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({ detachedSpots: 3 });
    const zones = (await (await send('GET', `${manage}/zones`, undefined, manager())).json()) as { zones: unknown[] };
    expect(zones.zones).toEqual([]);
  });
});
