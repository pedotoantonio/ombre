import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { upsertUser } from '@ombre/db';
import { createTestDatabase, insertBeach, testAdminUrl, type TestDatabase } from '@ombre/db/testing';
import { createApp } from '../src/app';

const password = 'password-di-prova-123';
const slug = 'vongola';

describe.skipIf(!testAdminUrl)('spot type cards: public list and management (D61, D63)', () => {
  let database: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let umbrellaTypeId: string;
  let gazeboTypeId: string;
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    database = await createTestDatabase(testAdminUrl!);
    const beach = await insertBeach(database.admin, slug, { spots: 2, day: '2099-07-01' });
    const other = await insertBeach(database.admin, 'altra-vongola', { spots: 1, day: '2099-07-01' });
    await upsertUser(database.adminUrl, { email: 'uno@vongola.example', name: 'Uno', password }, [{ beachId: beach.beachId, role: 'manager' }]);
    await upsertUser(database.adminUrl, { email: 'banco@vongola.example', name: 'Banco', password }, [{ beachId: beach.beachId, role: 'reception' }]);
    await upsertUser(database.adminUrl, { email: 'fuori@altra.example', name: 'Fuori', password }, [{ beachId: other.beachId, role: 'manager' }]);
    const types = await database.admin.query<{ id: string; mark: string }>('SELECT id, mark FROM spot_type WHERE beach_id = $1', [beach.beachId]);
    umbrellaTypeId = types.rows.find((row) => row.mark === 'umbrella')!.id;
    gazeboTypeId = types.rows.find((row) => row.mark === 'gazebo')!.id;
    app = createApp({ db: database.app.db, rateLimiter: { hit: () => 0 }, holdSeconds: 600, signingSecret: 'segreto-di-prova-lungo-almeno-32-caratteri', log: () => undefined });
    for (const name of ['uno@vongola', 'banco@vongola', 'fuori@altra']) {
      tokens[name.split('@')[0]!] = ((await call('POST', '/v1/auth/login', { email: `${name}.example`, password })).body as { token: string }).token;
    }
  });

  afterAll(async () => {
    await database?.drop();
  });

  async function call(method: string, path: string, payload?: unknown, as?: string) {
    const response = await app.request(path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(as ? { Authorization: `Bearer ${tokens[as]}` } : {}) },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    const text = await response.text();
    return { status: response.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
  }
  const manage = `/v1/manage/beaches/${slug}/type-cards`;
  const code = (result: { body: Record<string, unknown> }) => (result.body.error as { code?: string } | undefined)?.code;
  const publicTypes = async () => (await call('GET', `/v1/beaches/${slug}/spot-types`)).body.types as { typeId: string; name: string; content: unknown; customized: boolean }[];

  it('shows the public the used types with content null until the club writes a card', async () => {
    const types = await publicTypes();
    // Only the umbrella type has spots: the declared choice shows the used types alone.
    expect(types.map((type) => type.name)).toEqual(['Ombrellone']);
    expect(types[0]).toMatchObject({ typeId: umbrellaTypeId, content: null, customized: false });
  });

  it('saves, replaces and resets a card from the management routes, with audit', async () => {
    const content = {
      title: 'Ombrellone Vongola',
      descriptionIt: 'Ombrellone a due passi dal bagnasciuga.',
      photos: [{ id: 'riva', captionIt: 'La riva' }],
      equipmentNote: { it: 'Un ombrellone e due lettini.', en: 'One umbrella and two sunbeds.' },
    };
    const saved = await call('PUT', `${manage}/${umbrellaTypeId}`, { content }, 'uno');
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ typeId: umbrellaTypeId, content: { title: 'Ombrellone Vongola' } });

    expect((await publicTypes())[0]).toMatchObject({ customized: true, content: { title: 'Ombrellone Vongola' } });

    const mine = (await call('GET', manage, undefined, 'uno')).body.types as { typeId: string; customized: boolean; spots: number; updatedAt: string | null }[];
    expect(mine).toHaveLength(3);
    expect(mine.find((type) => type.typeId === umbrellaTypeId)).toMatchObject({ customized: true, spots: 2 });
    expect(mine.find((type) => type.typeId === gazeboTypeId)).toMatchObject({ customized: false, spots: 0, updatedAt: null });

    expect((await call('DELETE', `${manage}/${umbrellaTypeId}`, undefined, 'uno')).status).toBe(204);
    expect((await publicTypes())[0]).toMatchObject({ content: null, customized: false });

    const trail = await database.admin.query<{ action: string }>("SELECT action FROM audit_event WHERE action LIKE 'type_card.%' ORDER BY created_at");
    expect(trail.rows.map((row) => row.action)).toEqual(['type_card.saved', 'type_card.reset']);
  });

  it('refuses bad content with 400, pictures outside the library with 409 and unknown types with 404', async () => {
    const put = (content: unknown) => call('PUT', `${manage}/${umbrellaTypeId}`, { content }, 'uno');
    expect((await put({ photos: Array.from({ length: 7 }, () => ({ id: 'riva' })) })).status).toBe(400);
    expect((await put({ titolo: 'campo ignoto' })).status).toBe(400);
    expect((await put({})).status).toBe(400);
    expect((await put({ title: 'Ciao <b>mare</b>' })).status).toBe(400);
    const outside = await put({ photos: [{ id: 'non-in-libreria' }] });
    expect(outside.status).toBe(409);
    expect(code(outside)).toBe('invalid_state');
    expect((await call('PUT', `${manage}/00000000-0000-4000-8000-000000000000`, { content: { title: 'x' } }, 'uno')).status).toBe(404);
  });

  it('asks for the site permission: 401 without a session, 403 for reception and other clubs', async () => {
    expect((await call('GET', manage)).status).toBe(401);
    expect((await call('PUT', `${manage}/${umbrellaTypeId}`, { content: { title: 'x' } })).status).toBe(401);
    expect((await call('GET', manage, undefined, 'banco')).status).toBe(403);
    expect((await call('PUT', `${manage}/${umbrellaTypeId}`, { content: { title: 'x' } }, 'banco')).status).toBe(403);
    expect((await call('DELETE', `${manage}/${umbrellaTypeId}`, undefined, 'banco')).status).toBe(403);
    expect((await call('PUT', `${manage}/${umbrellaTypeId}`, { content: { title: 'x' } }, 'fuori')).status).toBe(403);
  });

  it('answers 404 for a beach club that is not active', async () => {
    await database.admin.query("UPDATE beach SET status = 'suspended' WHERE slug = 'altra-vongola'");
    expect((await call('GET', '/v1/beaches/altra-vongola/spot-types')).status).toBe(404);
    expect((await call('GET', '/v1/beaches/non-esiste/spot-types')).status).toBe(404);
  });
});
