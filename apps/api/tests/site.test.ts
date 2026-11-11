import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { upsertUser } from '@ombre/db';
import { createTestDatabase, insertBeach, testAdminUrl, type TestDatabase } from '@ombre/db/testing';
import { createApp } from '../src/app';

const password = 'password-di-prova-123';
const slug = 'scoglio';
const texts = (tagline: string) => ({
  tagline,
  description: 'Stabilimento a conduzione familiare, con spiaggia di sabbia fine.',
  services: ['Bar', 'Docce calde'],
  openingPeriod: 'Dal 15 maggio al 20 settembre',
  openingHours: 'Tutti i giorni 8:30-19:30',
  address: 'Lungomare 1, Lido di Prova',
  phone: '+39 0533 000000',
  accessibility: 'Passerella fino alla prima fila.',
});

describe.skipIf(!testAdminUrl)('beach club website: draft, publish, restore', () => {
  let database: TestDatabase;
  let app: ReturnType<typeof createApp>;
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    database = await createTestDatabase(testAdminUrl!);
    const beach = await insertBeach(database.admin, slug, { spots: 1, day: '2099-07-01' });
    const other = await insertBeach(database.admin, 'altro-scoglio', { spots: 1, day: '2099-07-01' });
    await upsertUser(database.adminUrl, { email: 'uno@scoglio.example', name: 'Uno', password }, [{ beachId: beach.beachId, role: 'manager' }]);
    await upsertUser(database.adminUrl, { email: 'due@scoglio.example', name: 'Due', password }, [{ beachId: beach.beachId, role: 'manager' }]);
    await upsertUser(database.adminUrl, { email: 'banco@scoglio.example', name: 'Banco', password }, [{ beachId: beach.beachId, role: 'reception' }]);
    await upsertUser(database.adminUrl, { email: 'fuori@altro.example', name: 'Fuori', password }, [{ beachId: other.beachId, role: 'manager' }]);
    app = createApp({ db: database.app.db, holdSeconds: 600, signingSecret: 'segreto-di-prova-lungo-almeno-32-caratteri', log: () => undefined });
    for (const name of ['uno@scoglio', 'due@scoglio', 'banco@scoglio', 'fuori@altro']) {
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
  const site = `/v1/manage/beaches/${slug}/site`;
  const draft = (expectedVersion: number | null, tagline: string, template = 'riviera', en: unknown = null) => ({ expectedVersion, template, content: { it: texts(tagline), en } });
  const publicSite = async () => (await call('GET', `/v1/beaches/${slug}`)).body.site as { template: string; content: { it: { tagline: string }; en: unknown } } | null;
  const code = (result: { body: Record<string, unknown> }) => (result.body.error as { code?: string } | undefined)?.code;

  it('keeps the draft away from visitors until it is published', async () => {
    expect(await publicSite()).toBeNull();
    const saved = await call('PUT', `${site}/draft`, draft(null, 'Prima bozza'), 'uno');
    expect(saved.body).toEqual({ version: 1, number: 1 });
    expect(await publicSite()).toBeNull();

    expect((await call('POST', `${site}/publish`, { expectedVersion: 1 }, 'uno')).body).toEqual({ number: 1 });
    expect((await publicSite())?.content.it.tagline).toBe('Prima bozza');

    expect((await call('PUT', `${site}/draft`, draft(null, 'Seconda bozza'), 'uno')).body).toEqual({ version: 1, number: 2 });
    expect((await publicSite())?.content.it.tagline).toBe('Prima bozza');
  });

  it('tells the second of two editors that the draft has changed, losing nothing', async () => {
    const first = await call('PUT', `${site}/draft`, draft(1, 'Modifica di Uno'), 'uno');
    expect(first.body).toEqual({ version: 2, number: 2 });
    const second = await call('PUT', `${site}/draft`, draft(1, 'Modifica di Due'), 'due');
    expect(second.status).toBe(409);
    expect(code(second)).toBe('version_conflict');

    const state = (await call('GET', site, undefined, 'due')).body as { draft: { version: number; content: { it: { tagline: string } } } };
    expect(state.draft).toMatchObject({ version: 2, content: { it: { tagline: 'Modifica di Uno' } } });
    expect(code(await call('POST', `${site}/publish`, { expectedVersion: 1 }, 'due'))).toBe('version_conflict');
  });

  it('changes template and adds English without losing the content', async () => {
    const saved = await call('PUT', `${site}/draft`, draft(2, 'Modifica di Uno', 'boutique', texts('Family-run beach club')), 'uno');
    expect(saved.body).toEqual({ version: 3, number: 2 });
    await call('POST', `${site}/publish`, { expectedVersion: 3 }, 'uno');
    const shown = await publicSite();
    expect(shown).toMatchObject({ template: 'boutique', content: { it: { tagline: 'Modifica di Uno', services: ['Bar', 'Docce calde'] }, en: { tagline: 'Family-run beach club' } } });
  });

  it('restores an old revision as a new draft and keeps the whole history', async () => {
    const before = (await call('GET', site, undefined, 'uno')).body as { history: { revisionId: string; number: number; status: string }[] };
    expect(before.history.map((row) => `${row.number}:${row.status}`)).toEqual(['2:published', '1:archived']);
    const firstRevision = before.history.find((row) => row.number === 1)!.revisionId;

    expect((await call('POST', `${site}/restore`, { revisionId: firstRevision }, 'uno')).body).toEqual({ version: 1, number: 3 });
    expect((await publicSite())?.content.it.tagline).toBe('Modifica di Uno');
    await call('POST', `${site}/publish`, { expectedVersion: 1 }, 'uno');
    expect(await publicSite()).toMatchObject({ template: 'riviera', content: { it: { tagline: 'Prima bozza' }, en: null } });

    const after = (await call('GET', site, undefined, 'uno')).body as { history: { number: number; status: string }[]; draft: unknown };
    expect(after.history.map((row) => `${row.number}:${row.status}`)).toEqual(['3:published', '2:archived', '1:archived']);
    expect(after.draft).toBeNull();
    const trail = await database.admin.query<{ action: string }>("SELECT action FROM audit_event WHERE action LIKE 'site.%' ORDER BY created_at");
    expect(trail.rows.map((row) => row.action)).toEqual(['site.publish', 'site.publish', 'site.restore', 'site.publish']);
  });

  it('refuses markup, oversized texts and anyone who is not a manager of this beach club', async () => {
    const bad = (change: Record<string, unknown>) => call('PUT', `${site}/draft`, { expectedVersion: null, template: 'riviera', content: { it: { ...texts('x'), ...change }, en: null } }, 'uno');
    expect((await bad({ description: 'Ciao <script>alert(1)</script>' })).status).toBe(400);
    expect((await bad({ tagline: 'a'.repeat(121) })).status).toBe(400);
    expect((await bad({ phone: 'chiamaci' })).status).toBe(400);
    expect((await bad({ description: '' })).status).toBe(400);
    expect((await call('PUT', `${site}/draft`, { ...draft(null, 'x'), template: 'gotico' }, 'uno')).status).toBe(400);

    expect((await call('PUT', `${site}/draft`, draft(null, 'x'), 'banco')).status).toBe(403);
    expect((await call('GET', site, undefined, 'banco')).status).toBe(200);
    expect((await call('PUT', `${site}/draft`, draft(null, 'x'), 'fuori')).status).toBe(403);
    expect((await call('GET', site)).status).toBe(401);
  });
});
