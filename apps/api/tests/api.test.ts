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
    app = createApp({ db: database.app.db, holdSeconds: 600, signingSecret: 'segreto-di-prova-lungo-almeno-32-caratteri', log: (_message, error) => logged.push(error) });
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
      beaches: [{ slug: 'bagno-delle-dune', name: 'Bagno delle Dune', locality: 'Lido di Pomposa', timezone: 'Europe/Rome', demo: true }],
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
