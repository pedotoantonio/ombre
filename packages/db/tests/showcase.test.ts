import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { holderStatement, listAvailability, seedDemo, seedShowcase, showcaseBeach } from '../src/index';
import { createTestDatabase, testAdminUrl, type TestDatabase } from '../src/testing';

const signingSecret = 'segreto-di-prova-lungo-almeno-32-caratteri';

describe.skipIf(!testAdminUrl)('showcase beach club', () => {
  let database: TestDatabase;
  let beachId: string;

  beforeAll(async () => {
    database = await createTestDatabase(testAdminUrl!);
    await seedDemo(database.adminUrl);
    const seeded = await seedShowcase(database.adminUrl, signingSecret);
    expect(seeded.created).toBe(true);
    beachId = seeded.beachId;
  }, 120_000);

  afterAll(async () => {
    await database?.drop();
  });

  const count = async (query: string, values: unknown[] = []) => Number((await database.admin.query<{ n: string }>(`SELECT count(*) AS n FROM ${query}`, values)).rows[0]!.n);

  it('is created once: a second run changes nothing', async () => {
    const before = await count('booking WHERE beach_id = $1', [beachId]);
    expect(await seedShowcase(database.adminUrl, signingSecret)).toEqual({ created: false, beachId });
    expect(await count('booking WHERE beach_id = $1', [beachId])).toBe(before);
    expect(await count('beach WHERE slug = $1', [showcaseBeach.slug])).toBe(1);
  });

  it('has forty spots in five rows, three weeks on sale and a spot under maintenance', async () => {
    expect(await count('spot WHERE beach_id = $1', [beachId])).toBe(40);
    expect(await count('inventory_day WHERE beach_id = $1', [beachId])).toBeGreaterThanOrEqual(40 * 21);
    expect(await count("inventory_day WHERE beach_id = $1 AND state = 'blocked'", [beachId])).toBe(2);
    const today = (await database.admin.query<{ day: string }>("SELECT (now() AT TIME ZONE 'Europe/Rome')::date::text AS day")).rows[0]!.day;
    const free = await listAvailability(database.app.db, beachId, today);
    expect(free.length).toBe(40 - 5 - 1);
    expect(free.find((spot) => spot.code === 'A03')?.priceCents).toBe(4500);
    expect(free.find((spot) => spot.code === 'E08')?.priceCents).toBe(2800);
  });

  it('holds bookings in every state, made through the product itself', async () => {
    const states = await database.admin.query<{ status: string; n: string }>('SELECT status, count(*) AS n FROM booking WHERE beach_id = $1 GROUP BY status', [beachId]);
    expect(Object.fromEntries(states.rows.map((row) => [row.status, Number(row.n)]))).toEqual({ confirmed: 10, completed: 5, cancelled: 1, under_review: 1 });
    const presence = await database.admin.query<{ presence: string; n: string }>("SELECT presence, count(*) AS n FROM booking WHERE beach_id = $1 AND status = 'confirmed' GROUP BY presence", [beachId]);
    expect(Object.fromEntries(presence.rows.map((row) => [row.presence, Number(row.n)]))).toEqual({ expected: 7, inside: 2, outside_reentry_allowed: 1 });
    expect(await count("booking WHERE beach_id = $1 AND source = 'desk'", [beachId])).toBe(1);
    expect(await count("refund WHERE beach_id = $1 AND status = 'requested'", [beachId])).toBe(1);

    const codes = await database.admin.query<{ code: string; day: string }>(
      'SELECT b.code, d.day::text FROM booking b JOIN inventory_day d ON d.id = b.inventory_day_id WHERE b.beach_id = $1',
      [beachId],
    );
    for (const row of codes.rows) expect(row.code.slice(3, 9)).toBe(row.day.slice(2).replaceAll('-', ''));
  });

  it('keeps the money trail balanced and the other beach club untouched', async () => {
    const unbalanced = await count(
      "(SELECT b.id FROM booking b JOIN allocation a ON a.booking_id = b.id WHERE b.beach_id = $1 AND b.status IN ('confirmed', 'completed') GROUP BY b.id, b.total_cents HAVING sum(a.amount_cents) <> b.total_cents) x",
      [beachId],
    );
    expect(unbalanced).toBe(0);
    expect(await count("allocation WHERE beach_id = $1 AND party = 'season_holder'", [beachId])).toBe(4);
    expect(await count("allocation WHERE beach_id = $1 AND state = 'accrued'", [beachId])).toBeGreaterThanOrEqual(11);
    const otherPromo = await database.admin.query<{ committed_uses: number }>(
      "SELECT p.committed_uses FROM promotion p JOIN beach b ON b.id = p.beach_id WHERE b.slug = 'bagno-delle-dune' AND p.code = 'MARE10'",
    );
    expect(otherPromo.rows[0]?.committed_uses).toBe(0);
  });

  it('leaves proposals for the manager to decide and shows a holder an accrued share', async () => {
    const proposals = await database.admin.query<{ status: string; n: string }>('SELECT status, count(*) AS n FROM availability_proposal WHERE beach_id = $1 GROUP BY status', [beachId]);
    expect(Object.fromEntries(proposals.rows.map((row) => [row.status, Number(row.n)]))).toEqual({ proposed: 4, approved: 10, rejected: 1 });

    const anna = await database.admin.query<{ user_id: string; contract_id: string }>(
      "SELECT c.holder_user_id AS user_id, c.id AS contract_id FROM season_contract c JOIN spot s ON s.id = c.spot_id WHERE c.beach_id = $1 AND s.code = 'B04'",
      [beachId],
    );
    const statement = await holderStatement(database.app.db, anna.rows[0]!.user_id, anna.rows[0]!.contract_id);
    expect(statement.filter((row) => row.sold)).toEqual([expect.objectContaining({ proposal: 'approved', sold: true, shareCents: 1600, shareState: 'accrued' })]);
  });

  it('publishes a website with texts in two languages and sample pictures', async () => {
    const site = await database.admin.query<{ content: { it: { images: { cover: { src: string; alt: string }; gallery: unknown[] } }; en: { tagline: string } } }>(
      "SELECT content FROM site_revision WHERE beach_id = $1 AND status = 'published'",
      [beachId],
    );
    const content = site.rows[0]!.content;
    expect(content.it.images.cover).toEqual({ src: '/demo/copertina.svg', alt: 'Veduta della spiaggia con file di ombrelloni e il mare' });
    expect(content.it.images.gallery).toHaveLength(6);
    expect(content.en.tagline).toMatch(/pine wood/);
  });
});
