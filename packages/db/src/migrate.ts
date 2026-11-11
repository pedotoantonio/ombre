import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

/** Applies the SQL files of `directory` in name order, each once and in its own transaction. */
export async function runMigrations(adminUrl: string, directory: string): Promise<string[]> {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  const applied: string[] = [];
  try {
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migration (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const files = (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort();
    for (const file of files) {
      const done = await client.query('SELECT 1 FROM schema_migration WHERE name = $1', [file]);
      if (done.rowCount) continue;
      const body = await readFile(path.join(directory, file), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(body);
        await client.query('INSERT INTO schema_migration (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        applied.push(file);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.end();
  }
  return applied;
}

/** Lets the application role log in. The password never appears in a migration file. */
export async function setAppPassword(adminUrl: string, password: string): Promise<void> {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    const statement = await client.query<{ statement: string }>(
      "SELECT format('ALTER ROLE ombre_app LOGIN PASSWORD %L', $1::text) AS statement",
      [password],
    );
    await client.query(statement.rows[0]!.statement);
  } finally {
    await client.end();
  }
}
