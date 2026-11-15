import { randomBytes } from 'node:crypto';
import { copyFile, mkdtemp, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../src/index';
import { testAdminUrl } from '../src/testing';

// Acceptance criterion 0: the canvas migrations leave an existing beach club
// exactly as it was sold. A database is built up to migration 010, filled like a
// season in progress, then migrated to the end: no spot without col or type_id,
// prices and states untouched, columns filled in code order.

const migrationsDir = path.join(import.meta.dirname, '../migrations');

describe.skipIf(!testAdminUrl)('migrations 011-013 on existing data', () => {
  const name = `ombre_canvas_${randomBytes(6).toString('hex')}`;
  let server: pg.Client;
  let admin: pg.Client;
  let beachId: string;
  let before: { code: string; state: string; price_cents: number; shared: boolean }[];

  beforeAll(async () => {
    server = new pg.Client({ connectionString: testAdminUrl });
    await server.connect();
    await server.query(`CREATE DATABASE ${name}`);
    const url = new URL(testAdminUrl!);
    url.pathname = `/${name}`;

    // Only the migrations that existed before this work.
    const partial = await mkdtemp(path.join(os.tmpdir(), 'ombre-partial-'));
    for (const file of (await readdir(migrationsDir)).filter((entry) => entry.endsWith('.sql') && entry < '011').sort()) {
      await copyFile(path.join(migrationsDir, file), path.join(partial, file));
    }
    await server.query('SELECT pg_advisory_lock(7302541)');
    try {
      await runMigrations(url.href, partial);
    } finally {
      await server.query('SELECT pg_advisory_unlock(7302541)');
    }

    admin = new pg.Client({ connectionString: url.href });
    await admin.connect();

    // A season in progress: rows inserted out of code order, uneven prices, a sold
    // day, a blocked one and a season contract.
    const beach = await admin.query<{ id: string }>("INSERT INTO beach (slug, name, locality, status) VALUES ('prima', 'Bagno Prima', 'Test', 'active') RETURNING id");
    beachId = beach.rows[0]!.id;
    const insertSpot = (code: string, row: number, zone = 'ombrelloni') =>
      admin.query<{ id: string }>('INSERT INTO spot (beach_id, code, row_number, zone) VALUES ($1, $2, $3, $4) RETURNING id', [beachId, code, row, zone]);
    const a03 = (await insertSpot('A03', 1)).rows[0]!.id;
    const a01 = (await insertSpot('A01', 1)).rows[0]!.id;
    const a02 = (await insertSpot('A02', 1)).rows[0]!.id;
    const b01 = (await insertSpot('B01', 2)).rows[0]!.id;
    const r01 = (await insertSpot('R01', 1, 'riva')).rows[0]!.id;
    const publish = (spotId: string, day: string, price: number, state = 'available') =>
      admin.query('INSERT INTO inventory_day (beach_id, spot_id, day, state, price_cents) VALUES ($1, $2, $3, $4, $5)', [beachId, spotId, day, state, price]);
    await publish(a01, '2027-07-01', 4500);
    await publish(a02, '2027-07-01', 4700, 'occupied');
    await publish(a03, '2027-07-01', 4900, 'blocked');
    await publish(b01, '2027-07-02', 3100);
    await publish(r01, '2027-07-02', 1500);
    const holder = await admin.query<{ id: string }>(
      "INSERT INTO app_user (email, name, password_hash) VALUES ('prima@example.org', 'Prova', crypt('x', gen_salt('bf', 6))) RETURNING id",
    );
    await admin.query("INSERT INTO season_contract (beach_id, holder_user_id, spot_id, valid_from, valid_to) VALUES ($1, $2, $3, '2027-05-01', '2027-09-30')", [beachId, holder.rows[0]!.id, b01]);
    before = (
      await admin.query<{ code: string; state: string; price_cents: number; shared: boolean }>(
        'SELECT s.code, d.state::text, d.price_cents, d.shared FROM inventory_day d JOIN spot s ON s.id = d.spot_id ORDER BY s.code, d.day',
      )
    ).rows;

    // The migrations under test.
    await server.query('SELECT pg_advisory_lock(7302541)');
    try {
      await runMigrations(url.href, migrationsDir);
    } finally {
      await server.query('SELECT pg_advisory_unlock(7302541)');
    }
  }, 120_000);

  afterAll(async () => {
    await admin?.end();
    await server?.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await server?.end();
  });

  it('leaves no spot without col or type_id, and fills columns in code order', async () => {
    const spots = await admin.query<{ code: string; col: number; type_name: string }>(
      'SELECT s.code, s.col, t.name AS type_name FROM spot s JOIN spot_type t ON t.id = s.type_id ORDER BY s.zone, s.row_number, s.col',
    );
    expect(spots.rows).toEqual([
      { code: 'A01', col: 1, type_name: 'Ombrellone' },
      { code: 'A02', col: 2, type_name: 'Ombrellone' },
      { code: 'A03', col: 3, type_name: 'Ombrellone' },
      { code: 'B01', col: 1, type_name: 'Ombrellone' },
      { code: 'R01', col: 1, type_name: 'Lettino singolo' },
    ]);
  });

  it('keeps every published day exactly as it was: states, prices, contracts', async () => {
    const after = (
      await admin.query<{ code: string; state: string; price_cents: number; shared: boolean }>(
        'SELECT s.code, d.state::text, d.price_cents, d.shared FROM inventory_day d JOIN spot s ON s.id = d.spot_id ORDER BY s.code, d.day',
      )
    ).rows;
    expect(after).toEqual(before);
    const contracts = await admin.query("SELECT status FROM season_contract WHERE beach_id = $1", [beachId]);
    expect(contracts.rows).toEqual([{ status: 'active' }]);
  });

  it('gives every existing and future beach club the three base types', async () => {
    const builtin = await admin.query<{ name: string }>('SELECT name FROM spot_type WHERE beach_id = $1 AND builtin ORDER BY name', [beachId]);
    expect(builtin.rows.map((row) => row.name)).toEqual(['Gazebo', 'Lettino singolo', 'Ombrellone']);
    const fresh = await admin.query<{ id: string }>("INSERT INTO beach (slug, name, locality) VALUES ('dopo', 'Bagno Dopo', 'Test') RETURNING id");
    const types = await admin.query<{ n: string }>('SELECT count(*) AS n FROM spot_type WHERE beach_id = $1 AND builtin', [fresh.rows[0]!.id]);
    expect(Number(types.rows[0]!.n)).toBe(3);
  });

  it('appends a new spot to its row and hands it the type of its zone', async () => {
    const created = await admin.query<{ col: number }>(
      "INSERT INTO spot (beach_id, code, row_number) VALUES ($1, 'A09', 1) RETURNING col",
      [beachId],
    );
    expect(created.rows[0]!.col).toBe(4);
    const typed = await admin.query<{ name: string }>(
      "SELECT t.name FROM spot s JOIN spot_type t ON t.id = s.type_id WHERE s.code = 'A09'",
    );
    expect(typed.rows[0]!.name).toBe('Ombrellone');
    // The cell is now taken: the unique constraint refuses a second spot on it.
    await expect(admin.query("INSERT INTO spot (beach_id, code, row_number, col) VALUES ($1, 'A10', 1, 4)", [beachId])).rejects.toMatchObject({ code: '23505' });
  });
});
