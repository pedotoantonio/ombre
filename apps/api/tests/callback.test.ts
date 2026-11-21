import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { upsertUser } from '@ombre/db';
import { createTestDatabase, testAdminUrl, type TestDatabase } from '@ombre/db/testing';
import { createApp } from '../src/app';

const signingSecret = 'segreto-di-prova-lungo-almeno-32-caratteri';

describe.skipIf(!testAdminUrl)('the «Ti chiamiamo noi» callback over the API (D71)', () => {
  let database: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let adminToken: string;
  let guestToken: string;

  beforeAll(async () => {
    database = await createTestDatabase(testAdminUrl!);
    app = createApp({ db: database.app.db, rateLimiter: { hit: () => 0 }, holdSeconds: 600, signingSecret, log: () => undefined });
    await upsertUser(database.adminUrl, { email: 'amministrazione@ombre.example', name: 'Piattaforma', password: 'password-di-prova-123', platformRole: 'admin' });
    await upsertUser(database.adminUrl, { email: 'ospite@example.org', name: 'Ospite', password: 'password-di-prova-123' });
    adminToken = await signIn('amministrazione@ombre.example');
    guestToken = await signIn('ospite@example.org');
  });

  afterAll(async () => {
    await database?.drop();
  });

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

  async function signIn(email: string): Promise<string> {
    const signedIn = await call('POST', '/v1/auth/login', { email, password: 'password-di-prova-123' });
    expect(signedIn.status).toBe(200);
    return String(signedIn.body.token);
  }

  type Listed = { requestId: string; createdAt: string; name: string; phone: string; beachName: string | null; locale: string; status: string; calledAt: string | null };
  const listed = async (token: string) => {
    const result = await call('GET', '/v1/platform/callback-requests', undefined, token);
    expect(result.status).toBe(200);
    return result.body.requests as Listed[];
  };

  it('records a public request, with and without the beach club name', async () => {
    const whole = await call('POST', '/v1/callback-requests', { name: 'Rino Scogli', phone: '+39 0541 123456', beachName: 'Bagno Scoglio', locale: 'it' });
    expect(whole.status).toBe(201);
    expect(String(whole.body.requestId)).toMatch(/^[0-9a-f-]{36}$/);

    const bare = await call('POST', '/v1/callback-requests', { name: 'Mara Duna', phone: '333 1234567', locale: 'en' });
    expect(bare.status).toBe(201);
    expect(bare.body.requestId).not.toBe(whole.body.requestId);
  });

  it('refuses what the form forbids, without recording anything', async () => {
    const refused = [
      { name: '   ', phone: '0541 123456', locale: 'it' },
      { name: 'x'.repeat(81), phone: '0541 123456', locale: 'it' },
      { name: 'Rino', phone: '12345', locale: 'it' },
      { name: 'Rino', phone: '1'.repeat(21), locale: 'it' },
      { name: 'Rino', phone: 'telefonami', locale: 'it' },
      { name: 'Rino', phone: '0541 123456', beachName: 'x'.repeat(81), locale: 'it' },
      { name: 'Rino', phone: '0541 123456', locale: 'de' },
      { name: 'Rino', phone: '0541 123456' },
    ];
    for (const body of refused) {
      const result = await call('POST', '/v1/callback-requests', body);
      expect(result.status).toBe(400);
      expect(errorCode(result)).toBe('invalid_request');
    }
    expect(await listed(adminToken)).toHaveLength(2);
  });

  it('shows the list only to the platform administrator, the most recent first', async () => {
    expect((await call('GET', '/v1/platform/callback-requests')).status).toBe(401);
    const refused = await call('GET', '/v1/platform/callback-requests', undefined, guestToken);
    expect(refused.status).toBe(403);
    expect(errorCode(refused)).toBe('forbidden');

    const requests = await listed(adminToken);
    expect(requests.map((request) => request.name)).toEqual(['Mara Duna', 'Rino Scogli']);
    expect(requests[0]).toMatchObject({ phone: '333 1234567', beachName: null, locale: 'en', status: 'new', calledAt: null });
    expect(requests[1]).toMatchObject({ phone: '+39 0541 123456', beachName: 'Bagno Scoglio', locale: 'it', status: 'new', calledAt: null });
    expect(new Date(requests[0]!.createdAt).getTime()).toBeGreaterThanOrEqual(new Date(requests[1]!.createdAt).getTime());
  });

  it('marks a request «called» only for the administrator, and marking again changes nothing', async () => {
    const [request] = await listed(adminToken);
    const path = `/v1/platform/callback-requests/${request!.requestId}/called`;

    expect((await call('POST', path)).status).toBe(401);
    expect((await call('POST', path, undefined, guestToken)).status).toBe(403);

    expect((await call('POST', path, undefined, adminToken)).status).toBe(204);
    const [marked] = (await listed(adminToken)).filter((entry) => entry.requestId === request!.requestId);
    expect(marked).toMatchObject({ status: 'called' });
    expect(marked!.calledAt).not.toBeNull();

    expect((await call('POST', path, undefined, adminToken)).status).toBe(204);
    const [again] = (await listed(adminToken)).filter((entry) => entry.requestId === request!.requestId);
    expect(again!.calledAt).toBe(marked!.calledAt);

    const missing = await call('POST', `/v1/platform/callback-requests/${randomUUID()}/called`, undefined, adminToken);
    expect(missing.status).toBe(404);
    expect((await call('POST', '/v1/platform/callback-requests/non-uuid/called', undefined, adminToken)).status).toBe(400);
  });

  it('stops the sixth request in a minute from one address and leaves other addresses alone', async () => {
    const limited = createApp({ db: database.app.db, holdSeconds: 600, signingSecret, log: () => undefined });
    const attempt = (address: string) =>
      limited.request('/v1/callback-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': address },
        body: JSON.stringify({ name: 'Furia', phone: '0541 123456', locale: 'it' }),
      });
    for (let request = 1; request <= 5; request += 1) expect((await attempt('203.0.113.7')).status).toBe(201);
    const stopped = await attempt('203.0.113.7');
    expect(stopped.status).toBe(429);
    expect(Number(stopped.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(await stopped.json()).toEqual({ error: { code: 'rate_limited', message: 'Too many requests. Try again shortly' } });
    expect((await attempt('203.0.113.8')).status).toBe(201);
  });
});
