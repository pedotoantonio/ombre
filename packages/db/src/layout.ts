import { and, asc, eq, sql } from 'drizzle-orm';
import { decorationSigns, maxColumns, maxGapRows, rentalNotesMaxLength, rentalTypeMaxLength, type DecorationSign, type SeaSide, type SpotMark, type WalkwayOrientation } from '@ombre/shared';
import { withActor, type Database, type Transaction } from './client';
import { DomainError, zoneOrder, type SpotZone } from './inventory';
import type { Actor } from './manage';
import { auditEvent, beach, beachZone, booking, cabin, inventoryDay, layoutElement, seasonContract, spot, spotType } from './schema';

function pgCode(error: unknown): string | undefined {
  const candidate = error as { code?: string; cause?: { code?: string } } | null;
  return candidate?.code ?? candidate?.cause?.code;
}

function pgConstraint(error: unknown): string | undefined {
  const candidate = error as { constraint?: string; cause?: { constraint?: string } } | null;
  return candidate?.constraint ?? candidate?.cause?.constraint;
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
  /** Column inside the row: the only source of the drawing. Holes are allowed. */
  col: number;
  typeId: string;
  typeName: string;
  typeMark: SpotMark;
  umbrellas: number;
  sunbeds: number;
  maxGuests: number;
  /** Management annotations, never public. */
  rentalType: string | null;
  rentalNotes: string | null;
  retired: boolean;
  /** Under maintenance (D56): not bookable while true, stays in the drawing, bookings already taken remain. */
  maintenance: boolean;
  /** The named zone of the spot (D50); both null when it belongs to none. */
  namedZoneId: string | null;
  zoneName: string | null;
  /** The season contract that covers today, if any: the operational truth next to the label. */
  activeContract: ActiveContract | null;
}

export interface BeachLayout {
  seaSide: SeaSide;
  shoreGapRows: number;
  landGapRows: number;
  spots: LayoutSpot[];
  elements: LayoutElementView[];
}

/** Today in the beach club's own time zone. */
const localToday = sql`(select (now() at time zone b.timezone)::date from beach b where b.id = ${spot.beachId})`;

/** The whole layout, retired spots included, ordered by zone (shore, umbrellas, land), row and column. */
export function getLayout(db: Database, actor: Actor): Promise<BeachLayout> {
  return withActor(db, actor.beachId, actor.userId, (tx) => getLayoutWithin(tx, actor));
}

