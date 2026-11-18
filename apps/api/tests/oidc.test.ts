import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acquireHold, applyPaymentOutcome, setSplitRule, startCheckout } from '@ombre/db';
import { createTestDatabase, insertBeach, testAdminUrl, type TestBeach, type TestDatabase } from '@ombre/db/testing';
import { createApp } from '../src/app';

const signingSecret = 'segreto-di-prova-lungo-almeno-32-caratteri';
const day = '2099-07-01';

describe.skipIf(!testAdminUrl)('sign-in with the test identity provider', () => {
  let database: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let bare: ReturnType<typeof createApp>;
  let dune: TestBeach;
  let nextSpot = 0;

  beforeAll(async () => {
    database = await createTestDatabase(testAdminUrl!);
    dune = await insertBeach(database.admin, 'dune', { spots: 4, day });
    await setSplitRule(database.adminUrl, dune.beachId, { seasonHolder: 5000, beachClub: 4000, platform: 1000 });
    const options = { db: database.app.db, rateLimiter: { hit: () => 0 }, holdSeconds: 600, signingSecret, log: () => undefined };
    app = createApp({ ...options, oidc: { provider: 'test' as const, testSecret: 'segreto-oidc-di-prova' } });
    bare = createApp(options);
  });

  afterAll(async () => {
    await database?.drop();
  });

  const db = () => database.app.db;

  async function call(target: ReturnType<typeof createApp>, method: string, path: string, payload?: unknown, token?: string) {
    const response = await target.request(path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    const text = await response.text();
    return { status: response.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
  }
  const errorCode = (result: { body: Record<string, unknown> }) => (result.body.error as { code?: string } | undefined)?.code;

  /** The whole giro of the consent page: providers → test-code → callback. */
  async function signInWith(email: string, name: string) {
    const providers = await call(app, 'GET', '/v1/auth/oidc/providers');
    expect(providers.body.provider).toBe('test');
    const minted = await call(app, 'POST', '/v1/auth/oidc/test-code', { email, name });
    expect(minted.status).toBe(201);
    const back = await call(app, 'POST', '/v1/auth/oidc/callback', { code: minted.body.code, state: providers.body.state });
    return back;
  }

  it('answers none and 503 while no provider is configured', async () => {
    expect((await call(bare, 'GET', '/v1/auth/oidc/providers')).body).toEqual({ provider: null });
    const code = await call(bare, 'POST', '/v1/auth/oidc/test-code', { email: 'ada@example.org', name: 'Ada' });
    expect(code.status).toBe(503);
    expect(errorCode(code)).toBe('integration_unavailable');
    const back = await call(bare, 'POST', '/v1/auth/oidc/callback', { code: 'x', state: 'y' });
    expect(back.status).toBe(503);
    expect(errorCode(back)).toBe('integration_unavailable');
  });

  it('completes the full loop: a new email becomes an account with no forced change', async () => {
    const back = await signInWith('dora@example.org', 'Dora');
    expect(back.status).toBe(200);
    expect(back.body.user).toEqual({ email: 'dora@example.org', name: 'Dora', platformRole: 'none', twoFactor: false, mustChangePassword: false });
    const token = String(back.body.token);
    expect((await call(app, 'GET', '/v1/me', undefined, token)).body.user).toMatchObject({ email: 'dora@example.org', mustChangePassword: false });
    // No forced change: the area opens at once.
    expect((await call(app, 'GET', '/v1/account/bookings', undefined, token)).status).toBe(200);
  });

  it('links the same email to the same account and relinks the stays made with it', async () => {
    const held = await acquireHold(db(), dune.beachId, { spotId: dune.spotIds[nextSpot++]!, day, idempotencyKey: `test-${randomUUID()}`, ttlSeconds: 600 });
    const booked = await startCheckout(db(), dune.beachId, { holdId: held.holdId, guestName: 'Dora', guestEmail: 'dora@example.org' }, signingSecret);
    expect(await applyPaymentOutcome(db(), { provider: 'sandbox', eventId: randomUUID(), reference: booked.payment.reference, outcome: 'succeeded' })).toBe('confirmed');

    const back = await signInWith('dora@example.org', 'Dora');
    const mine = await call(app, 'GET', '/v1/account/bookings', undefined, String(back.body.token));
    expect((mine.body.upcoming as { code: string }[]).map((group) => group.code)).toEqual([booked.code]);

    // One account, one identity, however many sign-ins.
    const accounts = await database.admin.query("SELECT count(*)::int AS n FROM app_user WHERE email = 'dora@example.org'");
    expect(accounts.rows[0]).toEqual({ n: 1 });
    const identities = await database.admin.query("SELECT count(*)::int AS n FROM user_identity WHERE provider = 'test' AND subject = 'dora@example.org'");
    expect(identities.rows[0]).toEqual({ n: 1 });
  });

  it('refuses a tampered state and a tampered code', async () => {
    const providers = await call(app, 'GET', '/v1/auth/oidc/providers');
    const state = String(providers.body.state);
    const minted = await call(app, 'POST', '/v1/auth/oidc/test-code', { email: 'eva@example.org', name: 'Eva' });
    const code = String(minted.body.code);

    const forgedState = await call(app, 'POST', '/v1/auth/oidc/callback', { code, state: `${state.slice(0, -2)}xx` });
    expect(forgedState.status).toBe(401);
    expect(errorCode(forgedState)).toBe('invalid_state');

    const forgedCode = await call(app, 'POST', '/v1/auth/oidc/callback', { code: `${code.slice(0, -2)}xx`, state });
    expect(forgedCode.status).toBe(401);
    expect(errorCode(forgedCode)).toBe('invalid_code');

    // A code signed for another payload does not open anything either.
    const other = await call(app, 'POST', '/v1/auth/oidc/test-code', { email: 'furbo@example.org', name: 'Furbo' });
    const [payload] = code.split('.');
    const [, otherSignature] = String(other.body.code).split('.');
    const spliced = await call(app, 'POST', '/v1/auth/oidc/callback', { code: `${payload}.${otherSignature}`, state });
    expect(spliced.status).toBe(401);
    expect(errorCode(spliced)).toBe('invalid_code');

    // Nothing was created along the way.
    const accounts = await database.admin.query("SELECT count(*)::int AS n FROM app_user WHERE email IN ('eva@example.org', 'furbo@example.org')");
    expect(accounts.rows[0]).toEqual({ n: 0 });
  });
});
