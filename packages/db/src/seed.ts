import pg from 'pg';

export const demoBeach = {
  slug: 'bagno-delle-dune',
  name: 'Bagno delle Dune',
  locality: 'Lido di Pomposa',
  day: '2027-06-17',
  priceCents: 3000,
  promoCode: 'MARE10',
} as const;

export const demoHolderEmail = 'stagionale@bagnodelledune.example';

export const demoAccounts = [
  { email: 'gestore@bagnodelledune.example', name: 'Gestore dimostrativo', role: 'manager' },
  { email: 'reception@bagnodelledune.example', name: 'Reception dimostrativa', role: 'reception' },
  { email: 'contabilita@bagnodelledune.example', name: 'Contabilità dimostrativa', role: 'accounting' },
] as const;

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
          [beachId, spot.rows[0]!.id, demoBeach.day, demoBeach.priceCents, false],
        );
      }
    }
    await client.query(
      `INSERT INTO promotion (beach_id, code, percent_bps) VALUES ($1, $2, 1000)
       ON CONFLICT (beach_id, code) DO NOTHING`,
      [beachId, demoBeach.promoCode],
    );
    // B02 is the shared spot of the project example: a season pass, an approved day.
    const holder = await client.query<{ id: string }>(
      `INSERT INTO app_user (email, name, password_hash) VALUES ($1, 'Stagionale dimostrativo', crypt(gen_random_uuid()::text, gen_salt('bf', 6)))
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [demoHolderEmail],
    );
    const shared = await client.query<{ id: string }>("SELECT id FROM spot WHERE beach_id = $1 AND code = 'B02'", [beachId]);
    const spotId = shared.rows[0]!.id;
    let contract = await client.query<{ id: string }>('SELECT id FROM season_contract WHERE spot_id = $1', [spotId]);
    if (contract.rowCount === 0) {
      contract = await client.query<{ id: string }>(
        "INSERT INTO season_contract (beach_id, holder_user_id, spot_id, valid_from, valid_to) VALUES ($1, $2, $3, '2027-05-01', '2027-09-30') RETURNING id",
        [beachId, holder.rows[0]!.id, spotId],
      );
    }
    const contractId = contract.rows[0]!.id;
    await client.query(
      `INSERT INTO availability_proposal (beach_id, contract_id, day, status, decided_at) VALUES ($1, $2, $3, 'approved', now())
       ON CONFLICT (contract_id, day) DO NOTHING`,
      [beachId, contractId, demoBeach.day],
    );
    await client.query(
      "UPDATE inventory_day SET shared = true, contract_id = $1 WHERE spot_id = $2 AND day = $3 AND contract_id IS NULL",
      [contractId, spotId, demoBeach.day],
    );
    await client.query('UPDATE beach SET shared_price_cents = $2 WHERE id = $1 AND shared_price_cents IS NULL', [beachId, demoBeach.priceCents]);
    // Illustrative percentages from the project documents: 50 / 40 / 10.
    await client.query(
      `INSERT INTO split_rule (beach_id, season_holder_bps, beach_club_bps, platform_bps)
       SELECT $1, 5000, 4000, 1000 WHERE NOT EXISTS (SELECT 1 FROM split_rule WHERE beach_id = $1)`,
      [beachId],
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