/** The same layout inside an existing beach transaction: the planner's draft previews on top of it (D57). */
export async function getLayoutWithin(tx: Transaction, actor: Actor): Promise<BeachLayout> {
  const [gaps] = await tx.select({ seaSide: beach.seaSide, shoreGapRows: beach.shoreGapRows, landGapRows: beach.landGapRows }).from(beach).where(eq(beach.id, actor.beachId));
    if (!gaps) throw new DomainError('not_found', 'Beach club not found');
    const rows = await tx
      .select({
        spotId: spot.id,
        code: spot.code,
        zone: spot.zone,
        rowNumber: spot.rowNumber,
        col: spot.col,
        typeId: spot.typeId,
        typeName: spotType.name,
        typeMark: spotType.mark,
        umbrellas: spot.umbrellas,
        sunbeds: spot.sunbeds,
        maxGuests: spot.maxGuests,
        rentalType: spot.rentalType,
        rentalNotes: spot.rentalNotes,
        retired: spot.retired,
        maintenance: spot.maintenance,
        namedZoneId: spot.namedZoneId,
        zoneName: beachZone.name,
        contractId: seasonContract.id,
        validFrom: seasonContract.validFrom,
        validTo: seasonContract.validTo,
        sharingMode: seasonContract.sharingMode,
      })
      .from(spot)
      .innerJoin(spotType, eq(spotType.id, spot.typeId))
      .leftJoin(beachZone, eq(beachZone.id, spot.namedZoneId))
      // At most one contract covers today: overlapping periods are excluded by the schema.
      .leftJoin(
        seasonContract,
        and(eq(seasonContract.spotId, spot.id), eq(seasonContract.status, 'active'), sql`${seasonContract.validFrom} <= ${localToday} and ${seasonContract.validTo} >= ${localToday}`),
      )
      .orderBy(zoneOrder, asc(spot.rowNumber), asc(spot.col));
    return {
      ...gaps,
      spots: rows.map(({ contractId, validFrom, validTo, sharingMode, ...place }) => ({
        ...place,
        activeContract: contractId && validFrom && validTo && sharingMode ? { contractId, validFrom, validTo, sharingMode } : null,
      })),
      elements: await listElements(tx),
    };
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

/**
 * The spot type whose defaults a new spot copies. Without an explicit type, the
 * umbrella zone gets the builtin "Ombrellone" and the shore and land zones the
 * builtin single sunbed, found by their fixed marks.
 */
async function resolveType(tx: Transaction, zone: SpotZone, typeId: string | undefined): Promise<typeof spotType.$inferSelect> {
  if (typeId) {
    const [found] = await tx.select().from(spotType).where(eq(spotType.id, typeId));
    if (!found) throw new DomainError('not_found', 'Spot type not found');
    return found;
  }
  const mark = zone === 'ombrelloni' ? 'umbrella' : 'sunbed';
  const [builtin] = await tx.select().from(spotType).where(and(eq(spotType.builtin, true), eq(spotType.mark, mark)));
  if (!builtin) throw new Error('builtin spot type missing');
  return builtin;
}

/** Type defaults are copied at creation and never propagate afterwards. */
function fillEquipment(type: typeof spotType.$inferSelect, given: Equipment): Required<Equipment> {
  return {
    umbrellas: given.umbrellas ?? type.umbrellas,
    sunbeds: given.sunbeds ?? type.sunbeds,
    maxGuests: given.maxGuests ?? type.maxGuests,
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

function duplicateSpot(error: unknown): never {
  if (pgCode(error) === '23505') {
    if (pgConstraint(error) === 'spot_cell') throw new DomainError('invalid_state', 'That cell of the row is already occupied');
    throw new DomainError('invalid_state', 'A spot with this code already exists');
  }
  throw error;
}

export interface NewRow extends Equipment {
  zone: SpotZone;
  /** Prefix of the codes: R gives R01, R02, ... The manager chooses it. */
  prefix: string;
  count: number;
  /** Spot type whose defaults the new spots copy; the builtin of the zone when left out. */
  typeId?: string;
}

/** Adds a whole row after the last one of the zone. Codes are prefix + position, starting from 01. */
export async function addRow(db: Database, actor: Actor, input: NewRow): Promise<{ rowNumber: number; spotIds: string[] }> {
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > 50) throw new RangeError('count must be between 1 and 50');
  try {
    return await withActor(db, actor.beachId, actor.userId, async (tx) => {
      const type = await resolveType(tx, input.zone, input.typeId);
      const equipment = fillEquipment(type, input);
      assertEquipment(equipment);
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
            col: index + 1,
            typeId: type.id,
            umbrellas: equipment.umbrellas,
            sunbeds: equipment.sunbeds,
            maxGuests: equipment.maxGuests,
          })),
        )
        .returning({ id: spot.id });
      await audit(tx, actor, 'layout.row-add', `${input.zone}/${rowNumber}`, { prefix: input.prefix, count: input.count, typeId: type.id, typeName: type.name, ...equipment });
      return { rowNumber, spotIds: created.map((row) => row.id) };
    });
  } catch (error) {
    duplicateSpot(error);
  }
}

export const bulkRowsMaxRows = 10;
export const bulkRowsMaxPerRow = 50;
export const bulkRowsMaxSpots = 200;

export interface NewRows extends Equipment {
  zone: SpotZone;
  /** One prefix across every row: 3×10 with A gives A01–A10, A11–A20, A21–A30. */
  prefix: string;
  /** How many whole rows, appended after the last one of the zone. */
  rows: number;
  /** Spots in each row. */
  perRow: number;
  /** Spot type whose defaults the new spots copy; the builtin of the zone when left out. */
  typeId?: string;
}

/**
 * Adds several whole rows in one transaction (spec §4, D34). The numbering runs
 * with a single prefix across the rows, its leading zeroes sized by the total
 * the way addRow sizes them by the row. A code collision with an existing spot
 * fails the whole operation: no row is created. One audit event carries the counts.
 */
export async function addRows(db: Database, actor: Actor, input: NewRows): Promise<{ rowNumbers: number[]; spotIds: string[]; firstCode: string; lastCode: string }> {
  try {
    return await withActor(db, actor.beachId, actor.userId, (tx) => addRowsWithin(tx, actor, input));
  } catch (error) {
    duplicateSpot(error);
  }
}

/** The codes of a bulk generation (D34): one prefix across the rows, leading zeroes sized by the total. */
export function bulkRowCodes(input: Pick<NewRows, 'prefix' | 'rows' | 'perRow'>): string[] {
  if (!Number.isInteger(input.rows) || input.rows < 1 || input.rows > bulkRowsMaxRows) throw new RangeError(`rows must be between 1 and ${bulkRowsMaxRows}`);
  if (!Number.isInteger(input.perRow) || input.perRow < 1 || input.perRow > bulkRowsMaxPerRow) throw new RangeError(`perRow must be between 1 and ${bulkRowsMaxPerRow}`);
  const total = input.rows * input.perRow;
  if (total > bulkRowsMaxSpots) throw new RangeError(`rows × perRow must not exceed ${bulkRowsMaxSpots} spots`);
  const width = Math.max(2, String(total).length);
  return Array.from({ length: total }, (_, index) => `${input.prefix}${String(index + 1).padStart(width, '0')}`);
}

