import { eq, sql } from 'drizzle-orm';
import { withActor, type Database, type Transaction } from './client';
import { DomainError } from './inventory';
import type { Actor } from './manage';
import { auditEvent, beach } from './schema';

// The manager's payment settings (D52) and cancellation terms (D53). Both live
// on the beach row; the GRANTs of migration 022 limit the writes to these columns.

export type PaymentMode = 'full' | 'deposit';

export interface PaymentSettings {
  mode: PaymentMode;
  /** Whole percent, 10–90; it only matters with `deposit`. */
  depositPercent: number;
}

/** Sets «caparra adesso, saldo al lido» (D52) for the beach club. */
export function setPaymentSettings(db: Database, actor: Actor, input: PaymentSettings): Promise<PaymentSettings> {
  if (!Number.isInteger(input.depositPercent) || input.depositPercent < 10 || input.depositPercent > 90) {
    throw new RangeError('the deposit percent must be a whole number between 10 and 90');
  }
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    await tx.update(beach).set({ paymentMode: input.mode, depositPercent: input.depositPercent }).where(eq(beach.id, actor.beachId));
    await tx.insert(auditEvent).values({ beachId: actor.beachId, actorUserId: actor.userId, action: 'beach.payment_settings', target: null, detail: { mode: input.mode, depositPercent: input.depositPercent } });
    return { mode: input.mode, depositPercent: input.depositPercent };
  });
}

export interface CancellationPolicy {
  /** Hours before midnight of the arrival day, in the beach club's zone (0–336). */
  deadlineHours: number;
  /** Texts of the beach club; null means the platform default of the dictionaries. */
  policyIt: string | null;
  policyEn: string | null;
}

/** Sets the cancellation terms (D53) for the beach club. */
export function setCancellationPolicy(db: Database, actor: Actor, input: CancellationPolicy): Promise<CancellationPolicy> {
  if (!Number.isInteger(input.deadlineHours) || input.deadlineHours < 0 || input.deadlineHours > 336) {
    throw new RangeError('the cancellation deadline must be a whole number of hours between 0 and 336');
  }
  for (const text of [input.policyIt, input.policyEn]) {
    if (text !== null && (text.trim().length === 0 || text.length > 600)) {
      throw new RangeError('a cancellation policy text must have 1 to 600 characters');
    }
  }
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    await tx
      .update(beach)
      .set({ cancelDeadlineHours: input.deadlineHours, cancelPolicyIt: input.policyIt, cancelPolicyEn: input.policyEn })
      .where(eq(beach.id, actor.beachId));
    await tx.insert(auditEvent).values({ beachId: actor.beachId, actorUserId: actor.userId, action: 'beach.cancellation_policy', target: null, detail: { deadlineHours: input.deadlineHours } });
    return input;
  });
}

/** What the public answers expose about the cancellation terms (D53). */
export interface CancellationView {
  deadlineHours: number;
  /** ISO instant: midnight of the arrival day minus the hours, in the club's zone. Null without an arrival day. */
  deadline: string | null;
  policyIt: string | null;
  policyEn: string | null;
}

/**
 * The cancellation deadline per arrival day: midnight of that day in the beach
 * club's time zone, minus the configured hours. One query for many days, so the
 * cart computes it per item without a round trip each.
 */
export async function cancellationDeadlines(tx: Transaction, beachId: string, days: string[]): Promise<Map<string, string>> {
  const deadlines = new Map<string, string>();
  const distinct = [...new Set(days)];
  if (distinct.length === 0) return deadlines;
  const rows = await tx.execute<{ day: string; epoch: number }>(sql`
    select d::text as day,
      extract(epoch from ((d::timestamp at time zone b.timezone) - make_interval(hours => b.cancel_deadline_hours)))::double precision as epoch
    from unnest(${sql.param(distinct)}::date[]) as d, beach b
    where b.id = ${beachId}
  `);
  for (const row of rows.rows) deadlines.set(row.day, new Date(Number(row.epoch) * 1000).toISOString());
  return deadlines;
}

/** The cancellation block of one answer: terms of the club plus the deadline of one arrival day, if any. */
export function cancellationView(db: Database, beachId: string, arrivalDay: string | null): Promise<CancellationView> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.beach_id', ${beachId}, true)`);
    const [club] = await tx
      .select({ deadlineHours: beach.cancelDeadlineHours, policyIt: beach.cancelPolicyIt, policyEn: beach.cancelPolicyEn })
      .from(beach)
      .where(eq(beach.id, beachId));
    if (!club) throw new DomainError('not_found', 'Beach club not found');
    const deadline = arrivalDay ? ((await cancellationDeadlines(tx, beachId, [arrivalDay])).get(arrivalDay) ?? null) : null;
    return { deadlineHours: club.deadlineHours, deadline, policyIt: club.policyIt, policyEn: club.policyEn };
  });
}
