import { and, asc, eq, sql } from 'drizzle-orm';
import { maxNamedZones, zoneNameMaxLength, zoneNameMinLength } from '@ombre/shared';
import { withActor, type Database, type Transaction } from './client';
import { DomainError, type SpotZone } from './inventory';
import type { Actor } from './manage';
import { auditEvent, beachZone, spot } from './schema';

// Named zones of the layout (D50): a proper noun written by the manager («Zona
// Relax», «Prima fila»), identical in both languages; the physical band
// (riva|ombrelloni|monte) stays a distinct, untouched concept. At most 20 zones
// per beach club, name of 2–40 characters unique per club. Deleting a zone
// detaches its spots (named_zone_id goes NULL via the foreign key); assignment
// goes per spot or per whole row, like the rental label does.

function pgCode(error: unknown): string | undefined {
  const candidate = error as { code?: string; cause?: { code?: string } } | null;
  return candidate?.code ?? candidate?.cause?.code;
}

function audit(tx: Transaction, actor: Actor, action: string, target: string | null, detail: Record<string, unknown>): Promise<unknown> {
  return tx.insert(auditEvent).values({ beachId: actor.beachId, actorUserId: actor.userId, action, target, detail });
}

function assertZoneName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length < zoneNameMinLength || trimmed.length > zoneNameMaxLength) {
    throw new RangeError(`the zone name must have ${zoneNameMinLength} to ${zoneNameMaxLength} characters`);
  }
  return trimmed;
}

function duplicateZone(error: unknown): never {
  if (pgCode(error) === '23505') throw new DomainError('invalid_state', 'A zone with this name already exists');
  throw error;
}

export interface ZoneView {
  zoneId: string;
  name: string;
  /** How many spots belong to the zone, retired ones included: the editor shows it. */
  spots: number;
}

/** The named zones of the beach club, oldest first, each with its spot count. */
export function listZones(db: Database, actor: Actor): Promise<ZoneView[]> {
  return withActor(db, actor.beachId, actor.userId, (tx) =>
    tx
      .select({
        zoneId: beachZone.id,
        name: beachZone.name,
        spots: sql<number>`(select count(*) from spot s where s.named_zone_id = ${beachZone.id})::int`,
      })
      .from(beachZone)
      .orderBy(asc(beachZone.createdAt), asc(beachZone.id)),
  );
}

/** Creates a zone; the ceiling of 20 per club is applied here, under an advisory lock. */
export async function createZone(db: Database, actor: Actor, input: { name: string }): Promise<{ zoneId: string; name: string }> {
  const name = assertZoneName(input.name);
  try {
    return await withActor(db, actor.beachId, actor.userId, async (tx) => {
      // Two simultaneous creations must both see each other: the lock serializes them.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${actor.beachId}/zones`}, 0))`);
      const [counted] = await tx.select({ zones: sql<number>`count(*)::int` }).from(beachZone);
      if ((counted?.zones ?? 0) >= maxNamedZones) throw new DomainError('cap_reached', `A beach club may have at most ${maxNamedZones} zones`);
      const [created] = await tx.insert(beachZone).values({ beachId: actor.beachId, name }).returning({ zoneId: beachZone.id, name: beachZone.name });
      if (!created) throw new Error('zone was not created');
      await audit(tx, actor, 'zone.create', created.zoneId, { name });
      return created;
    });
  } catch (error) {
    duplicateZone(error);
  }
}

/** Renames a zone; every place that shows the name follows, since nothing is denormalized. */
export async function renameZone(db: Database, actor: Actor, input: { zoneId: string; name: string }): Promise<void> {
  const name = assertZoneName(input.name);
  try {
    return await withActor(db, actor.beachId, actor.userId, async (tx) => {
      const [current] = await tx.select({ name: beachZone.name }).from(beachZone).where(eq(beachZone.id, input.zoneId));
      if (!current) throw new DomainError('not_found', 'Zone not found');
      if (current.name === name) return;
      await tx.update(beachZone).set({ name }).where(eq(beachZone.id, input.zoneId));
      await audit(tx, actor, 'zone.rename', input.zoneId, { from: current.name, to: name });
    });
  } catch (error) {
    duplicateZone(error);
  }
}

/** Deletes a zone. Its spots stay where they are, detached by the foreign key (named_zone_id NULL). */
export function deleteZone(db: Database, actor: Actor, input: { zoneId: string }): Promise<{ detachedSpots: number }> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const [current] = await tx.select({ name: beachZone.name }).from(beachZone).where(eq(beachZone.id, input.zoneId));
    if (!current) throw new DomainError('not_found', 'Zone not found');
    const attached = await tx.select({ id: spot.id }).from(spot).where(eq(spot.namedZoneId, input.zoneId));
    await tx.delete(beachZone).where(eq(beachZone.id, input.zoneId));
    await audit(tx, actor, 'zone.delete', input.zoneId, { name: current.name, detachedSpots: attached.length });
    return { detachedSpots: attached.length };
  });
}

/** The zone named by the input, or a clear refusal. Null means «no zone»: the spot is detached. */
async function resolveZone(tx: Transaction, zoneId: string | null): Promise<{ id: string; name: string } | null> {
  if (zoneId === null) return null;
  const [found] = await tx.select({ id: beachZone.id, name: beachZone.name }).from(beachZone).where(eq(beachZone.id, zoneId));
  if (!found) throw new DomainError('not_found', 'Zone not found');
  return found;
}

/** Assigns one spot to a zone, or detaches it with null. */
export function assignZoneToSpot(db: Database, actor: Actor, input: { spotId: string; zoneId: string | null }): Promise<void> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const named = await resolveZone(tx, input.zoneId);
    const [current] = await tx.select({ code: spot.code, namedZoneId: spot.namedZoneId }).from(spot).where(eq(spot.id, input.spotId));
    if (!current) throw new DomainError('not_found', 'Spot not found');
    if (current.namedZoneId === input.zoneId) return;
    await tx.update(spot).set({ namedZoneId: input.zoneId }).where(eq(spot.id, input.spotId));
    await audit(tx, actor, 'zone.assign-spot', input.spotId, { code: current.code, zoneId: input.zoneId, zoneName: named?.name ?? null });
  });
}

export interface RowZone {
  /** The physical band of the row (riva|ombrelloni|monte), as the row gestures take it. */
  zone: SpotZone;
  rowNumber: number;
  /** Null detaches the whole row. */
  zoneId: string | null;
}

/** The same named zone for every spot of a row, in one action — like the rental per row. */
export function assignZoneToRow(db: Database, actor: Actor, input: RowZone): Promise<{ updated: number }> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const named = await resolveZone(tx, input.zoneId);
    const updated = await tx
      .update(spot)
      .set({ namedZoneId: input.zoneId })
      .where(and(eq(spot.zone, input.zone), eq(spot.rowNumber, input.rowNumber)))
      .returning({ id: spot.id });
    if (updated.length === 0) throw new DomainError('not_found', 'No spot in this row');
    await audit(tx, actor, 'zone.assign-row', `${input.zone}/${input.rowNumber}`, { zoneId: input.zoneId, zoneName: named?.name ?? null, spots: updated.length });
    return { updated: updated.length };
  });
}