/** The same bulk generation inside an existing beach transaction: the planner's apply reuses it as it is (D57). */
export async function addRowsWithin(tx: Transaction, actor: Actor, input: NewRows): Promise<{ rowNumbers: number[]; spotIds: string[]; firstCode: string; lastCode: string }> {
  const codes = bulkRowCodes(input);
  const total = codes.length;
  const type = await resolveType(tx, input.zone, input.typeId);
  const equipment = fillEquipment(type, input);
  assertEquipment(equipment);
  const [last] = await tx.select({ max: sql<number>`coalesce(max(${spot.rowNumber}), 0)::int` }).from(spot).where(eq(spot.zone, input.zone));
  const firstRow = (last?.max ?? 0) + 1;
  const created = await tx
    .insert(spot)
    .values(
      codes.map((code, index) => ({
        beachId: actor.beachId,
        code,
        zone: input.zone,
        rowNumber: firstRow + Math.floor(index / input.perRow),
        col: (index % input.perRow) + 1,
        typeId: type.id,
        umbrellas: equipment.umbrellas,
        sunbeds: equipment.sunbeds,
        maxGuests: equipment.maxGuests,
      })),
    )
    .returning({ id: spot.id });
  await audit(tx, actor, 'layout.rows-add', `${input.zone}/${firstRow}-${firstRow + input.rows - 1}`, {
    prefix: input.prefix,
    rows: input.rows,
    perRow: input.perRow,
    spots: total,
    firstCode: codes[0],
    lastCode: codes[total - 1],
    typeId: type.id,
    typeName: type.name,
    ...equipment,
  });
  return {
    rowNumbers: Array.from({ length: input.rows }, (_, row) => firstRow + row),
    spotIds: created.map((row) => row.id),
    firstCode: codes[0]!,
    lastCode: codes[total - 1]!,
  };
}

export interface NewSpot extends Equipment {
  zone: SpotZone;
  code: string;
  /** Row inside the zone; the last row of the zone (or 1) when left out. */
  rowNumber?: number;
  /** Column inside the row; the next free one when left out. */
  col?: number;
  /** Spot type whose defaults the new spot copies; the builtin of the zone when left out. */
  typeId?: string;
  rentalType?: string | null;
  rentalNotes?: string | null;
}

/** Adds one spot, for example a single shore sunbed. */
export async function addSpot(db: Database, actor: Actor, input: NewSpot): Promise<{ spotId: string }> {
  try {
    return await withActor(db, actor.beachId, actor.userId, (tx) => addSpotWithin(tx, actor, input));
  } catch (error) {
    duplicateSpot(error);
  }
}

/** The same single creation inside an existing beach transaction, for the planner's apply (D57). */
export async function addSpotWithin(tx: Transaction, actor: Actor, input: NewSpot): Promise<{ spotId: string }> {
  assertRental(input.rentalType, input.rentalNotes);
  if (input.rowNumber !== undefined && (!Number.isInteger(input.rowNumber) || input.rowNumber < 1)) throw new RangeError('rowNumber must be a whole number from 1');
  if (input.col !== undefined && (!Number.isInteger(input.col) || input.col < 1 || input.col > maxColumns)) throw new RangeError(`col must be a whole number from 1 to ${maxColumns}`);
  const type = await resolveType(tx, input.zone, input.typeId);
  const equipment = fillEquipment(type, input);
  assertEquipment(equipment);
  const [last] = await tx.select({ max: sql<number>`coalesce(max(${spot.rowNumber}), 1)::int` }).from(spot).where(eq(spot.zone, input.zone));
  const rowNumber = input.rowNumber ?? last?.max ?? 1;
  const [created] = await tx
    .insert(spot)
    .values({
      beachId: actor.beachId,
      code: input.code,
      zone: input.zone,
      rowNumber,
      // Left undefined, the database trigger appends to the row.
      ...(input.col !== undefined ? { col: input.col } : {}),
      typeId: type.id,
      umbrellas: equipment.umbrellas,
      sunbeds: equipment.sunbeds,
      maxGuests: equipment.maxGuests,
      rentalType: input.rentalType ?? null,
      rentalNotes: input.rentalNotes ?? null,
    } as typeof spot.$inferInsert)
    .returning({ id: spot.id, col: spot.col });
  if (!created) throw new Error('spot was not created');
  await audit(tx, actor, 'layout.spot-add', created.id, { code: input.code, zone: input.zone, rowNumber, col: created.col, typeId: type.id, typeName: type.name, ...equipment });
  return { spotId: created.id };
}

