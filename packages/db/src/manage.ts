import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { assertCents, can, canTransition, type Action, type MembershipRole } from '@ombre/shared';
import { withActor, type Database, type Transaction } from './client';
import { DomainError, zoneOrder, type SpotZone } from './inventory';
import { auditEvent, beach, hold, inventoryDay, membership, spot } from './schema';

export interface Actor {
  userId: string;
  beachId: string;
  role: MembershipRole;
}

/** Finds the beach club by slug among those the person belongs to and checks the permission. */
export async function authorize(db: Database, userId: string, beachSlug: string, action: Action): Promise<Actor> {
  const rows = await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return tx
      .select({ beachId: beach.id, role: membership.role })
      .from(membership)
      .innerJoin(beach, eq(beach.id, membership.beachId))
      .where(and(eq(membership.userId, userId), eq(beach.slug, beachSlug)));
  });
  const found = rows[0];
  if (!found || !can(found.role, action)) throw new DomainError('forbidden', 'You are not allowed to do this');
  return { userId, beachId: found.beachId, role: found.role };
}

async function audit(tx: Transaction, actor: Actor, action: string, target: string, detail: Record<string, unknown>): Promise<void> {
  await tx.insert(auditEvent).values({ beachId: actor.beachId, actorUserId: actor.userId, action, target, detail });
}

export interface InventoryRow {
  spotId: string;
  code: string;
  zone: SpotZone;
  rowNumber: number;
  /** `unpublished` when the day has never been offered for this spot. */
  state: 'unpublished' | (typeof inventoryDay.$inferSelect)['state'];
  priceCents: number | null;
  shared: boolean;
}

export function listInventory(db: Database, actor: Actor, day: string): Promise<InventoryRow[]> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const rows = await tx
      .select({
        spotId: spot.id,
        code: spot.code,
        zone: spot.zone,
        rowNumber: spot.rowNumber,
        state: inventoryDay.state,
        expired: sql<boolean>`coalesce(${hold.expiresAt} <= now(), false)`,
        priceCents: inventoryDay.priceCents,
        shared: inventoryDay.shared,
      })
      .from(spot)
      .leftJoin(inventoryDay, and(eq(inventoryDay.spotId, spot.id), eq(inventoryDay.day, day)))
      .leftJoin(hold, eq(hold.id, inventoryDay.activeHoldId))
      // A retired spot cannot be sold: it is managed from the layout page instead.
      .where(eq(spot.retired, false))
      .orderBy(zoneOrder, asc(spot.rowNumber), asc(spot.code));
    return rows.map((row) => ({
      spotId: row.spotId,
      code: row.code,
      zone: row.zone,
      rowNumber: row.rowNumber,
      state: row.state === null ? 'unpublished' : row.state === 'held' && row.expired ? 'available' : row.state,
      priceCents: row.priceCents,
      shared: row.shared ?? false,
    }));
  });
}

/** Offers a day for sale. Days already held, occupied or blocked are left as they are. */
export function publishDay(db: Database, actor: Actor, input: { day: string; priceCents: number; spotIds?: string[] }): Promise<{ published: number }> {
  assertCents(input.priceCents, 'price');
  if (input.priceCents < 0) throw new RangeError('price must not be negative');
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const spots = await tx
      .select({ id: spot.id, retired: spot.retired })
      .from(spot)
      .where(input.spotIds ? inArray(spot.id, input.spotIds) : undefined)
      .orderBy(asc(spot.id));
    if (input.spotIds && spots.length !== new Set(input.spotIds).size) throw new DomainError('not_found', 'Spot not found');
    // A retired spot enters no new published day; its history stays as it is.
    const sellable = spots.filter((entry) => !entry.retired);
    if (sellable.length === 0) return { published: 0 };

    const written = await tx
      .insert(inventoryDay)
      .values(sellable.map((entry) => ({ beachId: actor.beachId, spotId: entry.id, day: input.day, state: 'available' as const, priceCents: input.priceCents })))
      .onConflictDoUpdate({
        target: [inventoryDay.beachId, inventoryDay.spotId, inventoryDay.day],
        set: { state: 'available', priceCents: input.priceCents, updatedAt: sql`now()` },
        setWhere: eq(inventoryDay.state, 'unpublishable'),
      })
      .returning({ id: inventoryDay.id });
    await audit(tx, actor, 'inventory.publish', input.day, { priceCents: input.priceCents, spots: written.length });
    return { published: written.length };
  });
}

async function lockDay(tx: Transaction, spotId: string, day: string) {
  const [row] = await tx
    .select()
    .from(inventoryDay)
    .where(and(eq(inventoryDay.spotId, spotId), eq(inventoryDay.day, day)))
    .for('update');
  if (!row) throw new DomainError('not_found', 'This day is not published for this spot');
  return row;
}

/** Operational block (maintenance, closure) and its removal. A held or sold day cannot be blocked. */
export function setBlocked(db: Database, actor: Actor, input: { spotId: string; day: string; blocked: boolean; reason?: string }): Promise<void> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const row = await lockDay(tx, input.spotId, input.day);
    const target = input.blocked ? 'blocked' : 'available';
    if (row.state === target) return;
    if (!input.blocked && row.state !== 'blocked') throw new DomainError('invalid_state', 'This day is not blocked');
    if (!canTransition('inventory', row.state, target)) {
      throw new DomainError('invalid_state', 'This day is held or sold: it cannot be blocked');
    }
    await tx.update(inventoryDay).set({ state: target, updatedAt: sql`now()` }).where(eq(inventoryDay.id, row.id));
    await audit(tx, actor, input.blocked ? 'inventory.block' : 'inventory.unblock', `${input.spotId}/${input.day}`, { reason: input.reason ?? null });
  });
}

/** New price for future buyers. Holds and bookings keep the price they were given. */
export function setPrice(db: Database, actor: Actor, input: { spotId: string; day: string; priceCents: number }): Promise<void> {
  assertCents(input.priceCents, 'price');
  if (input.priceCents < 0) throw new RangeError('price must not be negative');
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const row = await lockDay(tx, input.spotId, input.day);
    await tx.update(inventoryDay).set({ priceCents: input.priceCents, updatedAt: sql`now()` }).where(eq(inventoryDay.id, row.id));
    await audit(tx, actor, 'inventory.price', `${input.spotId}/${input.day}`, { from: row.priceCents, to: input.priceCents });
  });
}
