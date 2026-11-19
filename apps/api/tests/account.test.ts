import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acquireHold, applyPaymentOutcome, cancelByBeachClub, setSplitRule, startCheckout, upsertUser } from '@ombre/db';
import { createTestDatabase, insertBeach, testAdminUrl, type TestBeach, type TestDatabase } from '@ombre/db/testing';
import { createApp } from '../src/app';

const signingSecret = 'segreto-di-prova-lungo-almeno-32-caratteri';
const day = '2099-07-01';

describe.skipIf(!testAdminUrl)('the guest account over the API', () => {
  let database: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let dune: TestBeach;
  let faro: TestBeach;
  let nextDune = 0;
  let nextFaro = 0;

  beforeAll(async () => {
    database = await createTestDatabase(testAdminUrl!);
    dune = await insertBeach(database.admin, 'dune', { spots: 8, day });
    faro = await insertBeach(database.admin, 'faro', { spots: 4, day });
    for (const beach of [dune, faro]) await setSplitRule(database.adminUrl, beach.beachId, { seasonHolder: 5000, beachClub: 4000, platform: 1000 });
    app = createApp({ db: database.app.db, rateLimiter: { hit: () => 0 }, holdSeconds: 600, signingSecret, log: () => undefined });
  });

  afterAll(async () => {
    await database?.drop();
  });

  const db = () => database.app.db;

  async function call(method: string, path: string, payload?: unknown, token?: string) {
    const response = await app.request(path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    const text = await response.text();
    return { status: response.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
  }
  const errorCode = (result: { body: Record<string, unknown> }) => (result.body.error as { code?: string } | undefined)?.code;

  async function confirmed(beach: TestBeach, spotId: string, guestEmail: string, onDay = day): Promise<string> {
    const held = await acquireHold(db(), beach.beachId, { spotId, day: onDay, idempotencyKey: `test-${randomUUID()}`, ttlSeconds: 600 });
    const booked = await startCheckout(db(), beach.beachId, { holdId: held.holdId, guestName: 'Ada', guestEmail }, signingSecret);
    expect(await applyPaymentOutcome(db(), { provider: 'sandbox', eventId: randomUUID(), reference: booked.payment.reference, outcome: 'succeeded' })).toBe('confirmed');
    return booked.code;
  }

  const generatedPassword = async (email: string) => {
    const queued = await database.admin.query<{ payload: { password: string } }>(
      "SELECT payload FROM outbox WHERE kind = 'account.created' AND payload->>'email' = $1",
      [email],
    );
    return queued.rows[0]!.payload.password;
  };

  it('answers the registration of a new and of a known email identically, queueing a different mail', async () => {
    const first = await call('POST', '/v1/account/register', { name: 'Ada', email: 'ada@example.org', locale: 'it' });
    const second = await call('POST', '/v1/account/register', { name: 'Ada', email: 'ada@example.org', locale: 'it' });
    expect(first).toEqual({ status: 201, body: { result: 'ok' } });
    expect(second).toEqual(first);

    const queued = await database.admin.query<{ beach_id: string | null; kind: string; payload: Record<string, string> }>(
      "SELECT beach_id, kind, payload FROM outbox WHERE kind LIKE 'account.%' ORDER BY id",
    );
    expect(queued.rows.map((row) => [row.beach_id, row.kind])).toEqual([
      [null, 'account.created'],
      [null, 'account.exists'],
    ]);
    // The generated password lives only in the queued mail, never in a response.
    expect(queued.rows[0]!.payload.password).toHaveLength(16);
    expect(queued.rows[1]!.payload.password).toBeUndefined();
  });

  it('forces the password change at the first sign-in, then opens the area', async () => {
    const generated = await generatedPassword('ada@example.org');
    const signedIn = await call('POST', '/v1/auth/login', { email: 'ada@example.org', password: generated });
    expect(signedIn.status).toBe(200);
    const token = String(signedIn.body.token);

    const me = await call('GET', '/v1/me', undefined, token);
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ mustChangePassword: true });

    const refused = await call('GET', '/v1/account/bookings', undefined, token);
    expect(refused.status).toBe(403);
    expect(errorCode(refused)).toBe('password_change_required');

    const wrongOld = await call('POST', '/v1/account/password', { current: 'sbagliata-e-lunga', next: 'nuova-parola-lunga' }, token);
    expect(wrongOld.status).toBe(401);
    expect(errorCode(wrongOld)).toBe('invalid_credentials');
    const tooShort = await call('POST', '/v1/account/password', { current: generated, next: 'corta' }, token);
    expect(tooShort.status).toBe(422);
    expect(errorCode(tooShort)).toBe('weak_password');

    expect((await call('POST', '/v1/account/password', { current: generated, next: 'nuova-parola-lunga' }, token)).status).toBe(204);
    expect((await call('GET', '/v1/me', undefined, token)).body.user).toMatchObject({ mustChangePassword: false });
    expect((await call('GET', '/v1/account/bookings', undefined, token)).status).toBe(200);
    expect((await call('POST', '/v1/auth/login', { email: 'ada@example.org', password: 'nuova-parola-lunga' })).status).toBe(200);
  });

  it('relinks by email at the registration and at the sign-in, and shows the history across beach clubs', async () => {
    // Before the account exists: one stay at each beach club, one of which gets cancelled, one in the past.
    const atDune = await confirmed(dune, dune.spotIds[nextDune++]!, 'bea@example.org');
    const atFaro = await confirmed(faro, faro.spotIds[nextFaro++]!, 'bea@example.org');
    const cancelled = await confirmed(dune, dune.spotIds[nextDune++]!, 'bea@example.org');
    await upsertUser(database.adminUrl, { email: 'gestore@dune.example', name: 'Gestore', password: 'password-di-prova-123' }, [{ beachId: dune.beachId, role: 'manager' }]);
    const manager = await database.admin.query<{ id: string }>("SELECT id FROM app_user WHERE email = 'gestore@dune.example'");
    await cancelByBeachClub(db(), { beachId: dune.beachId, userId: manager.rows[0]!.id, role: 'manager' }, { code: cancelled, reason: 'prova di annullamento' });
    const pastSpot = dune.spotIds[nextDune++]!;
    const past = await confirmed(dune, pastSpot, 'bea@example.org');
    await database.admin.query('UPDATE inventory_day SET day = current_date - 2 WHERE spot_id = $1', [pastSpot]);

    expect((await call('POST', '/v1/account/register', { name: 'Bea', email: 'bea@example.org', locale: 'it' })).status).toBe(201);
    const generated = await generatedPassword('bea@example.org');
    const token = String((await call('POST', '/v1/auth/login', { email: 'bea@example.org', password: generated })).body.token);
    expect((await call('POST', '/v1/account/password', { current: generated, next: 'parola-mia-lunga-12' }, token)).status).toBe(204);

    const mine = await call('GET', '/v1/account/bookings', undefined, token);
    expect(mine.status).toBe(200);
    const view = mine.body as {
      currency: string;
      nextArrivals: number;
      totalSpentCents: number;
      upcoming: { code: string; beachSlug: string; status: string; passCredential: string | null }[];
      past: { code: string; status: string; passCredential: string | null }[];
    };
    expect(view.currency).toBe('EUR');
    expect(view.upcoming.map((group) => group.code).sort()).toEqual([atDune, atFaro].sort());
    expect(new Set(view.upcoming.map((group) => group.beachSlug))).toEqual(new Set(['dune', 'faro']));
    expect(view.upcoming.every((group) => group.status === 'confirmed' && group.passCredential)).toBe(true);
    expect(view.past.map((group) => [group.code, group.status]).sort()).toEqual(
      [
        [cancelled, 'cancelled'],
        [past, 'completed'],
      ].sort(),
    );
    expect(view.past.every((group) => group.passCredential === null)).toBe(true);
    expect(view.nextArrivals).toBe(2);
    // 3000 cents per confirmed day; the cancelled one was refunded but its payment stays counted as spent.
    expect(view.totalSpentCents).toBe(12_000);

    // A stay made after the registration joins at the next sign-in. Booked on its
    // own day: the per-day numbering must not collide with the day moved to the past.
    const laterSpot = dune.spotIds[nextDune++]!;
    await database.admin.query("INSERT INTO inventory_day (beach_id, spot_id, day, state, price_cents) VALUES ($1, $2, '2099-07-02', 'available', 3000)", [dune.beachId, laterSpot]);
    const later = await confirmed(dune, laterSpot, 'bea@example.org', '2099-07-02');
    expect((await call('GET', '/v1/account/bookings', undefined, token)).body).toMatchObject({ upcoming: expect.not.arrayContaining([expect.objectContaining({ code: later })]) });
    await call('POST', '/v1/auth/login', { email: 'bea@example.org', password: 'parola-mia-lunga-12' });
    const relinked = (await call('GET', '/v1/account/bookings', undefined, token)).body as { upcoming: { code: string }[] };
    expect(relinked.upcoming.map((group) => group.code)).toContain(later);

    // Another account sees none of it.
    expect((await call('POST', '/v1/account/register', { name: 'Caio', email: 'caio@example.org', locale: 'it' })).status).toBe(201);
    const otherGenerated = await generatedPassword('caio@example.org');
    const otherToken = String((await call('POST', '/v1/auth/login', { email: 'caio@example.org', password: otherGenerated })).body.token);
    expect((await call('POST', '/v1/account/password', { current: otherGenerated, next: 'parola-di-caio-123' }, otherToken)).status).toBe(204);
    expect((await call('GET', '/v1/account/bookings', undefined, otherToken)).body).toMatchObject({ nextArrivals: 0, totalSpentCents: 0, upcoming: [], past: [] });
  }, 30_000);
});