/**
 * Changes the type of an existing spot. An explicit action that touches nothing
 * else: the equipment stays exactly as it is, and days already published keep
 * their price.
 */
export function setSpotType(db: Database, actor: Actor, input: { spotId: string; typeId: string }): Promise<void> {
  return withActor(db, actor.beachId, actor.userId, (tx) => setSpotTypeWithin(tx, actor, input));
}

/** The same type change inside an existing beach transaction, for the planner's apply (D57). */
export async function setSpotTypeWithin(tx: Transaction, actor: Actor, input: { spotId: string; typeId: string }): Promise<void> {
  const [current] = await tx.select({ code: spot.code, typeId: spot.typeId }).from(spot).where(eq(spot.id, input.spotId));
  if (!current) throw new DomainError('not_found', 'Spot not found');
  const [type] = await tx.select({ id: spotType.id, name: spotType.name }).from(spotType).where(eq(spotType.id, input.typeId));
  if (!type) throw new DomainError('not_found', 'Spot type not found');
  if (current.typeId === type.id) return;
  await tx.update(spot).set({ typeId: type.id }).where(eq(spot.id, input.spotId));
  await audit(tx, actor, 'layout.spot-type', input.spotId, { code: current.code, from: current.typeId, to: type.id, typeName: type.name });
}

export interface SpotChange extends Equipment {
  spotId: string;
  /** A new label for the spot; the cell, bookings and pass stay the same (D60). */
  code?: string;
  /** Maintenance (D56): no new booking while true, the drawing and the bookings already taken stay. Only the planner's draft reaches it (D57). */
  maintenance?: boolean;
  /** Undefined leaves the annotation as it is; null clears it. */
  rentalType?: string | null;
  rentalNotes?: string | null;
}

/** Changes code, equipment, capacity, maintenance or rental annotations of one spot. */
export async function updateSpot(db: Database, actor: Actor, input: SpotChange): Promise<void> {
  try {
    return await withActor(db, actor.beachId, actor.userId, (tx) => updateSpotWithin(tx, actor, input));
  } catch (error) {
    duplicateSpot(error);
  }
}

/** The same change inside an existing beach transaction, for the planner's apply (D57). */
export async function updateSpotWithin(tx: Transaction, actor: Actor, input: SpotChange): Promise<void> {
  assertRental(input.rentalType, input.rentalNotes);
  if (input.code !== undefined && (input.code.length === 0 || input.code.length > 10)) throw new RangeError('code must have 1 to 10 characters');
  const changes: Partial<typeof spot.$inferInsert> = {};
  if (input.code !== undefined) changes.code = input.code;
  if (input.umbrellas !== undefined) changes.umbrellas = input.umbrellas;
  if (input.sunbeds !== undefined) changes.sunbeds = input.sunbeds;
  if (input.maxGuests !== undefined) changes.maxGuests = input.maxGuests;
  if (input.maintenance !== undefined) changes.maintenance = input.maintenance;
  if (input.rentalType !== undefined) changes.rentalType = input.rentalType;
  if (input.rentalNotes !== undefined) changes.rentalNotes = input.rentalNotes;
  if (Object.keys(changes).length === 0) throw new RangeError('nothing to change');
  const [current] = await tx.select().from(spot).where(eq(spot.id, input.spotId));
  if (!current) throw new DomainError('not_found', 'Spot not found');
  assertEquipment({
    umbrellas: changes.umbrellas ?? current.umbrellas,
    sunbeds: changes.sunbeds ?? current.sunbeds,
    maxGuests: changes.maxGuests ?? current.maxGuests,
  });
  await tx.update(spot).set(changes).where(eq(spot.id, input.spotId));
  await audit(tx, actor, 'layout.spot-update', input.spotId, { code: current.code, ...changes });
}

/**
 * Moves one spot to another cell of the grid (D57, D60). The identity lives in the
 * id, never in the cell: code, bookings, pass and history are untouched. The target
 * cell must be free of spots — the UNIQUE (beach, zone, row, col) of migration 011
 * is the real guard — and of elements. Reached only through the planner's draft.
 */
export async function moveSpot(db: Database, actor: Actor, input: { spotId: string; zone: SpotZone; rowNumber: number; col: number }): Promise<void> {
  try {
    return await withActor(db, actor.beachId, actor.userId, (tx) => moveSpotWithin(tx, actor, input));
  } catch (error) {
    duplicateSpot(error);
  }
}

