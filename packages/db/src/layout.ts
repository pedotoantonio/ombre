import { and, asc, eq, sql } from 'drizzle-orm';
import { maxGapRows, rentalNotesMaxLength, rentalTypeMaxLength } from '@ombre/shared';
import { withActor, type Database, type Transaction } from './client';
import { DomainError, zoneOrder, type SpotZone } from './inventory';
import type { Actor } from './manage';
import { auditEvent, beach, inventoryDay, seasonContract, spot } from './schema';

function pgCode(error: unknown): string | undefined {
  const candidate = error as { code?: string; cause?: { code?: string } } | null;
  return candidate?.code ?? candidate?.cause?.code;
}

function audit(tx: Transaction, actor: Actor, action: string, target: string | null, detail: Record<string, unknown>): Promise<unknown> {
  return tx.insert(auditEvent).values({ beachId: actor.beachId, actorUserId: actor.userId, action, target, detail });
}

// ---- Position on the map ----

export interface BeachPosition {
  latitude: number | null;
  longitude: number | null;
}

/** Sets or clears the coordinates of the beach club. Both or none: the API validates the ranges, the database checks them again. */
export function setBeachPosition(db: Database, actor: Actor, position: BeachPosition): Promise<void> {
  if ((position.latitude === null) !== (position.longitude === null)) throw new RangeError('latitude and longitude go together');
  if (position.latitude !== null && (position.latitude < -90 || position.latitude > 90)) throw new RangeError('latitude must be between -90 and 90');
  if (position.longitude !== null && (position.longitude < -180 || position.longitude > 180)) throw new RangeError('longitude must be between -180 and 180');
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    await tx.update(beach).set({ latitude: position.latitude, longitude: position.longitude }).where(eq(beach.id, actor.beachId));
    await audit(tx, actor, 'beach.position', null, { latitude: position.latitude, longitude: position.longitude });
  });
}

// ---- The layout as the manager sees it ----

export interface ActiveContract {
  contractId: string;
  validFrom: string;
  validTo: string;
  sharingMode: (typeof seasonContract.$inferSelect)['sharingMode'];
}

export interface LayoutSpot {
  spotId: string;
  code: string;
  zone: SpotZone;
  rowNumber: number;
  umbrellas: number;
  sunbeds: number;
  maxGuests: number;
  /** Management annotations, never public. */
  rentalType: string | null;
  rentalNotes: string | null;
  retired: boolean;
  /** The season contract that covers today, if any: the operational truth next to the label. */
  activeContract: ActiveContract | null;
}

export interface BeachLayout {
  shoreGapRows: number;
  landGapRows: number;
  spots: LayoutSpot[];
}

/** Today in the beach club's own time zone. */
const localToday = sql`(select (now() at time zone b.timezone)::date from beach b where b.id = ${spot.beachId})`;

/** The whole layout, retired spots included, ordered by zone (shore, umbrellas, land), row and code. */
export function getLayout(db: Database, actor: Actor): Promise<BeachLayout> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const [gaps] = await tx.select({ shoreGapRows: beach.shoreGapRows, landGapRows: beach.landGapRows }).from(beach).where(eq(beach.id, actor.beachId));
    if (!gaps) throw new DomainError('not_found', 'Beach club not found');
    const rows = await tx
      .select({
        spotId: spot.id,
        code: spot.code,
        zone: spot.zone,
        rowNumber: spot.rowNumber,
        umbrellas: spot.umbrellas,
        sunbeds: spot.sunbeds,
        maxGuests: spot.maxGuests,
        rentalType: spot.rentalType,
        rentalNotes: spot.rentalNotes,
        retired: spot.retired,
        contractId: seasonContract.id,
        validFrom: seasonContract.validFrom,
        validTo: seasonContract.validTo,
        sharingMode: seasonContract.sharingMode,
      })
      .from(spot)
      // At most one contract covers today: overlapping periods are excluded by the schema.
      .leftJoin(
        seasonContract,
        and(eq(seasonContract.spotId, spot.id), eq(seasonContract.status, 'active'), sql`${seasonContract.validFrom} <= ${localToday} and ${seasonContract.validTo} >= ${localToday}`),
      )
      .orderBy(zoneOrder, asc(spot.rowNumber), asc(spot.code));
    return {
      ...gaps,
      spots: rows.map(({ contractId, validFrom, validTo, sharingMode, ...place }) => ({
        ...place,
        activeContract: contractId && validFrom && validTo && sharingMode ? { contractId, validFrom, validTo, sharingMode } : null,
      })),
    };
  });
}

// ---- Distances between zones ----

export interface GapRows {
  shoreGapRows: number;
  landGapRows: number;
}

/** Empty corridor rows between the zones. The only layout change the reception may make. */
export function setGapRows(db: Database, actor: Actor, gaps: GapRows): Promise<void> {
  for (const [name, value] of Object.entries(gaps)) {
    if (!Number.isInteger(value) || value < 0 || value > maxGapRows) throw new RangeError(`${name} must be an integer between 0 and ${maxGapRows}`);
  }
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    await tx.update(beach).set(gaps).where(eq(beach.id, actor.beachId));
    await audit(tx, actor, 'layout.gaps', null, { ...gaps });
  });
}

