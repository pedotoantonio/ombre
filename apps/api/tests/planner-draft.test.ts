import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { demoAccounts, demoBeach, seedDemo, upsertUser } from '@ombre/db';
import { createTestDatabase, testAdminUrl, type TestDatabase } from '@ombre/db/testing';
import { createApp } from '../src/app';

const password = 'password-di-prova-123';

interface DraftBody {
  ops: { op: { op: string }; description: { action: string }; stale: boolean }[];
  updatedBy: string | null;
  updatedAt: string | null;
  preview: { spots: { spotId: string; code: string; zone: string; rowNumber: number; col: number; maintenance: boolean; draftOnly: boolean }[]; elements: unknown[] };
}

describe.skipIf(!testAdminUrl)('the planner draft routes (contract 127–131, D57)', () => {
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

  const manage = `/v1/manage/beaches/${demoBeach.slug}`;
  const manager = () => tokens.manager!;
  const draft = async () => (await (await send('GET', `${manage}/layout/draft`, undefined, manager())).json()) as DraftBody;

  it('keeps the draft behind layout.edit: reception and accounting are refused on every route', async () => {
    for (const token of [tokens.reception!, tokens.accounting!]) {
      expect((await send('GET', `${manage}/layout/draft`, undefined, token)).status).toBe(403);
      expect((await send('POST', `${manage}/layout/draft/ops`, { op: 'delete_spot', spotId: 'draft-0' }, token)).status).toBe(403);
      for (const gesture of ['undo', 'discard', 'apply']) {
        expect((await send('POST', `${manage}/layout/draft/${gesture}`, undefined, token)).status).toBe(403);
      }
    }
    expect((await send('GET', `${manage}/layout/draft`)).status).toBe(401);
  });

  it('accumulates ops with their descriptions, previews them, undoes and applies over HTTP', async () => {
    // Empty draft: the preview is the saved beach (A01-A04, B01-B04), maintenance exposed.
    const empty = await draft();
    expect(empty.ops).toEqual([]);
    expect(empty.preview.spots).toHaveLength(8);
    expect(empty.preview.spots[0]).toMatchObject({ code: 'A01', maintenance: false, draftOnly: false });

    // A malformed op is a 400 before the domain; an evident collision is its dedicated 409.
    expect((await send('POST', `${manage}/layout/draft/ops`, { op: 'create_spot', zone: 'riva' }, manager())).status).toBe(400);
    expect((await send('POST', `${manage}/layout/draft/ops`, { op: 'tipo_nuovo' }, manager())).status).toBe(400);
    const collision = await send('POST', `${manage}/layout/draft/ops`, { op: 'create_spot', zone: 'ombrelloni', row: 1, col: 1, code: 'X01' }, manager());
    expect(collision.status).toBe(409);
    expect(((await collision.json()) as { error: { code: string } }).error.code).toBe('draft_cell_taken');

    const appended = await send('POST', `${manage}/layout/draft/ops`, { op: 'create_spot', zone: 'riva', row: 1, col: 1, code: 'R01' }, manager());
    expect(appended.status).toBe(201);
    expect(await appended.json()).toMatchObject({ index: 0, description: { action: 'create_spot', code: 'R01' } });
    expect((await send('POST', `${manage}/layout/draft/ops`, { op: 'edit_spot', spotId: 'draft-0', patch: { maintenance: true } }, manager())).status).toBe(201);

    const pending = await draft();
    expect(pending.ops.map((entry) => entry.description.action)).toEqual(['create_spot', 'edit_spot']);
    expect(pending.preview.spots.find((place) => place.code === 'R01')).toMatchObject({ zone: 'riva', maintenance: true, draftOnly: true });

    // «Annulla l'ultima operazione», then «Salva la spiaggia»: one transaction, the draft empties.
    const undone = await send('POST', `${manage}/layout/draft/undo`, undefined, manager());
    expect(undone.status).toBe(200);
    expect(await undone.json()).toMatchObject({ removed: { op: 'edit_spot' }, remaining: 1 });
    const applied = await send('POST', `${manage}/layout/draft/apply`, undefined, manager());
    expect(applied.status).toBe(200);
    expect(await applied.json()).toEqual({ applied: { create_spot: 1 }, total: 1 });
    expect((await draft()).ops).toEqual([]);
    const layout = (await (await send('GET', `${manage}/layout`, undefined, manager())).json()) as { spots: { code: string; zone: string; maintenance: boolean }[] };
    expect(layout.spots.find((place) => place.code === 'R01')).toMatchObject({ zone: 'riva', maintenance: false });
    // An empty draft has nothing to undo or apply.
    expect((await send('POST', `${manage}/layout/draft/undo`, undefined, manager())).status).toBe(409);
    expect((await send('POST', `${manage}/layout/draft/apply`, undefined, manager())).status).toBe(409);
  });

  it('answers a failed apply with the op at fault and applies nothing', async () => {
    expect((await send('POST', `${manage}/layout/draft/ops`, { op: 'create_spot', zone: 'monte', row: 1, col: 1, code: 'M01' }, manager())).status).toBe(201);
    expect((await send('POST', `${manage}/layout/draft/ops`, { op: 'create_spot', zone: 'monte', row: 1, col: 2, code: 'M02' }, manager())).status).toBe(201);
    // The beach changes under the draft: the second cell gets taken for real.
    expect((await send('POST', `${manage}/layout/spots`, { zone: 'monte', code: 'MX2', rowNumber: 1, col: 2 }, manager())).status).toBe(201);

    const refused = await send('POST', `${manage}/layout/draft/apply`, undefined, manager());
    expect(refused.status).toBe(409);
    expect(((await refused.json()) as { error: object }).error).toMatchObject({ code: 'draft_apply_failed', failedIndex: 1, reason: 'draft_cell_taken' });
    // NOTHING landed, the draft is intact; «Scarta la bozza» empties it.
    const layout = (await (await send('GET', `${manage}/layout`, undefined, manager())).json()) as { spots: { code: string }[] };
    expect(layout.spots.map((place) => place.code)).not.toContain('M01');
    expect((await draft()).ops).toHaveLength(2);
    const discarded = await send('POST', `${manage}/layout/draft/discard`, undefined, manager());
    expect(discarded.status).toBe(200);
    expect(await discarded.json()).toEqual({ discarded: 2 });
    expect((await draft()).ops).toEqual([]);
  });
});