/** The same move inside an existing beach transaction, for the planner's apply (D57). */
export async function moveSpotWithin(tx: Transaction, actor: Actor, input: { spotId: string; zone: SpotZone; rowNumber: number; col: number }): Promise<void> {
  if (!Number.isInteger(input.rowNumber) || input.rowNumber < 1) throw new RangeError('rowNumber must be a whole number from 1');
  if (!Number.isInteger(input.col) || input.col < 1 || input.col > maxColumns) throw new RangeError(`col must be a whole number from 1 to ${maxColumns}`);
  const [current] = await tx.select({ code: spot.code, zone: spot.zone, rowNumber: spot.rowNumber, col: spot.col }).from(spot).where(eq(spot.id, input.spotId));
  if (!current) throw new DomainError('not_found', 'Spot not found');
  if (current.zone === input.zone && current.rowNumber === input.rowNumber && current.col === input.col) return;
  // A cell under an element is as taken as one under a spot; the unique constraint settles spot races.
  const elements = await listElements(tx);
  const occupied = elements.some(
    (other) =>
      (other.kind === 'structure' || other.kind === 'cabin_block' || other.kind === 'decoration') &&
      other.zone === input.zone && other.rowNumber === input.rowNumber &&
      rangesTouch(input.col, input.col, other.colStart!, other.colEnd ?? other.colStart!),
  );
  if (occupied) throw new DomainError('invalid_state', 'An element already occupies that cell');
  await tx.update(spot).set({ zone: input.zone, rowNumber: input.rowNumber, col: input.col }).where(eq(spot.id, input.spotId));
  await audit(tx, actor, 'layout.spot-move', input.spotId, {
    code: current.code,
    from: { zone: current.zone, rowNumber: current.rowNumber, col: current.col },
    to: { zone: input.zone, rowNumber: input.rowNumber, col: input.col },
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

// ---- The drawing: sea side and elements ----

/** Which side the sea band is drawn on. Only the visual block order flips; rows and distances stay counted from the sea. */
export function setSeaSide(db: Database, actor: Actor, seaSide: SeaSide): Promise<void> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    await tx.update(beach).set({ seaSide }).where(eq(beach.id, actor.beachId));
    await audit(tx, actor, 'layout.sea-side', null, { seaSide });
  });
}

export interface LayoutElementView {
  elementId: string;
  kind: (typeof layoutElement.$inferSelect)['kind'];
  label: string | null;
  orientation: WalkwayOrientation | null;
  zone: SpotZone | null;
  rowAfter: number | null;
  rowNumber: number | null;
  colStart: number | null;
  colEnd: number | null;
  /** Only a decoration has a sign; null elsewhere. */
  sign: DecorationSign | null;
}

const elementColumns = {
  elementId: layoutElement.id,
  kind: layoutElement.kind,
  label: layoutElement.label,
  orientation: layoutElement.orientation,
  zone: layoutElement.zone,
  rowAfter: layoutElement.rowAfter,
  rowNumber: layoutElement.rowNumber,
  colStart: layoutElement.colStart,
  colEnd: layoutElement.colEnd,
  sign: layoutElement.sign,
};

/** Elements of the current beach club, in a stable drawing order. */
export function listElements(tx: Transaction): Promise<LayoutElementView[]> {
  return tx
    .select(elementColumns)
    .from(layoutElement)
    .orderBy(
      sql`case ${layoutElement.zone} when 'riva' then 0 when 'ombrelloni' then 1 when 'monte' then 2 else 3 end`,
      asc(layoutElement.rowAfter),
      asc(layoutElement.rowNumber),
      asc(layoutElement.colStart),
    );
}

export interface NewElement {
  kind: (typeof layoutElement.$inferSelect)['kind'];
  /** Required for a structure, optional elsewhere. */
  label?: string | null;
  /** Only for a walkway. */
  orientation?: WalkwayOrientation;
  /** Null on a vertical walkway means it crosses every zone. */
  zone?: SpotZone | null;
  /** Horizontal walkway: its own lane after this row of the zone; 0 = before row 1. */
  rowAfter?: number;
  /** Structure, cabin block or decoration: the row of the cell(s). */
  rowNumber?: number;
  colStart?: number;
  colEnd?: number;
  /** Only for a decoration, from the fixed repertoire (D35). */
  sign?: DecorationSign;
}