// ---- Rows and spots ----

export interface Equipment {
  umbrellas?: number;
  sunbeds?: number;
  maxGuests?: number;
}

/** In the shore and land zones the default is a single sunbed; among the umbrellas, the usual spot. */
function defaultEquipment(zone: SpotZone): Required<Equipment> {
  return zone === 'ombrelloni' ? { umbrellas: 1, sunbeds: 2, maxGuests: 2 } : { umbrellas: 0, sunbeds: 1, maxGuests: 1 };
}

function fillEquipment(zone: SpotZone, given: Equipment): Required<Equipment> {
  const defaults = defaultEquipment(zone);
  return {
    umbrellas: given.umbrellas ?? defaults.umbrellas,
    sunbeds: given.sunbeds ?? defaults.sunbeds,
    maxGuests: given.maxGuests ?? defaults.maxGuests,
  };
}

function assertEquipment(equipment: Required<Equipment>): void {
  for (const [name, value] of Object.entries(equipment)) {
    if (!Number.isInteger(value) || value < 0) throw new RangeError(`${name} must be a whole number`);
  }
  if (equipment.maxGuests < 1) throw new RangeError('maxGuests must be at least 1');
}

function assertRental(rentalType: string | null | undefined, rentalNotes: string | null | undefined): void {
  if (rentalType != null && (rentalType.length === 0 || rentalType.length > rentalTypeMaxLength)) throw new RangeError(`rentalType must have 1 to ${rentalTypeMaxLength} characters`);
  if (rentalNotes != null && (rentalNotes.length === 0 || rentalNotes.length > rentalNotesMaxLength)) throw new RangeError(`rentalNotes must have 1 to ${rentalNotesMaxLength} characters`);
}

function duplicateCode(error: unknown): never {
  if (pgCode(error) === '23505') throw new DomainError('invalid_state', 'A spot with this code already exists');
  throw error;
}

export interface NewRow extends Equipment {
  zone: SpotZone;
  /** Prefix of the codes: R gives R01, R02, ... The manager chooses it. */
  prefix: string;
  count: number;
}

/** Adds a whole row after the last one of the zone. Codes are prefix + position, starting from 01. */
export async function addRow(db: Database, actor: Actor, input: NewRow): Promise<{ rowNumber: number; spotIds: string[] }> {
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > 50) throw new RangeError('count must be between 1 and 50');
  const equipment = fillEquipment(input.zone, input);
  assertEquipment(equipment);
  try {
    return await withActor(db, actor.beachId, actor.userId, async (tx) => {
      const [last] = await tx.select({ max: sql<number>`coalesce(max(${spot.rowNumber}), 0)::int` }).from(spot).where(eq(spot.zone, input.zone));
      const rowNumber = (last?.max ?? 0) + 1;
      const created = await tx
        .insert(spot)
        .values(
          Array.from({ length: input.count }, (_, index) => ({
            beachId: actor.beachId,
            code: `${input.prefix}${String(index + 1).padStart(2, '0')}`,
            zone: input.zone,
            rowNumber,
            umbrellas: equipment.umbrellas,
            sunbeds: equipment.sunbeds,
            maxGuests: equipment.maxGuests,
          })),
        )
        .returning({ id: spot.id });
      await audit(tx, actor, 'layout.row-add', `${input.zone}/${rowNumber}`, { prefix: input.prefix, count: input.count, ...equipment });
      return { rowNumber, spotIds: created.map((row) => row.id) };
    });
  } catch (error) {
    duplicateCode(error);
  }
}

export interface NewSpot extends Equipment {
  zone: SpotZone;
  code: string;
  /** Row inside the zone; the last row of the zone (or 1) when left out. */
  rowNumber?: number;
  rentalType?: string | null;
  rentalNotes?: string | null;
}

/** Adds one spot, for example a single shore sunbed. */
export async function addSpot(db: Database, actor: Actor, input: NewSpot): Promise<{ spotId: string }> {
  const equipment = fillEquipment(input.zone, input);
  assertEquipment(equipment);
  assertRental(input.rentalType, input.rentalNotes);
  if (input.rowNumber !== undefined && (!Number.isInteger(input.rowNumber) || input.rowNumber < 1)) throw new RangeError('rowNumber must be a whole number from 1');
  try {
    return await withActor(db, actor.beachId, actor.userId, async (tx) => {
      const [last] = await tx.select({ max: sql<number>`coalesce(max(${spot.rowNumber}), 1)::int` }).from(spot).where(eq(spot.zone, input.zone));
      const rowNumber = input.rowNumber ?? last?.max ?? 1;
      const [created] = await tx
        .insert(spot)
        .values({
          beachId: actor.beachId,
          code: input.code,
          zone: input.zone,
          rowNumber,
          umbrellas: equipment.umbrellas,
          sunbeds: equipment.sunbeds,
          maxGuests: equipment.maxGuests,
          rentalType: input.rentalType ?? null,
          rentalNotes: input.rentalNotes ?? null,
        })
        .returning({ id: spot.id });
      if (!created) throw new Error('spot was not created');
      await audit(tx, actor, 'layout.spot-add', created.id, { code: input.code, zone: input.zone, rowNumber, ...equipment });
      return { spotId: created.id };
    });
  } catch (error) {
    duplicateCode(error);
  }
}

