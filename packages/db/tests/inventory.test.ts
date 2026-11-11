import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acquireHold, DomainError, listActiveBeaches, listAvailability, quoteSpot, releaseHold, withBeach } from '../src/index';
import { createTestDatabase, insertBeach, testAdminUrl, type TestBeach, type TestDatabase } from '../src/testing';

const day = '2027-06-17';
const key = () => `test-${randomUUID()}`;

async function codeOf(work: Promise<unknown>): Promise<string> {
  try {
    await work;
    return 'no error';
  } catch (error) {
    return error instanceof DomainError ? error.code : `unexpected: ${String(error)}`;
  }
}

describe.skipIf(!testAdminUrl)('inventory on a real PostgreSQL', () => {
  let database: TestDatabase;
  let dune: TestBeach;
  let other: TestBeach;

  beforeAll(async () => {
    database = await createTestDatabase(testAdminUrl!);
    dune = await insertBeach(database.admin, 'dune', { spots: 6, day });
    other = await insertBeach(database.admin, 'altro', { spots: 2, day });
    await database.admin.query("INSERT INTO promotion (beach_id, code, percent_bps) VALUES ($1, 'MARE10', 1000)", [dune.beachId]);
    await database.admin.query("INSERT INTO promotion (beach_id, code, percent_bps, max_uses) VALUES ($1, 'ULTIMO', 1000, 1)", [dune.beachId]);
  });

  afterAll(async () => {
    await database?.drop();
  });

  const db = () => database.app.db;
  const stateOf = async (spotId: string) => {
    const result = await database.admin.query<{ state: string }>('SELECT state FROM inventory_day WHERE spot_id = $1', [spotId]);
    return result.rows[0]?.state;
  };

  it('lets only one of twelve simultaneous buyers take the same day', async () => {
    const spotId = dune.spotIds[0]!;
    const attempts = await Promise.allSettled(
      Array.from({ length: 12 }, () => acquireHold(db(), dune.beachId, { spotId, day, idempotencyKey: key(), ttlSeconds: 600 })),
    );
    const won = attempts.filter((attempt) => attempt.status === 'fulfilled');
    const lost = attempts.filter((attempt) => attempt.status === 'rejected');
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(11);
    for (const attempt of lost) expect((attempt.reason as DomainError).code).toBe('inventory_conflict');

    const holds = await database.admin.query(
      "SELECT 1 FROM hold h JOIN inventory_day d ON d.id = h.inventory_day_id WHERE d.spot_id = $1 AND h.status = 'active'",
      [spotId],
    );
    expect(holds.rowCount).toBe(1);
    expect(await stateOf(spotId)).toBe('held');
  });

  it('applies MARE10 on the server: 30.00 becomes 27.00 and is saved in the hold', async () => {
    const spotId = dune.spotIds[1]!;
    expect(await quoteSpot(db(), dune.beachId, { spotId, day, promoCode: 'mare10' })).toEqual({
      listPrice: 3000,
      discount: 300,
      total: 2700,
      promoCode: 'MARE10',
    });
    const held = await acquireHold(db(), dune.beachId, { spotId, day, promoCode: 'MARE10', idempotencyKey: key(), ttlSeconds: 600 });
    expect(held.quote.total).toBe(2700);
    expect(held.replayed).toBe(false);

    await database.admin.query('UPDATE inventory_day SET price_cents = 9900 WHERE spot_id = $1', [spotId]);
    const saved = await database.admin.query<{ total_cents: number }>('SELECT total_cents FROM hold WHERE id = $1', [held.holdId]);
    expect(saved.rows[0]?.total_cents).toBe(2700);
  });

  it('returns the same hold for the same key and refuses the key for a different request', async () => {
    const spotId = dune.spotIds[2]!;
    const idempotencyKey = key();
    const first = await acquireHold(db(), dune.beachId, { spotId, day, idempotencyKey, ttlSeconds: 600 });
    const again = await acquireHold(db(), dune.beachId, { spotId, day, idempotencyKey, ttlSeconds: 600 });
    expect(again.holdId).toBe(first.holdId);
    expect(again.replayed).toBe(true);

    const different = acquireHold(db(), dune.beachId, { spotId: dune.spotIds[3]!, day, idempotencyKey, ttlSeconds: 600 });
    expect(await codeOf(different)).toBe('idempotency_mismatch');
    expect(await stateOf(dune.spotIds[3]!)).toBe('available');
  });

  it('treats a run out hold as free even if no job has cleaned it, and releases on request', async () => {
    const spotId = dune.spotIds[3]!;
    const lapsed = await acquireHold(db(), dune.beachId, { spotId, day, idempotencyKey: key(), ttlSeconds: 0 });
    expect((await listAvailability(db(), dune.beachId, day)).map((spot) => spot.spotId)).toContain(spotId);

    const next = await acquireHold(db(), dune.beachId, { spotId, day, idempotencyKey: key(), ttlSeconds: 600 });
    expect(next.holdId).not.toBe(lapsed.holdId);
    const old = await database.admin.query<{ status: string }>('SELECT status FROM hold WHERE id = $1', [lapsed.holdId]);
    expect(old.rows[0]?.status).toBe('expired');
    expect((await listAvailability(db(), dune.beachId, day)).map((spot) => spot.spotId)).not.toContain(spotId);

    expect(await releaseHold(db(), dune.beachId, next.holdId)).toBe(true);
    expect(await releaseHold(db(), dune.beachId, next.holdId)).toBe(false);
    expect(await stateOf(spotId)).toBe('available');
  });

  it('never exceeds the cap of a promotion when the last use is contested', async () => {
    const [first, second] = [dune.spotIds[4]!, dune.spotIds[5]!];
    const attempts = await Promise.allSettled(
      [first, second].map((spotId) => acquireHold(db(), dune.beachId, { spotId, day, promoCode: 'ULTIMO', idempotencyKey: key(), ttlSeconds: 600 })),
    );
    expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1);
    const refused = attempts.find((attempt) => attempt.status === 'rejected') as PromiseRejectedResult;
    expect((refused.reason as DomainError).code).toBe('promo_not_applicable');

    const uses = await database.admin.query<{ committed_uses: number }>("SELECT committed_uses FROM promotion WHERE code = 'ULTIMO'");
    expect(uses.rows[0]?.committed_uses).toBe(1);
    const states = [await stateOf(first), await stateOf(second)].sort();
    expect(states).toEqual(['available', 'held']);

    const winner = attempts.find((attempt) => attempt.status === 'fulfilled') as PromiseFulfilledResult<{ holdId: string }>;
    await releaseHold(db(), dune.beachId, winner.value.holdId);
    const after = await database.admin.query<{ committed_uses: number }>("SELECT committed_uses FROM promotion WHERE code = 'ULTIMO'");
    expect(after.rows[0]?.committed_uses).toBe(0);
  });

  it('refuses unknown spots and promotions of another beach club', async () => {
    expect(await codeOf(acquireHold(db(), dune.beachId, { spotId: randomUUID(), day, idempotencyKey: key(), ttlSeconds: 600 }))).toBe('not_found');
    expect(await codeOf(acquireHold(db(), dune.beachId, { spotId: other.spotIds[0]!, day, idempotencyKey: key(), ttlSeconds: 600 }))).toBe('not_found');
    expect(await codeOf(quoteSpot(db(), other.beachId, { spotId: other.spotIds[0]!, day, promoCode: 'MARE10' }))).toBe('promo_not_applicable');
  });

  it('isolates beach clubs at the database level, whatever the query asks', async () => {
    const count = (beachId: string | null) => {
      const read = async (tx: Parameters<Parameters<typeof withBeach>[2]>[0]) => {
        const result = await tx.execute<{ n: number }>(sql`select count(*)::int as n from inventory_day`);
        return result.rows[0]!.n;
      };
      return beachId ? withBeach(db(), beachId, read) : db().transaction(read);
    };
    expect(await count(dune.beachId)).toBe(6);
    expect(await count(other.beachId)).toBe(2);
    expect(await count(null)).toBe(0);

    const crossWrite = withBeach(db(), dune.beachId, (tx) =>
      tx.execute(sql`update inventory_day set price_cents = 1 where beach_id = ${other.beachId}`),
    );
    expect((await crossWrite).rowCount).toBe(0);
    const untouched = await database.admin.query('SELECT 1 FROM inventory_day WHERE price_cents = 1');
    expect(untouched.rowCount).toBe(0);

    await expect(db().execute(sql`insert into beach (slug, name, locality) values ('abuso', 'x', 'y')`)).rejects.toThrow();
    await expect(db().execute(sql`delete from hold`)).rejects.toThrow();
  });

  it('shows only active beach clubs to the public and keeps one inventory row per spot and day', async () => {
    await database.admin.query("INSERT INTO beach (slug, name, locality, status) VALUES ('bozza', 'Bozza', 'Test', 'draft')");
    expect((await listActiveBeaches(db())).map((beach) => beach.slug)).toEqual(['altro', 'dune']);

    const duplicate = database.admin.query(
      "INSERT INTO inventory_day (beach_id, spot_id, day, state, price_cents) VALUES ($1, $2, $3, 'available', 3000)",
      [dune.beachId, dune.spotIds[0], day],
    );
    await expect(duplicate).rejects.toThrow(/inventory_day_beach_id_spot_id_day_key/);
  });
});