function assertColumns(colStart: number | undefined, colEnd: number | null | undefined): void {
  if (colStart === undefined || !Number.isInteger(colStart) || colStart < 1 || colStart > maxColumns) throw new RangeError(`colStart must be a whole number from 1 to ${maxColumns}`);
  if (colEnd != null && (!Number.isInteger(colEnd) || colEnd < colStart || colEnd > maxColumns)) throw new RangeError('colEnd must be a whole number from colStart on');
}

const rangesTouch = (startA: number, endA: number, startB: number, endB: number) => startA <= endB && startB <= endA;

/**
 * Refuses an element that would sit on an occupied cell. A spot keeps its cell even
 * when retired; walkways live on their own lanes and only collide with walkways of
 * the same orientation. Every refusal explains itself.
 */
async function assertFreeCells(tx: Transaction, input: NewElement, excludeElementId?: string): Promise<void> {
  const elements = (await listElements(tx)).filter((other) => other.elementId !== excludeElementId);
  if (input.kind === 'walkway' && input.orientation === 'horizontal') {
    const taken = elements.some(
      (other) =>
        other.kind === 'walkway' && other.orientation === 'horizontal' && other.zone === input.zone && other.rowAfter === input.rowAfter &&
        rangesTouch(input.colStart!, input.colEnd!, other.colStart!, other.colEnd!),
    );
    if (taken) throw new DomainError('invalid_state', 'Another walkway already runs along those columns after that row');
    return;
  }
  if (input.kind === 'walkway') {
    const taken = elements.some(
      (other) =>
        other.kind === 'walkway' && other.orientation === 'vertical' && other.colStart === input.colStart &&
        (other.zone === null || input.zone == null || other.zone === input.zone),
    );
    if (taken) throw new DomainError('invalid_state', 'Another walkway already runs between those columns');
    return;
  }
  // Structure, cabin block or decoration: cells free of spots (retired included) and
  // of other rectangles. A decoration occupies its single cell.
  const colEnd = input.colEnd ?? input.colStart!;
  const occupying = elements.some(
    (other) =>
      (other.kind === 'structure' || other.kind === 'cabin_block' || other.kind === 'decoration') && other.zone === input.zone && other.rowNumber === input.rowNumber &&
      rangesTouch(input.colStart!, colEnd, other.colStart!, other.colEnd ?? other.colStart!),
  );
  if (occupying) throw new DomainError('invalid_state', 'Another element already occupies those cells');
  const [taken] = await tx
    .select({ code: spot.code })
    .from(spot)
    .where(and(eq(spot.zone, input.zone!), eq(spot.rowNumber, input.rowNumber!), sql`${spot.col} between ${input.colStart} and ${colEnd}`))
    .limit(1);
  if (taken) throw new DomainError('invalid_state', `Spot ${taken.code} already occupies one of those cells: a retired spot keeps its cell in the editor`);
}

/** Draws a walkway, a structure, a cabin block or a decoration on the grid. */
export function addElement(db: Database, actor: Actor, input: NewElement): Promise<{ elementId: string }> {
  return withActor(db, actor.beachId, actor.userId, (tx) => addElementWithin(tx, actor, input));
}

