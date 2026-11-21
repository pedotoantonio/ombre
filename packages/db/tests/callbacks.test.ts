import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCallbackRequest, DomainError, listCallbackRequests, markCallbackRequestCalled, withBeach } from '../src/index';
import { createTestDatabase, insertBeach, testAdminUrl, type TestDatabase } from '../src/testing';

const day = '2099-08-01';

describe.skipIf(!testAdminUrl)('callback requests on a real PostgreSQL (D71)', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createTestDatabase(testAdminUrl!);
  });

  afterAll(async () => {
    await database?.drop();
  });

  const db = () => database.app.db;

  it('records a request and lists the most recent first, new and whole', async () => {
    const first = await createCallbackRequest(db(), { name: 'Rino Scogli', phone: '+39 0541 123456', beachName: 'Bagno Scoglio', locale: 'it' });
    const second = await createCallbackRequest(db(), { name: 'Mara Duna', phone: '333 1234567', locale: 'en' });

    const requests = await listCallbackRequests(db());
    expect(requests.map((request) => request.requestId)).toEqual([second.requestId, first.requestId]);
    expect(requests[0]).toMatchObject({ name: 'Mara Duna', phone: '333 1234567', beachName: null, locale: 'en', status: 'new', calledAt: null });
    expect(requests[1]).toMatchObject({ name: 'Rino Scogli', phone: '+39 0541 123456', beachName: 'Bagno Scoglio', locale: 'it', status: 'new', calledAt: null });
    expect(requests[1]!.createdAt.getTime()).toBeLessThanOrEqual(requests[0]!.createdAt.getTime());
  });

  it('marks a request «called» once: marking again changes nothing', async () => {
    const { requestId } = await createCallbackRequest(db(), { name: 'Tea Riva', phone: '0541/90.01.02', locale: 'it' });

    await markCallbackRequestCalled(db(), requestId);
    const [marked] = (await listCallbackRequests(db())).filter((request) => request.requestId === requestId);
    expect(marked).toMatchObject({ status: 'called' });
    expect(marked!.calledAt).toBeInstanceOf(Date);

    await markCallbackRequestCalled(db(), requestId);
    const [again] = (await listCallbackRequests(db())).filter((request) => request.requestId === requestId);
    expect(again!.calledAt!.getTime()).toBe(marked!.calledAt!.getTime());

    await expect(markCallbackRequestCalled(db(), '00000000-0000-0000-0000-000000000000')).rejects.toThrow(DomainError);
  });

  it('refuses what the table forbids: empty name, short phone, unknown locale', async () => {
    await expect(createCallbackRequest(db(), { name: '', phone: '0541 123456', locale: 'it' })).rejects.toThrow();
    await expect(createCallbackRequest(db(), { name: 'Rino', phone: '12345', locale: 'it' })).rejects.toThrow();
    await expect(createCallbackRequest(db(), { name: 'Rino', phone: '0541 123456', locale: 'de' as 'it' })).rejects.toThrow();
  });

  it('keeps the platform rows out of every beach context', async () => {
    const { beachId } = await insertBeach(database.admin, 'contesto', { spots: 1, day });
    const hidden = await withBeach(db(), beachId, async (tx) => (await tx.execute(sql`select id from callback_request`)).rows);
    expect(hidden).toEqual([]);
    // The write is refused by the policy (drizzle wraps the PostgreSQL error).
    await expect(
      withBeach(db(), beachId, (tx) => tx.execute(sql`insert into callback_request (name, phone, locale) values ('Intruso', '0541 123456', 'it')`)),
    ).rejects.toThrow();
  });

  it('answers the reserved list with at most 200 requests, the most recent ones', async () => {
    // Older rows in bulk, each a second further in the past.
    await database.admin.query(
      "INSERT INTO callback_request (name, phone, locale, created_at) SELECT 'Vecchio ' || n, '0541 123456', 'it', now() - make_interval(secs => 60 + n) FROM generate_series(1, 210) n",
    );
    const requests = await listCallbackRequests(db());
    expect(requests).toHaveLength(200);
    const names = requests.map((request) => request.name);
    expect(names).toContain('Mara Duna');
    expect(names).toContain('Vecchio 1');
    expect(names).not.toContain('Vecchio 210');
  });
});
