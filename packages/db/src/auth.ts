import { createHash, randomBytes } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import pg from 'pg';
import type { MembershipRole } from '@ombre/shared';
import { withUser, type Database } from './client';
import { DomainError } from './inventory';
import { beach, membership } from './schema';

/** Session tokens are stored only as hashes; account.ts signs in the same way. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface LoginResult {
  /** Shown once to the client. Only its hash is stored. */
  token: string;
  expiresAt: Date;
  userId: string;
}

export async function login(db: Database, email: string, password: string, ttlSeconds: number, code?: string): Promise<LoginResult> {
  const token = randomBytes(32).toString('base64url');
  const result = await db.execute<{ o_outcome: string; o_user_id: string | null; o_expires_at: Date | string | null }>(
    sql`select * from auth_login(${email}, ${password}, ${code ?? null}, ${hashToken(token)}, ${ttlSeconds})`,
  );
  const row = result.rows[0];
  if (row?.o_outcome === 'locked') throw new DomainError('account_locked', 'Too many attempts. Try again later');
  if (row?.o_outcome === 'totp_required') throw new DomainError('totp_required', 'The verification code is required');
  if (row?.o_outcome !== 'ok' || !row.o_user_id || !row.o_expires_at) {
    throw new DomainError('invalid_credentials', 'Email or password not valid');
  }
  return { token, expiresAt: new Date(row.o_expires_at), userId: row.o_user_id };
}

export interface SessionUser {
  userId: string;
  email: string;
  name: string;
  platformRole: 'none' | 'admin';
  twoFactor: boolean;
  /** True until the generated password is changed (D44): the API gates the area on it. */
  mustChangePassword: boolean;
}

export async function resolveSession(db: Database, token: string): Promise<SessionUser | null> {
  const result = await db.execute<{
    o_user_id: string;
    o_email: string;
    o_name: string;
    o_platform_role: 'none' | 'admin';
    o_totp_enabled: boolean;
    o_must_change_password: boolean;
  }>(sql`select * from auth_session(${hashToken(token)})`);
  const row = result.rows[0];
  return row
    ? {
        userId: row.o_user_id,
        email: row.o_email,
        name: row.o_name,
        platformRole: row.o_platform_role,
        twoFactor: row.o_totp_enabled,
        mustChangePassword: row.o_must_change_password,
      }
    : null;
}

/** Starts two-step setup. Returns the secret to load into an authenticator app, or null if already active. */
export async function beginTwoFactor(db: Database, token: string): Promise<Uint8Array | null> {
  const result = await db.execute<{ secret: Buffer | null }>(sql`select auth_totp_begin(${hashToken(token)}) as secret`);
  const secret = result.rows[0]?.secret;
  return secret ? new Uint8Array(secret) : null;
}

export async function confirmTwoFactor(db: Database, token: string, code: string): Promise<boolean> {
  const result = await db.execute<{ ok: boolean }>(sql`select auth_totp_confirm(${hashToken(token)}, ${code}) as ok`);
  return result.rows[0]?.ok === true;
}

/** Owner-side: switches two-step verification off for a person who lost their device. */
export async function resetTwoFactor(adminUrl: string, email: string): Promise<void> {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query('UPDATE app_user SET totp_enabled = false, totp_secret = NULL, totp_last_step = NULL WHERE email = lower($1)', [email]);
  } finally {
    await client.end();
  }
}

export async function logout(db: Database, token: string): Promise<void> {
  await db.execute(sql`select auth_logout(${hashToken(token)})`);
}

export interface MembershipView {
  beachId: string;
  beachSlug: string;
  beachName: string;
  role: MembershipRole;
}

/** Read on every request, so a removed membership stops working at once. */
export function listMemberships(db: Database, userId: string): Promise<MembershipView[]> {
  return withUser(db, userId, (tx) =>
    tx
      .select({ beachId: beach.id, beachSlug: beach.slug, beachName: beach.name, role: membership.role })
      .from(membership)
      .innerJoin(beach, eq(beach.id, membership.beachId))
      .where(eq(membership.userId, userId)),
  );
}

export interface NewUser {
  email: string;
  name: string;
  password: string;
  platformRole?: 'none' | 'admin';
}

/** Owner-side operation, used by the command line and by seeds: not reachable from the API. */
export async function upsertUser(adminUrl: string, user: NewUser, memberships: { beachId: string; role: MembershipRole }[] = []): Promise<string> {
  if (user.password.length < 12) throw new RangeError('password must be at least 12 characters long');
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    const created = await client.query<{ id: string }>(
      `INSERT INTO app_user (email, name, password_hash, platform_role)
       VALUES (lower($1), $2, crypt($3, gen_salt('bf', 12)), $4)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash, platform_role = EXCLUDED.platform_role
       RETURNING id`,
      [user.email, user.name, user.password, user.platformRole ?? 'none'],
    );
    const userId = created.rows[0]!.id;
    for (const entry of memberships) {
      await client.query(
        `INSERT INTO membership (user_id, beach_id, role) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, beach_id) DO UPDATE SET role = EXCLUDED.role`,
        [userId, entry.beachId, entry.role],
      );
    }
    return userId;
  } finally {
    await client.end();
  }
}
