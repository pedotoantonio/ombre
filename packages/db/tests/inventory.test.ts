import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acquireHold, DomainError, listActiveBeaches, listAvailability, listDayMap, quoteSpot, releaseHold, searchBeaches, withBeach } from '../src/index';
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

describe.skipIf(!testAdminUrl)('beach map and search on a real PostgreSQL', () => {
  let database: TestDatabase;
  let mappa: TestBeach;
  let piccolo: TestBeach;
  const pastDay = '2020-06-17';

  beforeAll(async () => {
    database = await createTestDatabase(testAdminUrl!);
    // A01 ordinary, A02 shared and cheaper, A03 for four guests and dearer, A04 blocked, A05 sold, A06 for the holds.
    mappa = await insertBeach(database.admin, 'mappa', { spots: 6, day });
    piccolo = await insertBeach(database.admin, 'piccolo', { spots: 2, day, priceCents: 2000 });
    const [, a02, a03, a04, a05] = mappa.spotIds;
    // A shared day always belongs to a season pass.
    const holder = await database.admin.query<{ id: string }>("INSERT INTO app_user (email, name, password_hash) VALUES ('stagionale@mappa.example', 'Stagionale', 'none') RETURNING id");
    const contract = await database.admin.query<{ id: string }>(
      "INSERT INTO season_contract (beach_id, holder_user_id, spot_id, valid_from, valid_to) VALUES ($1, $2, $3, '2027-05-01', '2027-09-30') RETURNING id",
      [mappa.beachId, holder.rows[0]!.id, a02],
    );
    await database.admin.query('UPDATE inventory_day SET shared = true, contract_id = $2, price_cents = 2500 WHERE spot_id = $1', [a02, contract.rows[0]!.id]);
    await database.admin.query('UPDATE spot SET max_guests = 4 WHERE id = $1', [a03]);
    await database.admin.query('UPDATE inventory_day SET price_cents = 4000 WHERE spot_id = $1', [a03]);
    await database.admin.query("UPDATE inventory_day SET state = 'blocked' WHERE spot_id = $1", [a04]);
    await database.admin.query("UPDATE inventory_day SET state = 'occupied' WHERE spot_id = $1", [a05]);
    // A07 has never been published; B01 has a row that is not on sale.
    await database.admin.query("INSERT INTO spot (beach_id, code, row_number) VALUES ($1, 'A07', 1)", [mappa.beachId]);
    const b01 = await database.admin.query<{ id: string }>("INSERT INTO spot (beach_id, code, row_number) VALUES ($1, 'B01', 2) RETURNING id", [mappa.beachId]);
    await database.admin.query("INSERT INTO inventory_day (beach_id, spot_id, day, state, price_cents) VALUES ($1, $2, $3, 'unpublishable', 3000)", [mappa.beachId, b01.rows[0]!.id, day]);
    for (const spotId of mappa.spotIds) {
      await database.admin.query("INSERT INTO inventory_day (beach_id, spot_id, day, state, price_cents) VALUES ($1, $2, $3, 'available', 3000)", [mappa.beachId, spotId, pastDay]);
    }
  });

  afterAll(async () => {
    await database?.drop();
  });

  const db = () => database.app.db;
  const statuses = async (onDay: string) => Object.fromEntries((await listDayMap(db(), mappa.beachId, onDay)).map((spot) => [spot.code, spot.status]));
  const offer = async (search: { day?: string; guests?: number; sharedOnly?: boolean; place?: string }, slug = 'mappa') => {
    const found = (await searchBeaches(db(), { day, ...search })).find((beach) => beach.slug === slug);
    return found ? { freeSpots: found.freeSpots, priceFromCents: found.priceFromCents } : null;
  };

  it('gives every spot one of three states, in row and code order, with a price only when it can be bought', async () => {
    const map = await listDayMap(db(), mappa.beachId, day);
    expect(map.map((spot) => [spot.code, spot.rowNumber, spot.status, spot.priceCents])).toEqual([
      ['A01', 1, 'free', 3000],
      ['A02', 1, 'shared', 2500],
      ['A03', 1, 'free', 4000],
      ['A04', 1, 'unavailable', null],
      ['A05', 1, 'unavailable', null],
      ['A06', 1, 'free', 3000],
      ['A07', 1, 'unavailable', null],
      ['B01', 2, 'unavailable', null],
    ]);
    expect(map.find((spot) => spot.code === 'A03')).toMatchObject({ umbrellas: 1, sunbeds: 2, maxGuests: 4 });
    // The free ones are exactly those the booking path offers.
    const free = map.filter((spot) => spot.status !== 'unavailable').map((spot) => spot.spotId);
    expect((await listAvailability(db(), mappa.beachId, day)).map((spot) => spot.spotId)).toEqual(free);
  });

  it('shows a held spot as unavailable, and as free again once the hold has run out', async () => {
    const spotId = mappa.spotIds[5]!;
    const held = await acquireHold(db(), mappa.beachId, { spotId, day, idempotencyKey: key(), ttlSeconds: 600 });
    expect((await statuses(day)).A06).toBe('unavailable');
    expect(await offer({})).toEqual({ freeSpots: 3, priceFromCents: 2500 });

    await database.admin.query("UPDATE hold SET expires_at = now() - interval '1 second' WHERE id = $1", [held.holdId]);
    expect((await statuses(day)).A06).toBe('free');
    expect(await offer({})).toEqual({ freeSpots: 4, priceFromCents: 2500 });
  });

  it('treats a day that has passed, or was never published, as fully unavailable', async () => {
    expect(new Set(Object.values(await statuses(pastDay)))).toEqual(new Set(['unavailable']));
    expect(new Set(Object.values(await statuses('2027-06-18')))).toEqual(new Set(['unavailable']));
    expect((await listDayMap(db(), mappa.beachId, pastDay)).every((spot) => spot.priceCents === null)).toBe(true);
    expect(await offer({ day: pastDay })).toEqual({ freeSpots: 0, priceFromCents: null });
    expect(await offer({ day: '2027-06-18' })).toEqual({ freeSpots: 0, priceFromCents: null });
  });

  it('counts only the spots that fit the guests, and only shared days when asked', async () => {
    expect(await offer({ guests: 2 })).toEqual({ freeSpots: 4, priceFromCents: 2500 });
    expect(await offer({ guests: 3 })).toEqual({ freeSpots: 1, priceFromCents: 4000 });
    expect(await offer({ guests: 5 })).toEqual({ freeSpots: 0, priceFromCents: null });
    expect(await offer({ sharedOnly: true })).toEqual({ freeSpots: 1, priceFromCents: 2500 });
    expect(await offer({ sharedOnly: true, guests: 3 })).toEqual({ freeSpots: 0, priceFromCents: null });
  });

  it('gives a "from" price that the server really quotes for a spot matching the search', async () => {
    for (const search of [{ guests: 1 }, { guests: 3 }, { sharedOnly: true }] as { guests?: number; sharedOnly?: boolean }[]) {
      const found = await offer(search);
      const map = await listDayMap(db(), mappa.beachId, day);
      const match = map.find(
        (spot) => spot.priceCents === found!.priceFromCents && spot.maxGuests >= (search.guests ?? 1) && (!search.sharedOnly || spot.status === 'shared'),
      );
      expect(match).toBeDefined();
      expect((await quoteSpot(db(), mappa.beachId, { spotId: match!.spotId, day })).total).toBe(found!.priceFromCents);
    }
  });

  it('reads each beach club inside its own boundary and filters by place without wildcards', async () => {
    expect(await offer({}, 'piccolo')).toEqual({ freeSpots: 2, priceFromCents: 2000 });
    expect((await listDayMap(db(), piccolo.beachId, day)).map((spot) => spot.code)).toEqual(['A01', 'A02']);

    const slugs = async (place: string) => (await searchBeaches(db(), { day, place })).map((beach) => beach.slug);
    expect(await slugs('bagno MAP')).toEqual(['mappa']);
    expect(await slugs('  test ')).toEqual(['mappa', 'piccolo']);
    expect(await slugs('Rimini')).toEqual([]);
    expect(await slugs('%')).toEqual([]);
    expect(await slugs('m_ppa')).toEqual([]);
    expect((await listActiveBeaches(db(), 'piccolo')).map((beach) => beach.slug)).toEqual(['piccolo']);
  });
});
