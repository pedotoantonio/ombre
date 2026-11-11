import { randomBytes } from 'node:crypto';
import path from 'node:path';
import pg from 'pg';
import { connect, type Connection } from './client';
import { runMigrations, setAppPassword } from './migrate';

export const testAdminUrl = process.env.OMBRE_TEST_DB_ADMIN_URL;

export interface TestDatabase {
  adminUrl: string;
  app: Connection;
  admin: pg.Client;
  drop: () => Promise<void>;
}

/** A fresh, migrated database on the test server, reached as the restricted application role. */
export async function createTestDatabase(serverAdminUrl: string): Promise<TestDatabase> {
  const name = `ombre_test_${randomBytes(6).toString('hex')}`;
  const server = new pg.Client({ connectionString: serverAdminUrl });
  await server.connect();
  await server.query(`CREATE DATABASE ${name}`);
  await server.end();

  const adminUrl = new URL(serverAdminUrl);
  adminUrl.pathname = `/${name}`;
  await runMigrations(adminUrl.href, path.join(import.meta.dirname, '../migrations'));
  await setAppPassword(adminUrl.href, 'test_app_only');

  const appUrl = new URL(adminUrl.href);
  appUrl.username = 'ombre_app';
  appUrl.password = 'test_app_only';

  const admin = new pg.Client({ connectionString: adminUrl.href });
  await admin.connect();
  const app = connect(appUrl.href, { max: 8 });

  return {
    adminUrl: adminUrl.href,
    app,
    admin,
    drop: async () => {
      await app.close();
      await admin.end();
      const cleaner = new pg.Client({ connectionString: serverAdminUrl });
      await cleaner.connect();
      await cleaner.query(`DROP DATABASE ${name} WITH (FORCE)`);
      await cleaner.end();
    },
  };
}

export interface TestBeach {
  beachId: string;
  spotIds: string[];
}

export async function insertBeach(admin: pg.Client, slug: string, options: { spots?: number; priceCents?: number; day: string }): Promise<TestBeach> {
  const beach = await admin.query<{ id: string }>(
    "INSERT INTO beach (slug, name, locality, status) VALUES ($1, $2, 'Test', 'active') RETURNING id",
    [slug, `Bagno ${slug}`],
  );
  const beachId = beach.rows[0]!.id;
  const spotIds: string[] = [];
  for (let number = 1; number <= (options.spots ?? 3); number += 1) {
    const spot = await admin.query<{ id: string }>(
      'INSERT INTO spot (beach_id, code, row_number) VALUES ($1, $2, 1) RETURNING id',
      [beachId, `A0${number}`],
    );
    const spotId = spot.rows[0]!.id;
    spotIds.push(spotId);
    await admin.query(
      "INSERT INTO inventory_day (beach_id, spot_id, day, state, price_cents) VALUES ($1, $2, $3, 'available', $4)",
      [beachId, spotId, options.day, options.priceCents ?? 3000],
    );
  }
  return { beachId, spotIds };
}
