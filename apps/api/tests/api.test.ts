import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { demoBeach, seedDemo } from '@ombre/db';
import { createTestDatabase, testAdminUrl, type TestDatabase } from '@ombre/db/testing';
import { createApp } from '../src/app';

describe.skipIf(!testAdminUrl)('API /v1 on the demo beach club', () => {
  let database: TestDatabase;
  let app: ReturnType<typeof createApp>;
  const logged: unknown[] = [];

  beforeAll(async () => {
    database = await createTestDatabase(testAdminUrl!);
    await seedDemo(database.adminUrl);
    app = createApp({ db: database.app.db, rateLimiter: { hit: () => 0 }, holdSeconds: 600, signingSecret: 'segreto-di-prova-lungo-almeno-32-caratteri', log: (_message, error) => logged.push(error) });
  });

  afterAll(async () => {
    await database?.drop();
  });

  const availabilityPath = `/v1/beaches/${demoBeach.slug}/availability?day=${demoBeach.day}`;
  const post = (path: string, payload: unknown, headers: Record<string, string> = {}) =>
    app.request(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(payload) });
  const spotByCode = async (code: string) => {
    const data = (await (await app.request(availabilityPath)).json()) as { spots: { spotId: string; code: string }[] };
    return data.spots.find((spot) => spot.code === code)!.spotId;
  };

  it('answers health and lists active beach clubs without internal identifiers', async () => {
    expect((await app.request('/v1/health')).status).toBe(200);
    const response = await app.request('/v1/beaches');
    expect(await response.json()).toEqual({
      beaches: [{ slug: 'bagno-delle-dune', name: 'Bagno delle Dune', locality: 'Lido di Pomposa', timezone: 'Europe/Rome', demo: true, latitude: demoBeach.latitude, longitude: demoBeach.longitude, amenities: [], cover: { src: '/demo/dune.jpg', alt: { it: 'Dune di sabbia con il mare sullo sfondo', en: 'Sand dunes with the sea behind' } } }],
    });
  });

  it('lists the free spots of a day with prices in cents', async () => {
    const response = await app.request(availabilityPath);
    const data = (await response.json()) as { currency: string; spots: { code: string; priceCents: number; shared: boolean }[] };
    expect(response.status).toBe(200);
    expect(data.currency).toBe('EUR');
    expect(data.spots.map((spot) => spot.code)).toEqual(['A01', 'A02', 'A03', 'A04', 'B01', 'B02', 'B03', 'B04']);
    expect(data.spots.every((spot) => spot.priceCents === 3000)).toBe(true);
    expect(data.spots.find((spot) => spot.code === 'B02')?.shared).toBe(true);
  });

  interface MapSpot {
    code: string;
    rowNumber: number;
    status: string;
    priceCents: number | null;
  }
  const layoutOf = async (day: string) => (await (await app.request(`/v1/beaches/${demoBeach.slug}/availability?day=${day}`)).json()) as { spots: unknown[]; layout: MapSpot[] };
  const search = async (query: string) => {
    const response = await app.request(`/v1/beaches${query}`);
    return { status: response.status, body: (await response.json()) as { beaches?: { slug: string; freeSpots?: number; priceFromCents?: number | null }[] } & Record<string, unknown> };
  };

  it('describes every spot of the day for the map: free, shared or unavailable', async () => {
    const { layout } = await layoutOf(demoBeach.day);
    expect(layout.map((spot) => `${spot.code}:${spot.rowNumber}:${spot.status}:${spot.priceCents}`)).toEqual([
      'A01:1:free:3000',
      'A02:1:free:3000',
      'A03:1:free:3000',
      'A04:1:free:3000',
      'B01:2:free:3000',
      'B02:2:shared:3000',
      'B03:2:free:3000',
      'B04:2:free:3000',
    ]);
    expect(layout[0]).toMatchObject({ umbrellas: 1, sunbeds: 2, maxGuests: 2 });

    // A day never published and a day that has passed: every spot is there, none can be bought.
    for (const day of ['2027-06-18', '2020-06-17']) {
      const other = await layoutOf(day);
      expect(other.spots).toEqual([]);
      expect(other.layout).toHaveLength(8);
      expect(other.layout.every((spot) => spot.status === 'unavailable' && spot.priceCents === null)).toBe(true);
    }
  });

  it('searches beach clubs by day, guests, place and shared days, with a price that can be paid', async () => {
    const beach = { slug: 'bagno-delle-dune', name: 'Bagno delle Dune', locality: 'Lido di Pomposa', timezone: 'Europe/Rome', demo: true, latitude: demoBeach.latitude, longitude: demoBeach.longitude, amenities: [], cover: { src: '/demo/dune.jpg', alt: { it: 'Dune di sabbia con il mare sullo sfondo', en: 'Sand dunes with the sea behind' } } };
    expect((await search(`?day=${demoBeach.day}`)).body).toEqual({
      day: demoBeach.day,
      // Il periodo minimo (D39): «al» predefinito uguale a «dal».
      to: demoBeach.day,
      guests: 1,
      sharedOnly: false,
      currency: 'EUR',
      beaches: [{ ...beach, freeSpots: 8, priceFromCents: 3000 }],
    });
    expect((await search(`?day=${demoBeach.day}&guests=2`)).body).toMatchObject({ guests: 2, beaches: [{ freeSpots: 8, priceFromCents: 3000 }] });
    expect((await search(`?day=${demoBeach.day}&guests=3`)).body.beaches).toEqual([{ ...beach, freeSpots: 0, priceFromCents: null }]);
    expect((await search(`?day=${demoBeach.day}&sharedOnly=true`)).body).toMatchObject({ sharedOnly: true, beaches: [{ freeSpots: 1, priceFromCents: 3000 }] });
    expect((await search(`?day=${demoBeach.day}&sharedOnly=false`)).body).toMatchObject({ sharedOnly: false, beaches: [{ freeSpots: 8 }] });
    expect((await search('?day=2020-06-17')).body.beaches).toEqual([{ ...beach, freeSpots: 0, priceFromCents: null }]);

    expect((await search(`?day=${demoBeach.day}&locality=pomposa`)).body.beaches).toHaveLength(1);
    expect((await search(`?day=${demoBeach.day}&locality=Rimini`)).body.beaches).toEqual([]);
    expect((await search('?locality=DUNE')).body).toEqual({ beaches: [beach] });
    expect((await search('?locality=%25')).body).toEqual({ beaches: [] });

    for (const bad of ['?day=domani', `?day=${demoBeach.day}&guests=0`, `?day=${demoBeach.day}&guests=due`, `?day=${demoBeach.day}&guests=21`, `?day=${demoBeach.day}&sharedOnly=si`, '?guests=2', '?sharedOnly=true', '?locality=']) {
      const refused = await search(bad);
      expect([bad, refused.status, (refused.body.error as { code: string } | undefined)?.code]).toEqual([bad, 400, 'invalid_request']);
    }
  });

  it('quotes B02 with MARE10 at 27.00 and ignores any price sent by the client', async () => {
    const spotId = await spotByCode('B02');
    const response = await post('/v1/quotes', { beachSlug: demoBeach.slug, spotId, day: demoBeach.day, promoCode: 'MARE10', totalCents: 1 });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ currency: 'EUR', listPriceCents: 3000, discountCents: 300, totalCents: 2700, promoCode: 'MARE10' });
  });

  it('holds B02 once, replays the same key, and tells the second buyer about the conflict', async () => {
    const spotId = await spotByCode('B02');
    const payload = { beachSlug: demoBeach.slug, spotId, day: demoBeach.day, promoCode: 'MARE10' };
    const idempotencyKey = `test-${randomUUID()}`;

    const created = await post('/v1/holds', payload, { 'Idempotency-Key': idempotencyKey });
    const first = (await created.json()) as { holdId: string; totalCents: number; expiresAt: string };
    expect(created.status).toBe(201);
    expect(first.totalCents).toBe(2700);
    expect(new Date(first.expiresAt).getTime()).toBeGreaterThan(Date.now() + 9 * 60_000);

    const replay = await post('/v1/holds', payload, { 'Idempotency-Key': idempotencyKey });
    expect(replay.status).toBe(200);
    expect(((await replay.json()) as { holdId: string }).holdId).toBe(first.holdId);

    const rival = await post('/v1/holds', payload, { 'Idempotency-Key': `test-${randomUUID()}` });
    expect(rival.status).toBe(409);
    expect(await rival.json()).toEqual({ error: { code: 'inventory_conflict', message: 'This spot has just been taken' } });

    const codes = ((await (await app.request(availabilityPath)).json()) as { spots: { code: string }[] }).spots.map((spot) => spot.code);
    expect(codes).not.toContain('B02');

    // The map and the search say the same: B02 is still drawn, but nobody can buy it.
    const onMap = (await layoutOf(demoBeach.day)).layout.find((spot) => spot.code === 'B02');
    expect(onMap).toMatchObject({ status: 'unavailable', priceCents: null });
    expect((await search(`?day=${demoBeach.day}&sharedOnly=true`)).body.beaches).toMatchObject([{ freeSpots: 0, priceFromCents: null }]);
    expect((await search(`?day=${demoBeach.day}&guests=2`)).body.beaches).toMatchObject([{ freeSpots: 7, priceFromCents: 3000 }]);
  });

  it('describes a beach club with its next free day and shows a hold by its identifier', async () => {
    const overview = (await (await app.request(`/v1/beaches/${demoBeach.slug}`)).json()) as { nextAvailableDay: string };
    expect(overview.nextAvailableDay).toBe(demoBeach.day);

    const spotId = await spotByCode('A04');
    const created = await post('/v1/holds', { beachSlug: demoBeach.slug, spotId, day: demoBeach.day }, { 'Idempotency-Key': `test-${randomUUID()}` });
    const { holdId } = (await created.json()) as { holdId: string };
    const shown = await app.request(`/v1/beaches/${demoBeach.slug}/holds/${holdId}`);
    expect(await shown.json()).toMatchObject({ holdId, status: 'active', day: demoBeach.day, spot: { code: 'A04', rowNumber: 1 }, totalCents: 3000 });
    expect((await app.request(`/v1/beaches/${demoBeach.slug}/holds/${randomUUID()}`)).status).toBe(404);
  });

  it('refuses bad requests with clear codes and no internal details', async () => {
    const spotId = await spotByCode('A01');
    const valid = { beachSlug: demoBeach.slug, spotId, day: demoBeach.day };

    expect((await post('/v1/holds', valid)).status).toBe(400);
    expect((await post('/v1/holds', { ...valid, day: '17/06/2027' }, { 'Idempotency-Key': 'test-12345678' })).status).toBe(400);
    expect((await post('/v1/quotes', { ...valid, promoCode: 'INESISTENTE' })).status).toBe(422);
    expect((await post('/v1/quotes', { ...valid, beachSlug: 'bagno-che-non-esiste' })).status).toBe(404);
    expect((await post('/v1/quotes', { ...valid, spotId: randomUUID() })).status).toBe(409);
    expect((await app.request('/v1/beaches/bagno-delle-dune/availability?day=domani')).status).toBe(400);
    expect((await app.request('/v1/altro')).status).toBe(404);

    const malformed = await app.request('/v1/quotes', { method: 'POST', body: '{non json' });
    expect(malformed.status).toBe(400);
    expect(logged).toEqual([]);
  });
});
