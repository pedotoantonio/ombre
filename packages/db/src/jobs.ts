import { and, eq, sql } from 'drizzle-orm';
import { withBeach, type Database, type Transaction } from './client';
import { closeDay } from './ledger';
import { beach, booking, hold, inventoryDay, notification, outbox, promotion, spot } from './schema';

export type OutboxKind = 'booking.confirmed' | 'booking.cancelled' | 'refund.due';

/** Adds work to the queue inside the transaction that makes it necessary. */
export async function enqueue(tx: Transaction, beachId: string, kind: OutboxKind, payload: Record<string, string>): Promise<void> {
  await tx.insert(outbox).values({ beachId, kind, payload });
}

/** Gives back the days whose hold has run out. Days being bought right now are skipped. */
export function releaseExpiredHolds(db: Database, beachId: string): Promise<number> {
  return withBeach(db, beachId, async (tx) => {
    const stale = await tx
      .select({ dayId: inventoryDay.id, holdId: hold.id, promotionId: hold.promotionId })
      .from(inventoryDay)
      .innerJoin(hold, eq(hold.id, inventoryDay.activeHoldId))
      .where(and(eq(inventoryDay.state, 'held'), eq(hold.status, 'active'), sql`${hold.expiresAt} <= now()`))
      .for('update', { of: inventoryDay, skipLocked: true });
    for (const row of stale) {
      await tx.update(hold).set({ status: 'expired' }).where(eq(hold.id, row.holdId));
      if (row.promotionId) {
        await tx.update(promotion).set({ committedUses: sql`${promotion.committedUses} - 1` }).where(eq(promotion.id, row.promotionId));
      }
      await tx.update(inventoryDay).set({ state: 'available', activeHoldId: null, updatedAt: sql`now()` }).where(eq(inventoryDay.id, row.dayId));
    }
    return stale.length;
  });
}

/** One round of housekeeping across all beach clubs. */
export async function runMaintenance(db: Database): Promise<{ holdsReleased: number; daysClosed: number }> {
  let holdsReleased = 0;
  const beaches = await db.execute<{ beach_id: string }>(sql`select worker_beaches_with_expired_holds() as beach_id`);
  for (const row of beaches.rows) holdsReleased += await releaseExpiredHolds(db, row.beach_id);

  let daysClosed = 0;
  const days = await db.execute<{ o_beach_id: string; o_day: string }>(sql`select o_beach_id, o_day::text from worker_days_to_close()`);
  for (const row of days.rows) {
    const closed = await closeDay(db, row.o_beach_id, row.o_day);
    if (closed.completed > 0) daysClosed += 1;
  }
  return { holdsReleased, daysClosed };
}

export interface OutboxItem {
  id: string;
  beachId: string;
  kind: string;
  payload: Record<string, string>;
  attempts: number;
}

export type OutboxHandler = (item: OutboxItem) => Promise<void>;

/**
 * Takes a batch of queued work and runs it. Each row is taken by one worker only; a
 * failure leaves the row in the queue for a later attempt.
 */
export async function processOutbox(db: Database, handle: OutboxHandler, limit = 20): Promise<{ done: number; failed: number }> {
  const claimed = await db.execute<{ o_id: string; o_beach_id: string; o_kind: string; o_payload: Record<string, string>; o_attempts: number }>(
    sql`select * from worker_claim_outbox(${limit})`,
  );
  let done = 0;
  let failed = 0;
  for (const row of claimed.rows) {
    const item: OutboxItem = { id: String(row.o_id), beachId: row.o_beach_id, kind: row.o_kind, payload: row.o_payload, attempts: row.o_attempts };
    try {
      await handle(item);
      await db.execute(sql`select worker_finish_outbox(${item.id}::bigint, null)`);
      done += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db.execute(sql`select worker_finish_outbox(${item.id}::bigint, ${message.slice(0, 500)})`);
      failed += 1;
    }
  }
  return { done, failed };
}

export interface BookingMailData {
  bookingId: string;
  code: string;
  locale: 'it' | 'en';
  guestName: string;
  guestEmail: string;
  totalCents: number;
  day: string;
  spotCode: string;
  beachSlug: string;
  beachName: string;
}

export function bookingMailData(db: Database, beachId: string, bookingId: string): Promise<BookingMailData | null> {
  return withBeach(db, beachId, async (tx) => {
    const [row] = await tx
      .select({ bookingId: booking.id, code: booking.code, locale: sql<'it' | 'en'>`${booking.locale}`, guestName: booking.guestName, guestEmail: booking.guestEmail, totalCents: booking.totalCents, day: inventoryDay.day, spotCode: spot.code, beachSlug: beach.slug, beachName: beach.name })
      .from(booking)
      .innerJoin(inventoryDay, eq(inventoryDay.id, booking.inventoryDayId))
      .innerJoin(spot, eq(spot.id, inventoryDay.spotId))
      .innerJoin(beach, eq(beach.id, booking.beachId))
      .where(eq(booking.id, bookingId));
    return row ?? null;
  });
}

export function recordNotification(db: Database, beachId: string, entry: { bookingId: string; template: string; locale: string; recipient: string; status: 'sent' | 'skipped'; provider: string }): Promise<void> {
  return withBeach(db, beachId, async (tx) => {
    await tx.insert(notification).values({ beachId, ...entry });
  });
}
