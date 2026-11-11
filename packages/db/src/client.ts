import { sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface Connection {
  db: Database;
  pool: pg.Pool;
  close: () => Promise<void>;
}

export function connect(url: string, options: { max?: number } = {}): Connection {
  const pool = new pg.Pool({ connectionString: url, max: options.max ?? 10 });
  return { db: drizzle(pool, { schema }), pool, close: () => pool.end() };
}

/**
 * Runs `work` in a transaction bound to one beach club. Row level security hides every
 * other beach club, so a query that forgets its filter still cannot cross the boundary.
 */
export function withBeach<T>(db: Database, beachId: string, work: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.beach_id', ${beachId}, true)`);
    return work(tx);
  });
}

/** Like `withBeach`, and also records who is acting, for memberships and the audit trail. */
export function withActor<T>(db: Database, beachId: string, userId: string, work: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.beach_id', ${beachId}, true), set_config('app.user_id', ${userId}, true)`);
    return work(tx);
  });
}

/** A transaction for a signed-in person outside any beach club, for example to list their memberships. */
export function withUser<T>(db: Database, userId: string, work: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return work(tx);
  });
}
