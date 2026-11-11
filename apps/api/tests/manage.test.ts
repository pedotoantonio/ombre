import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { demoAccounts, demoBeach, seedDemo, upsertUser } from '@ombre/db';
import { createTestDatabase, insertBeach, testAdminUrl, type TestDatabase } from '@ombre/db/testing';
import { createApp } from '../src/app';

const password = 'password-di-prova-123';
const day = '2027-07-01';

describe.skipIf(!testAdminUrl)('sign-in, roles and inventory management', () => {
  let database: TestDatabase;
  let app: ReturnType<typeof createApp>;
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    database = await createTestDatabase(testAdminUrl!);
    const { beachId } = await seedDemo(database.adminUrl);
    for (const account of demoAccounts) {
      await upsertUser(database.adminUrl, { email: account.email, name: account.name, password }, [{ beachId, role: account.role }]);
    }
    const other = await insertBeach(database.admin, 'altro', { spots: 1, day });
    await upsertUser(database.adminUrl, { email: 'gestore@altro.example', name: 'Altro gestore', password }, [{ beachId: other.beachId, role: 'manager' }]);
    await upsertUser(database.adminUrl, { email: 'bloccato@altro.example', name: 'Da bloccare', password });
    app = createApp({ db: database.app.db, holdSeconds: 600, signingSecret: 'segreto-di-prova-lungo-almeno-32-caratteri', log: () => undefined });

    for (const email of [...demoAccounts.map((account) => account.email), 'gestore@altro.example']) {
      const response = await send('POST', '/v1/auth/login', { email, password });
      tokens[email.split('@')[0] + '@' + email.split('@')[1]!.split('.')[0]] = ((await response.json()) as { token: string }).token;
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
  const manage = `/v1/manage/beaches/${demoBeach.slug}/inventory`;
  const manager = () => tokens['gestore@bagnodelledune']!;
  const reception = () => tokens['reception@bagnodelledune']!;
  const accounting = () => tokens['contabilita@bagnodelledune']!;
  const stranger = () => tokens['gestore@altro']!;
  const inventory = async (token: string, onDay = day) =>
    ((await (await send('GET', `${manage}?day=${onDay}`, undefined, token)).json()) as { spots: { spotId: string; code: string; state: string; priceCents: number | null }[] }).spots;

  it('signs in with the right password only and never says which part was wrong', async () => {
    const wrong = await send('POST', '/v1/auth/login', { email: demoAccounts[0].email, password: 'sbagliata-sbagliata' });
    const unknown = await send('POST', '/v1/auth/login', { email: 'nessuno@bagnodelledune.example', password });
    expect(wrong.status).toBe(401);
    expect(await wrong.json()).toEqual(await unknown.json());
    expect((await send('GET', '/v1/me')).status).toBe(401);
    expect((await send('GET', '/v1/me', undefined, 'token-inventato-abbastanza-lungo')).status).toBe(401);

    const me = (await (await send('GET', '/v1/me', undefined, manager())).json()) as { user: { email: string }; memberships: unknown[] };
    expect(me.user.email).toBe('gestore@bagnodelledune.example');
    expect(me.memberships).toEqual([{ beachSlug: demoBeach.slug, beachName: demoBeach.name, role: 'manager' }]);
    expect(JSON.stringify(me)).not.toMatch(/password|hash/i);
  });

  it('locks the account after five wrong passwords, even for the right one', async () => {
    const attempt = (secret: string) => send('POST', '/v1/auth/login', { email: 'bloccato@altro.example', password: secret });
    for (let index = 0; index < 5; index += 1) expect((await attempt('sbagliata-sbagliata')).status).toBe(401);
    const locked = await attempt(password);
    expect(locked.status).toBe(429);
    expect(((await locked.json()) as { error: { code: string } }).error.code).toBe('account_locked');
  });

  it('lets the manager publish a day, which then appears to the public', async () => {
    expect((await inventory(manager())).every((spot) => spot.state === 'unpublished')).toBe(true);
    const published = await send('POST', `${manage}/publish`, { day, priceCents: 3500 }, manager());
    expect(await published.json()).toEqual({ published: 8 });

    const again = await send('POST', `${manage}/publish`, { day, priceCents: 9900 }, manager());
    expect(await again.json()).toEqual({ published: 0 });
    const open = (await (await send('GET', `/v1/beaches/${demoBeach.slug}/availability?day=${day}`)).json()) as { spots: { priceCents: number }[] };
    expect(open.spots).toHaveLength(8);
    expect(open.spots.every((spot) => spot.priceCents === 3500)).toBe(true);
  });

  it('applies the role matrix: reception blocks but does not price, accounting does neither', async () => {
    const [first, second] = await inventory(manager());
    const block = { spotId: first!.spotId, day, blocked: true, reason: 'Manutenzione' };

    expect((await send('GET', `${manage}?day=${day}`, undefined, accounting())).status).toBe(403);
    expect((await send('POST', `${manage}/block`, block, accounting())).status).toBe(403);
    expect((await send('PUT', `${manage}/price`, { spotId: second!.spotId, day, priceCents: 1 }, reception())).status).toBe(403);
    expect((await send('POST', `${manage}/publish`, { day, priceCents: 1 }, reception())).status).toBe(403);

    expect((await send('POST', `${manage}/block`, block, reception())).status).toBe(204);
    expect((await send('PUT', `${manage}/price`, { spotId: second!.spotId, day, priceCents: 4200 }, manager())).status).toBe(204);

    const after = await inventory(reception());
    expect(after.find((spot) => spot.spotId === first!.spotId)?.state).toBe('blocked');
    expect(after.find((spot) => spot.spotId === second!.spotId)?.priceCents).toBe(4200);
    const open = (await (await send('GET', `/v1/beaches/${demoBeach.slug}/availability?day=${day}`)).json()) as { spots: { spotId: string }[] };
    expect(open.spots.map((spot) => spot.spotId)).not.toContain(first!.spotId);

    expect((await send('POST', `${manage}/block`, { ...block, blocked: false }, reception())).status).toBe(204);
  });

  it('refuses to block a held day and keeps a manager out of other beach clubs', async () => {
    const [, , third] = await inventory(manager());
    const held = await app.request('/v1/holds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'test-manage-hold-1' },
      body: JSON.stringify({ beachSlug: demoBeach.slug, spotId: third!.spotId, day }),
    });
    expect(held.status).toBe(201);
    const blocked = await send('POST', `${manage}/block`, { spotId: third!.spotId, day, blocked: true }, manager());
    expect(blocked.status).toBe(409);
    expect(((await blocked.json()) as { error: { code: string } }).error.code).toBe('invalid_state');

    expect((await send('GET', `${manage}?day=${day}`, undefined, stranger())).status).toBe(403);
    expect((await send('POST', `${manage}/publish`, { day, priceCents: 1 }, stranger())).status).toBe(403);
    expect((await send('GET', `${manage}?day=${day}`)).status).toBe(401);
  });

  it('records who did what, and ends a session at sign-out or when the membership is removed', async () => {
    const trail = await database.admin.query<{ action: string; email: string }>(
      'SELECT a.action, u.email FROM audit_event a JOIN app_user u ON u.id = a.actor_user_id ORDER BY a.created_at',
    );
    expect(trail.rows.map((row) => `${row.email.split('@')[0]}:${row.action}`)).toEqual([
      'gestore:inventory.publish',
      'gestore:inventory.publish',
      'reception:inventory.block',
      'gestore:inventory.price',
      'reception:inventory.unblock',
    ]);

    await database.admin.query("DELETE FROM membership WHERE user_id = (SELECT id FROM app_user WHERE email = 'reception@bagnodelledune.example')");
    expect((await send('GET', `${manage}?day=${day}`, undefined, reception())).status).toBe(403);

    expect((await send('POST', '/v1/auth/logout', undefined, manager())).status).toBe(204);
    expect((await send('GET', '/v1/me', undefined, manager())).status).toBe(401);
  });
});
