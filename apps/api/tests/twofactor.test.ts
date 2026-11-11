import { createHmac } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetTwoFactor, upsertUser } from '@ombre/db';
import { createTestDatabase, insertBeach, testAdminUrl, type TestDatabase } from '@ombre/db/testing';
import { base32Decode } from '@ombre/shared';
import { createApp } from '../src/app';

const password = 'password-di-prova-123';
const signingSecret = 'segreto-di-prova-lungo-almeno-32-caratteri';

/** The code an authenticator app would show, computed independently of the database. */
function totp(secret: string, offsetSteps = 0): string {
  const step = Buffer.alloc(8);
  step.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + offsetSteps));
  const digest = createHmac('sha1', Buffer.from(base32Decode(secret))).update(step).digest();
  const offset = digest[19]! & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

describe.skipIf(!testAdminUrl)('two-step verification', () => {
  let database: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let strict: ReturnType<typeof createApp>;
  let secret = '';

  beforeAll(async () => {
    database = await createTestDatabase(testAdminUrl!);
    const beach = await insertBeach(database.admin, 'faro', { spots: 1, day: '2099-07-01' });
    await upsertUser(database.adminUrl, { email: 'gestore@faro.example', name: 'Gestore', password }, [{ beachId: beach.beachId, role: 'manager' }]);
    await upsertUser(database.adminUrl, { email: 'banco@faro.example', name: 'Banco', password }, [{ beachId: beach.beachId, role: 'reception' }]);
    const options = { db: database.app.db, rateLimiter: { hit: () => 0 }, holdSeconds: 600, signingSecret, brand: 'Marchio', log: () => undefined };
    app = createApp(options);
    strict = createApp({ ...options, requireTwoFactor: true });
  });

  afterAll(async () => {
    await database?.drop();
  });

  async function call(target: typeof app, method: string, path: string, payload?: unknown, token?: string) {
    const response = await target.request(path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    const text = await response.text();
    return { status: response.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
  }
  const signIn = (email: string, code?: string) => call(app, 'POST', '/v1/auth/login', { email, password, ...(code ? { code } : {}) });
  const code = (result: { body: Record<string, unknown> }) => (result.body.error as { code?: string } | undefined)?.code;
  const inventory = '/v1/manage/beaches/faro/inventory?day=2099-07-01';

  it('can be made compulsory for managers, without touching other roles', async () => {
    const manager = String((await signIn('gestore@faro.example')).body.token);
    const desk = String((await signIn('banco@faro.example')).body.token);
    expect((await call(app, 'GET', inventory, undefined, manager)).status).toBe(200);
    const refused = await call(strict, 'GET', inventory, undefined, manager);
    expect(refused.status).toBe(403);
    expect(code(refused)).toBe('totp_setup_required');
    expect((await call(strict, 'GET', inventory, undefined, desk)).status).toBe(200);
  });

  it('is switched on only after a first valid code from the authenticator app', async () => {
    const token = String((await signIn('gestore@faro.example')).body.token);
    const started = await call(app, 'POST', '/v1/auth/two-factor/begin', undefined, token);
    secret = String(started.body.secret);
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(started.body.otpauthUri).toBe(`otpauth://totp/Marchio%3Agestore%40faro.example?secret=${secret}&issuer=Marchio&algorithm=SHA1&digits=6&period=30`);

    expect(code(await call(app, 'POST', '/v1/auth/two-factor/confirm', { code: '000000' }, token))).toBe('totp_invalid');
    expect((await call(app, 'GET', '/v1/me', undefined, token)).body.user).toMatchObject({ twoFactor: false });
    expect((await signIn('gestore@faro.example')).status).toBe(200);

    expect((await call(app, 'POST', '/v1/auth/two-factor/confirm', { code: totp(secret) }, token)).status).toBe(204);
    expect((await call(app, 'GET', '/v1/me', undefined, token)).body.user).toMatchObject({ twoFactor: true });
    expect((await call(strict, 'GET', inventory, undefined, token)).status).toBe(200);
    expect(code(await call(app, 'POST', '/v1/auth/two-factor/begin', undefined, token))).toBe('invalid_state');
  });

  it('then asks for the code at every sign-in and never accepts the same code twice', async () => {
    const without = await signIn('gestore@faro.example');
    expect(without.status).toBe(401);
    expect(code(without)).toBe('totp_required');
    expect(code(await signIn('gestore@faro.example', '000000'))).toBe('invalid_credentials');

    const next = totp(secret, 1);
    expect((await signIn('gestore@faro.example', next)).status).toBe(200);
    expect(code(await signIn('gestore@faro.example', next))).toBe('invalid_credentials');
    expect(code(await signIn('gestore@faro.example', totp(secret, 0)))).toBe('invalid_credentials');
    expect((await signIn('banco@faro.example')).status).toBe(200);
  });

  it('can be switched off by the administrator for a person who lost their device', async () => {
    await database.admin.query("UPDATE app_user SET failed_logins = 0, locked_until = NULL WHERE email = 'gestore@faro.example'");
    await resetTwoFactor(database.adminUrl, 'gestore@faro.example');
    expect((await signIn('gestore@faro.example')).status).toBe(200);
  });
});
