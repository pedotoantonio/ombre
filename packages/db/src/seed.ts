import pg from 'pg';

export const demoBeach = {
  slug: 'bagno-delle-dune',
  name: 'Bagno delle Dune',
  locality: 'Lido di Pomposa',
  day: '2027-06-17',
  priceCents: 3000,
  promoCode: 'MARE10',
} as const;

/**
 * Fictional beach club used across the project documents: spots A01-A04 and B01-B04
 * on 17 June 2027 at 30.00 euro, with the MARE10 promotion. Marked as demo data.
 */
export async function seedDemo(adminUrl: string): Promise<{ beachId: string }> {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query('BEGIN');
    const beach = await client.query<{ id: string }>(
      `INSERT INTO beach (slug, name, locality, status, demo) VALUES ($1, $2, $3, 'active', true)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [demoBeach.slug, demoBeach.name, demoBeach.locality],
    );
    const beachId = beach.rows[0]!.id;
    for (const [rowIndex, letter] of ['A', 'B'].entries()) {
      for (let number = 1; number <= 4; number += 1) {
        const code = `${letter}0${number}`;
        const spot = await client.query<{ id: string }>(
          `INSERT INTO spot (beach_id, code, row_number) VALUES ($1, $2, $3)
           ON CONFLICT (beach_id, code) DO UPDATE SET row_number = EXCLUDED.row_number RETURNING id`,
          [beachId, code, rowIndex + 1],
        );
        await client.query(
          `INSERT INTO inventory_day (beach_id, spot_id, day, state, price_cents, shared)
           VALUES ($1, $2, $3, 'available', $4, $5) ON CONFLICT (beach_id, spot_id, day) DO NOTHING`,
          [beachId, spot.rows[0]!.id, demoBeach.day, demoBeach.priceCents, letter === 'B'],
        );
      }
    }
    await client.query(
      `INSERT INTO promotion (beach_id, code, percent_bps) VALUES ($1, $2, 1000)
       ON CONFLICT (beach_id, code) DO NOTHING`,
      [beachId, demoBeach.promoCode],
    );
    await client.query('COMMIT');
    return { beachId };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}