/** The same drawing inside an existing beach transaction, for the planner's apply (D57, D58). */
export function addElementWithin(tx: Transaction, actor: Actor, input: NewElement): Promise<{ elementId: string }> {
  const label = input.label?.trim() || null;
  if (label !== null && label.length > 40) throw new RangeError('label must have 1 to 40 characters');
  if (input.kind === 'structure' && label === null) throw new RangeError('a structure needs its label');
  if (input.kind !== 'decoration' && input.sign !== undefined) throw new RangeError('only a decoration has a sign');
  if (input.kind === 'decoration') {
    // One cell with its sign from the repertoire: no orientation, no colEnd (D35).
    if (!input.sign || !decorationSigns.includes(input.sign)) throw new RangeError('a decoration needs its sign from the repertoire');
    if (input.orientation !== undefined) throw new RangeError('only a walkway has an orientation');
    if (!input.zone) throw new RangeError('this element needs its zone');
    if (input.rowNumber === undefined || !Number.isInteger(input.rowNumber) || input.rowNumber < 1) throw new RangeError('rowNumber must be a whole number from 1');
    assertColumns(input.colStart, null);
    if (input.colEnd != null || input.rowAfter !== undefined) throw new RangeError('a decoration takes zone, rowNumber and colStart only');
  } else if (input.kind === 'walkway') {
    if (input.orientation === 'horizontal') {
      if (!input.zone) throw new RangeError('a horizontal walkway needs its zone');
      if (input.rowAfter === undefined || !Number.isInteger(input.rowAfter) || input.rowAfter < 0) throw new RangeError('rowAfter must be a whole number from 0');
      assertColumns(input.colStart, input.colEnd ?? null);
      if (input.colEnd == null) throw new RangeError('a horizontal walkway needs colStart and colEnd');
    } else if (input.orientation === 'vertical') {
      assertColumns(input.colStart, null);
      if (input.colEnd != null || input.rowAfter !== undefined || input.rowNumber !== undefined) throw new RangeError('a vertical walkway only takes colStart and an optional zone');
    } else {
      throw new RangeError('a walkway is horizontal or vertical');
    }
  } else {
    if (input.orientation !== undefined) throw new RangeError('only a walkway has an orientation');
    if (!input.zone) throw new RangeError('this element needs its zone');
    if (input.rowNumber === undefined || !Number.isInteger(input.rowNumber) || input.rowNumber < 1) throw new RangeError('rowNumber must be a whole number from 1');
    assertColumns(input.colStart, input.colEnd ?? null);
    if (input.colEnd == null) throw new RangeError('this element needs colStart and colEnd');
  }
  return (async () => {
    await assertFreeCells(tx, { ...input, label });
    const [created] = await tx
      .insert(layoutElement)
      .values({
        beachId: actor.beachId,
        kind: input.kind,
        label,
        orientation: input.kind === 'walkway' ? input.orientation : null,
        zone: input.zone ?? null,
        rowAfter: input.kind === 'walkway' && input.orientation === 'horizontal' ? input.rowAfter : null,
        rowNumber: input.kind === 'walkway' ? null : input.rowNumber,
        colStart: input.colStart,
        colEnd: input.kind === 'decoration' || (input.kind === 'walkway' && input.orientation === 'vertical') ? null : input.colEnd,
        sign: input.kind === 'decoration' ? input.sign : null,
      })
      .returning({ id: layoutElement.id });
    if (!created) throw new Error('element was not created');
    await audit(tx, actor, 'layout.element-add', created.id, { kind: input.kind, label, orientation: input.orientation ?? null, zone: input.zone ?? null, rowAfter: input.rowAfter ?? null, rowNumber: input.rowNumber ?? null, colStart: input.colStart, colEnd: input.colEnd ?? null, sign: input.sign ?? null });
    return { elementId: created.id };
  })();
}

/** Erases an element. Cabins attached to an erased block stay, detached from the drawing. */
export function removeElement(db: Database, actor: Actor, input: { elementId: string }): Promise<{ detachedCabins: number }> {
  return withActor(db, actor.beachId, actor.userId, (tx) => removeElementWithin(tx, actor, input));
}

/** The same erasure inside an existing beach transaction, for the planner's apply (D57, D58). */
export async function removeElementWithin(tx: Transaction, actor: Actor, input: { elementId: string }): Promise<{ detachedCabins: number }> {
  const [current] = await tx.select({ kind: layoutElement.kind, label: layoutElement.label }).from(layoutElement).where(eq(layoutElement.id, input.elementId));
  if (!current) throw new DomainError('not_found', 'Element not found');
  const attached = await tx.select({ id: cabin.id }).from(cabin).where(eq(cabin.elementId, input.elementId));
  // The foreign key sets cabin.element_id to NULL: the cabins stay, no longer drawn.
  await tx.delete(layoutElement).where(eq(layoutElement.id, input.elementId));
  await audit(tx, actor, 'layout.element-remove', input.elementId, { kind: current.kind, label: current.label, detachedCabins: attached.length });
  return { detachedCabins: attached.length };
}

/**
 * Moves an element on the grid (D58), keeping its identity: a moved cabin block
 * keeps its cabins attached. A walkway keeps its orientation and width; a
 * rectangle keeps its span. Reached only through the planner's draft (D57).
 */