export interface SpotChange extends Equipment {
  spotId: string;
  /** Undefined leaves the annotation as it is; null clears it. */
  rentalType?: string | null;
  rentalNotes?: string | null;
}

/** Changes equipment, capacity or rental annotations of one spot. */
export function updateSpot(db: Database, actor: Actor, input: SpotChange): Promise<void> {
  assertRental(input.rentalType, input.rentalNotes);
  const changes: Partial<typeof spot.$inferInsert> = {};
  if (input.umbrellas !== undefined) changes.umbrellas = input.umbrellas;
  if (input.sunbeds !== undefined) changes.sunbeds = input.sunbeds;
  if (input.maxGuests !== undefined) changes.maxGuests = input.maxGuests;
  if (input.rentalType !== undefined) changes.rentalType = input.rentalType;
  if (input.rentalNotes !== undefined) changes.rentalNotes = input.rentalNotes;
  if (Object.keys(changes).length === 0) throw new RangeError('nothing to change');
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const [current] = await tx.select().from(spot).where(eq(spot.id, input.spotId));
    if (!current) throw new DomainError('not_found', 'Spot not found');
    assertEquipment({
      umbrellas: changes.umbrellas ?? current.umbrellas,
      sunbeds: changes.sunbeds ?? current.sunbeds,
      maxGuests: changes.maxGuests ?? current.maxGuests,
    });
    await tx.update(spot).set(changes).where(eq(spot.id, input.spotId));
    await audit(tx, actor, 'layout.spot-update', input.spotId, { code: current.code, ...changes });
  });
}

export interface RowRental {
  zone: SpotZone;
  rowNumber: number;
  rentalType: string | null;
  rentalNotes: string | null;
}

/** The same rental label and notes for every spot of a row, in one action. */
export function setRowRental(db: Database, actor: Actor, input: RowRental): Promise<{ updated: number }> {
  assertRental(input.rentalType, input.rentalNotes);
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const updated = await tx
      .update(spot)
      .set({ rentalType: input.rentalType, rentalNotes: input.rentalNotes })
      .where(and(eq(spot.zone, input.zone), eq(spot.rowNumber, input.rowNumber)))
      .returning({ id: spot.id });
    if (updated.length === 0) throw new DomainError('not_found', 'No spot in this row');
    await audit(tx, actor, 'layout.row-rental', `${input.zone}/${input.rowNumber}`, { rentalType: input.rentalType, rentalNotes: input.rentalNotes, spots: updated.length });
    return { updated: updated.length };
  });
}

// ---- Retirement and deletion ----

/** Retires a spot from sale, or puts it back. History stays; new published days skip it while retired. */
export function setRetired(db: Database, actor: Actor, input: { spotId: string; retired: boolean }): Promise<void> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const [current] = await tx.select({ code: spot.code, retired: spot.retired }).from(spot).where(eq(spot.id, input.spotId));
    if (!current) throw new DomainError('not_found', 'Spot not found');
    if (current.retired === input.retired) return;
    await tx.update(spot).set({ retired: input.retired }).where(eq(spot.id, input.spotId));
    await audit(tx, actor, input.retired ? 'layout.retire' : 'layout.restore', input.spotId, { code: current.code });
  });
}

/** Deletes a spot that was never used. A used one keeps its history: retire it instead. */
export async function deleteSpot(db: Database, actor: Actor, input: { spotId: string }): Promise<void> {
  const used = new DomainError('invalid_state', 'This spot has already been used: retire it from sale instead of deleting it');
  try {
    return await withActor(db, actor.beachId, actor.userId, async (tx) => {
      const [current] = await tx.select({ code: spot.code }).from(spot).where(eq(spot.id, input.spotId));
      if (!current) throw new DomainError('not_found', 'Spot not found');
      const [day] = await tx.select({ id: inventoryDay.id }).from(inventoryDay).where(eq(inventoryDay.spotId, input.spotId)).limit(1);
      const [contract] = await tx.select({ id: seasonContract.id }).from(seasonContract).where(eq(seasonContract.spotId, input.spotId)).limit(1);
      if (day || contract) throw used;
      await tx.delete(spot).where(eq(spot.id, input.spotId));
      await audit(tx, actor, 'layout.spot-delete', input.spotId, { code: current.code });
    });
  } catch (error) {
    // A reference created in the meantime: the foreign key is the last guard.
    if (pgCode(error) === '23503') throw used;
    throw error;
  }
}