export async function moveElementWithin(tx: Transaction, actor: Actor, input: { elementId: string; zone: SpotZone | null; rowNumber?: number; rowAfter?: number; colStart: number }): Promise<void> {
  const [current] = await tx.select(elementColumns).from(layoutElement).where(eq(layoutElement.id, input.elementId));
  if (!current) throw new DomainError('not_found', 'Element not found');
  const width = current.colEnd !== null && current.colStart !== null ? current.colEnd - current.colStart : 0;
  const colEnd = current.colEnd === null ? null : input.colStart + width;
  if (colEnd !== null && colEnd > maxColumns) throw new RangeError(`the element would end past column ${maxColumns}`);
  const target: NewElement = {
    kind: current.kind,
    label: current.label,
    orientation: current.orientation ?? undefined,
    zone: input.zone,
    rowAfter: current.kind === 'walkway' && current.orientation === 'horizontal' ? (input.rowAfter ?? input.rowNumber) : undefined,
    rowNumber: current.kind === 'walkway' ? undefined : input.rowNumber,
    colStart: input.colStart,
    colEnd: colEnd ?? undefined,
    sign: current.sign ?? undefined,
  };
  // The same shape checks and collision rules as a fresh drawing, the element itself excluded.
  if (current.kind === 'walkway' && current.orientation === 'horizontal') {
    if (target.zone === null || target.rowAfter === undefined || !Number.isInteger(target.rowAfter) || target.rowAfter < 0) throw new RangeError('rowAfter must be a whole number from 0');
  } else if (current.kind !== 'walkway') {
    if (target.zone === null) throw new RangeError('this element needs its zone');
    if (target.rowNumber === undefined || !Number.isInteger(target.rowNumber) || target.rowNumber < 1) throw new RangeError('rowNumber must be a whole number from 1');
  }
  assertColumns(target.colStart, colEnd);
  await assertFreeCells(tx, target, input.elementId);
  await tx
    .update(layoutElement)
    .set({
      zone: target.zone ?? null,
      rowAfter: current.kind === 'walkway' && current.orientation === 'horizontal' ? target.rowAfter : null,
      rowNumber: current.kind === 'walkway' ? null : target.rowNumber,
      colStart: target.colStart,
      colEnd,
    })
    .where(eq(layoutElement.id, input.elementId));
  await audit(tx, actor, 'layout.element-move', input.elementId, {
    kind: current.kind,
    label: current.label,
    from: { zone: current.zone, rowAfter: current.rowAfter, rowNumber: current.rowNumber, colStart: current.colStart, colEnd: current.colEnd },
    to: { zone: target.zone ?? null, rowAfter: target.rowAfter ?? null, rowNumber: target.rowNumber ?? null, colStart: target.colStart, colEnd },
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

/**
 * Deletes a spot from the planner's draft (D57): allowed ONLY when the spot has
 * NO booking at all — the foreign keys are the real guard. Future published days
 * without bookings are deleted with the spot; a booked future refuses with its
 * count, a sold past refuses pointing at retirement or maintenance, counts in hand.
 */
export async function deletePlannedSpotWithin(tx: Transaction, actor: Actor, input: { spotId: string }): Promise<{ removedDays: number }> {
  const [current] = await tx.select({ code: spot.code }).from(spot).where(eq(spot.id, input.spotId));
  if (!current) throw new DomainError('not_found', 'Spot not found');
  const [counted] = await tx
    .select({
      futureBookings: sql<number>`count(*) filter (where ${booking.status} <> 'cancelled' and ${inventoryDay.day} >= (select (now() at time zone bc.timezone)::date from beach bc where bc.id = ${inventoryDay.beachId}))::int`,
      bookings: sql<number>`count(*)::int`,
    })
    .from(booking)
    .innerJoin(inventoryDay, eq(inventoryDay.id, booking.inventoryDayId))
    .where(eq(inventoryDay.spotId, input.spotId));
  if ((counted?.futureBookings ?? 0) > 0) {
    throw new DomainError('spot_has_future_bookings', `Spot ${current.code} has ${counted!.futureBookings} future booking(s): move or cancel them first`);
  }
  if ((counted?.bookings ?? 0) > 0) {
    throw new DomainError('spot_has_history', `Spot ${current.code} has a history of ${counted!.bookings} booking(s): retire it from sale or put it under maintenance instead`);
  }
  const [contract] = await tx.select({ id: seasonContract.id }).from(seasonContract).where(eq(seasonContract.spotId, input.spotId)).limit(1);
  if (contract) throw new DomainError('spot_has_history', `Spot ${current.code} has a season contract: retire it from sale or put it under maintenance instead`);
  // Future published days without bookings leave with the spot; days a hold ever
  // touched are history the foreign keys protect.
  const removed = await tx.execute(sql`
    delete from inventory_day d
    where d.spot_id = ${input.spotId}
      and d.day >= (select (now() at time zone bc.timezone)::date from beach bc where bc.id = d.beach_id)
      and not exists (select 1 from booking b where b.inventory_day_id = d.id)
      and not exists (select 1 from hold h where h.inventory_day_id = d.id)
  `);
  try {
    await tx.delete(spot).where(eq(spot.id, input.spotId));
  } catch (error) {
    // A past day, a hold trail or any other reference: the foreign key decides.
    if (pgCode(error) === '23503') {
      throw new DomainError('spot_has_history', `Spot ${current.code} has a history: retire it from sale or put it under maintenance instead`);
    }
    throw error;
  }
  const removedDays = Number((removed as unknown as { rowCount?: number }).rowCount ?? 0);
  await audit(tx, actor, 'layout.spot-delete', input.spotId, { code: current.code, removedDays });
  return { removedDays };
}
