import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { allDecorationSigns, can, maxColumns, rentalNotesMaxLength, rentalTypeMaxLength, spotZones, walkwayOrientations } from '@ombre/shared';
import type { AnyDecorationSign, LayoutElementKind, SpotMark, WalkwayOrientation } from '@ombre/shared';
import { withActor, type Database, type Transaction } from './client';
import { DomainError, periodMaxDays, zoneOrder, type SpotZone } from './inventory';
import {
  addElementWithin,
  addRowsWithin,
  addSpotWithin,
  bulkRowCodes,
  deletePlannedSpotWithin,
  getLayoutWithin,
  moveElementWithin,
  moveSpotWithin,
  removeElementWithin,
  setSpotTypeWithin,
  updateSpotWithin,
  type BeachLayout,
  type LayoutElementView,
  type NewElement,
} from './layout';
import type { Actor } from './manage';
import { assignZoneToSpotWithin } from './zones';
import { auditEvent, beachZone, booking, inventoryDay, layoutDraft, spot, spotType } from './schema';

/** The planner never goes past a month per request (D33), the same cap as a period (D38). */
export const plannerMaxDays = periodMaxDays;

/**
 * State of one spot-day cell. In the model a booking is one spot for one day
 * (see stats.ts), so the grid is the faithful representation, not a summary.
 * A held day counts as free: a hold is not a booking and dies by itself.
 */
export type PlannerCellState = 'not_published' | 'free' | 'blocked' | 'not_for_sale' | 'booked';

export interface PlannerCell {
  day: string;
  state: PlannerCellState;
  /** Code of the GROUP (D38): adjacent cells of the same period share it. Only on a booked cell, and only with the bookings.read permission; null otherwise. */
  bookingCode: string | null;
  guestName: string | null;
  /** The whole period of the group the cell belongs to, for the cell's title; null like bookingCode. */
  period: { from: string; to: string } | null;
}

export interface PlannerSpot {
  spotId: string;
  code: string;
  zone: SpotZone;
  rowNumber: number;
  col: number;
  typeName: string;
  typeMark: SpotMark;
  /** One cell per day of the window, in day order. */
  cells: PlannerCell[];
}

export interface PlannerGrid {
  from: string;
  to: string;
  /** The days of the window, in order: the columns of the grid. */
  days: string[];
  /** The spots of the drawing, ordered by zone, row and column: the rows of the grid. */
  spots: PlannerSpot[];
}

/** The days of the closed range, computed once in UTC so no time zone can slip a day in. */
function daysBetween(from: string, to: string): string[] {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) throw new RangeError('from and to must be YYYY-MM-DD days');
  if (end < start) throw new DomainError('invalid_state', 'The end day must not come before the start day');
  const span = (end - start) / 86_400_000 + 1;
  if (span > plannerMaxDays) throw new DomainError('cap_reached', `The window must not exceed ${plannerMaxDays} days`);
  return Array.from({ length: span }, (_, index) => new Date(start + index * 86_400_000).toISOString().slice(0, 10));
}

/**
 * The spot-by-day grid of a window (spec §3, D33): for every spot of the drawing
 * and every day of the window, whether the day is not published, free, blocked,
 * withdrawn from sale or booked — the booked cell carrying code and guest of its
 * booking for whoever may read bookings. Read-only: changes happen where they
 * already exist (desk, reception, console).
 */
export function plannerGrid(db: Database, actor: Actor, input: { from: string; to: string; zone?: SpotZone }): Promise<PlannerGrid> {
  const days = daysBetween(input.from, input.to);
  const seeGuests = can(actor.role, 'bookings.read');
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const rows = await tx
      .select({
        spotId: spot.id,
        code: spot.code,
        zone: spot.zone,
        rowNumber: spot.rowNumber,
        col: spot.col,
        typeName: spotType.name,
        typeMark: spotType.mark,
        day: inventoryDay.day,
        dayState: inventoryDay.state,
        bookingCode: booking.code,
        bookingGroupId: booking.groupId,
        guestName: booking.guestName,
      })
      .from(spot)
      .innerJoin(spotType, eq(spotType.id, spot.typeId))
      // The same join as the ledger reads: a sold day is its inventory row plus its live booking.
      .leftJoin(inventoryDay, and(eq(inventoryDay.spotId, spot.id), sql`${inventoryDay.day} between ${input.from} and ${input.to}`))
      .leftJoin(booking, and(eq(booking.inventoryDayId, inventoryDay.id), inArray(booking.status, ['confirmed', 'completed'])))
      .where(and(eq(spot.retired, false), ...(input.zone ? [eq(spot.zone, input.zone)] : [])))
      .orderBy(zoneOrder, asc(spot.rowNumber), asc(spot.col), asc(inventoryDay.day));

    // The period of each group seen in the window, read once: the title of a
    // booked cell shows the whole dal–al even when it leaves the window (D38).
    const groupIds = [...new Set(rows.flatMap((row) => (row.bookingGroupId ? [row.bookingGroupId] : [])))];
    const periods = new Map<string, { from: string; to: string }>();
    if (seeGuests && groupIds.length > 0) {
      const spans = await tx
        .select({ groupId: booking.groupId, from: sql<string>`min(${inventoryDay.day})::text`, to: sql<string>`max(${inventoryDay.day})::text` })
        .from(booking)
        .innerJoin(inventoryDay, eq(inventoryDay.id, booking.inventoryDayId))
        .where(and(inArray(booking.groupId, groupIds), inArray(booking.status, ['confirmed', 'completed'])))
        .groupBy(booking.groupId);
      for (const span of spans) periods.set(span.groupId, { from: span.from, to: span.to });
    }

    const spots: PlannerSpot[] = [];
    const bySpot = new Map<string, Map<string, PlannerCell>>();
    for (const row of rows) {
      let cells = bySpot.get(row.spotId);
      if (!cells) {
        cells = new Map();
        bySpot.set(row.spotId, cells);
        spots.push({ spotId: row.spotId, code: row.code, zone: row.zone, rowNumber: row.rowNumber, col: row.col, typeName: row.typeName, typeMark: row.typeMark, cells: [] });
      }
      if (row.day === null) continue;
      let state: PlannerCellState;
      if (row.dayState === 'unpublishable') state = 'not_for_sale';
      else if (row.dayState === 'blocked') state = 'blocked';
      // Occupied without a live booking should not happen; shown as a sold day, like the console.
      else if (row.dayState === 'occupied') state = 'booked';
      else state = 'free';
      cells.set(row.day, {
        day: row.day,
        state,
        bookingCode: state === 'booked' && seeGuests ? row.bookingCode : null,
        guestName: state === 'booked' && seeGuests ? row.guestName : null,
        period: state === 'booked' && seeGuests && row.bookingGroupId ? (periods.get(row.bookingGroupId) ?? null) : null,
      });
    }
    for (const entry of spots) {
      entry.cells = days.map((day) => bySpot.get(entry.spotId)?.get(day) ?? { day, state: 'not_published', bookingCode: null, guestName: null, period: null });
    }
    return { from: input.from, to: input.to, days, spots };
  });
}

// ---- The planner's draft (D57) ----
//
// Every gesture of the planner appends ONE operation to the draft of the beach
// club; nothing touches the real beach until «Salva la spiaggia» applies the
// whole list in ONE transaction with the existing domain functions. The preview
// is the layout WITH the draft applied in memory: availability, search and the
// desk keep reading the real tables and never see it.

/** A draft never grows past this many operations: save or discard first. */
export const draftMaxOps = 200;

/** Fields of a spot the draft may change (D56, D57): type, equipment, code, zone, maintenance, rental annotations. */
export interface DraftSpotPatch {
  code?: string;
  typeId?: string;
  umbrellas?: number;
  sunbeds?: number;
  maxGuests?: number;
  namedZoneId?: string | null;
  maintenance?: boolean;
  rentalType?: string | null;
  rentalNotes?: string | null;
}

/**
 * The vocabulary of the draft (D57), stored as given in layout_draft.ops. A spot
 * or element created by the draft is referenced by its synthetic id (`draft-3`,
 * `draft-3-12`: the op index, and the position inside a grid), which the apply
 * resolves to the real id it creates.
 */
export type DraftOp =
  | { op: 'create_spot'; zone: SpotZone; row: number; col: number; code?: string; typeId?: string; umbrellas?: number; sunbeds?: number; maxGuests?: number }
  | { op: 'create_grid'; zone: SpotZone; fromRow?: number; rows: number; cols: number; prefix: string; typeId?: string; umbrellas?: number; sunbeds?: number; maxGuests?: number }
  | { op: 'move_spot'; spotId: string; zone: SpotZone; row: number; col: number }
  | { op: 'edit_spot'; spotId: string; patch: DraftSpotPatch }
  | { op: 'delete_spot'; spotId: string }
  | { op: 'add_element'; kind: LayoutElementKind; zone: SpotZone | null; row: number; col: number; span?: number; label?: string | null; sign?: AnyDecorationSign; orientation?: WalkwayOrientation }
  | { op: 'move_element'; elementId: string; zone: SpotZone | null; row: number; col: number }
  | { op: 'remove_element'; elementId: string }
  | { op: 'assign_zone'; spotId: string; zoneId: string | null };

/** A spot of the preview: the layout's own shape, plus whether it exists only in the draft. */
export interface DraftSpot {
  spotId: string;
  code: string;
  zone: SpotZone;
  rowNumber: number;
  col: number;
  typeId: string;
  typeName: string;
  typeMark: SpotMark;
  umbrellas: number;
  sunbeds: number;
  maxGuests: number;
  rentalType: string | null;
  rentalNotes: string | null;
  retired: boolean;
  maintenance: boolean;
  namedZoneId: string | null;
  zoneName: string | null;
  /** True when the spot exists only in the draft: its id is synthetic until the apply. */
  draftOnly: boolean;
}

export interface DraftElement extends LayoutElementView {
  draftOnly: boolean;
}

/** The layout WITH the draft applied in memory, for the planner to draw (D57). Nothing is written. */
export interface DraftPreview {
  seaSide: BeachLayout['seaSide'];
  shoreGapRows: number;
  landGapRows: number;
  spots: DraftSpot[];
  elements: DraftElement[];
}

/**
 * Structured data about one operation, resolved by the domain against the draft
 * state the op found: codes, names and cells, never phrases — the frontend turns
 * them into words with its own dictionaries.
 */
export type DraftOpDescription = Record<string, unknown> & { action: DraftOp['op'] };

export interface DraftOpView {
  op: DraftOp;
  description: DraftOpDescription;
  /** True when the real layout changed under the draft and this op no longer applies: the apply would fail here. */
  stale: boolean;
}

export interface DraftView {
  ops: DraftOpView[];
  updatedBy: string | null;
  updatedAt: Date | null;
  preview: DraftPreview;
}

/** «Salva la spiaggia» failed on one op: NOTHING was applied (D57). */
export class DraftApplyError extends DomainError {
  readonly failedIndex: number;
  /** The domain code of the refusal (inventory_conflict, spot_has_future_bookings, ...), for the summary to point at. */
  readonly reason: string;

  constructor(failedIndex: number, reason: string, message: string) {
    super('draft_apply_failed', message);
    this.name = 'DraftApplyError';
    this.failedIndex = failedIndex;
    this.reason = reason;
  }
}

const invalidOp = (message: string) => new DomainError('draft_invalid_op', message);

/** The draft state the ops are validated against: the real layout with the previous ops applied in memory. */
interface DraftMachine {
  layout: BeachLayout;
  spots: Map<string, DraftSpot>;
  elements: Map<string, DraftElement>;
  /** zoneId → name, of the named zones (D50) the drafted assignments may use. */
  zones: Map<string, string>;
  /** typeId → name and defaults, for create and edit ops. */
  types: Map<string, { name: string; mark: SpotMark; umbrellas: number; sunbeds: number; maxGuests: number }>;
}

async function loadMachine(tx: Transaction, actor: Actor): Promise<DraftMachine> {
  const layout = await getLayoutWithin(tx, actor);
  const zones = new Map((await tx.select({ id: beachZone.id, name: beachZone.name }).from(beachZone).where(eq(beachZone.beachId, actor.beachId))).map((zone) => [zone.id, zone.name]));
  const types = new Map(
    (await tx.select({ id: spotType.id, name: spotType.name, mark: spotType.mark, umbrellas: spotType.umbrellas, sunbeds: spotType.sunbeds, maxGuests: spotType.maxGuests }).from(spotType)).map(
      (type) => [type.id, { name: type.name, mark: type.mark, umbrellas: type.umbrellas, sunbeds: type.sunbeds, maxGuests: type.maxGuests }],
    ),
  );
  const spots = new Map<string, DraftSpot>(
    layout.spots.map((place) => [
      place.spotId,
      {
        spotId: place.spotId,
        code: place.code,
        zone: place.zone,
        rowNumber: place.rowNumber,
        col: place.col,
        typeId: place.typeId,
        typeName: place.typeName,
        typeMark: place.typeMark,
        umbrellas: place.umbrellas,
        sunbeds: place.sunbeds,
        maxGuests: place.maxGuests,
        rentalType: place.rentalType,
        rentalNotes: place.rentalNotes,
        retired: place.retired,
        maintenance: place.maintenance,
        namedZoneId: place.namedZoneId,
        zoneName: place.zoneName,
        draftOnly: false,
      },
    ]),
  );
  const elements = new Map<string, DraftElement>(layout.elements.map((element) => [element.elementId, { ...element, draftOnly: false }]));
  return { layout, spots, elements, zones, types };
}

const isRect = (kind: LayoutElementKind) => kind === 'structure' || kind === 'cabin_block' || kind === 'decoration';

/** An EVIDENT collision in the draft: the cell holds a spot (retired ones keep their cell) or a rectangle element. */
function cellTaken(state: DraftMachine, zone: SpotZone, row: number, col: number, ignoreSpotId?: string, ignoreElementId?: string): boolean {
  for (const place of state.spots.values()) {
    if (place.spotId !== ignoreSpotId && place.zone === zone && place.rowNumber === row && place.col === col) return true;
  }
  for (const element of state.elements.values()) {
    if (element.elementId === ignoreElementId || !isRect(element.kind) || element.zone !== zone || element.rowNumber !== row) continue;
    if (col >= (element.colStart ?? 0) && col <= (element.colEnd ?? element.colStart ?? 0)) return true;
  }
  return false;
}

function assertCell(zone: unknown, row: unknown, col: unknown): asserts zone is SpotZone {
  if (!spotZones.includes(zone as SpotZone)) throw invalidOp('zone must be riva, ombrelloni or monte');
  if (!Number.isInteger(row) || (row as number) < 1 || (row as number) > 200) throw invalidOp('row must be a whole number from 1 to 200');
  if (!Number.isInteger(col) || (col as number) < 1 || (col as number) > maxColumns) throw invalidOp(`col must be a whole number from 1 to ${maxColumns}`);
}

function assertPatchForm(patch: DraftSpotPatch): void {
  if (typeof patch !== 'object' || patch === null) throw invalidOp('edit_spot needs its patch');
  const known = ['code', 'typeId', 'umbrellas', 'sunbeds', 'maxGuests', 'namedZoneId', 'maintenance', 'rentalType', 'rentalNotes'];
  const keys = Object.keys(patch).filter((key) => (patch as Record<string, unknown>)[key] !== undefined);
  if (keys.length === 0) throw invalidOp('edit_spot changes nothing');
  for (const key of keys) if (!known.includes(key)) throw invalidOp(`edit_spot does not know «${key}»`);
  if (patch.code !== undefined && (typeof patch.code !== 'string' || !/^[A-Z0-9][A-Z0-9-]{0,9}$/.test(patch.code))) throw invalidOp('code must be 1 to 10 characters, A-Z, 0-9 or dash');
  for (const [name, value] of [['umbrellas', patch.umbrellas], ['sunbeds', patch.sunbeds], ['maxGuests', patch.maxGuests]] as const) {
    if (value !== undefined && (!Number.isInteger(value) || value < 0 || value > 20)) throw invalidOp(`${name} must be a whole number between 0 and 20`);
  }
  if (patch.maxGuests !== undefined && patch.maxGuests < 1) throw invalidOp('maxGuests must be at least 1');
  if (patch.maintenance !== undefined && typeof patch.maintenance !== 'boolean') throw invalidOp('maintenance must be true or false');
  if (patch.rentalType != null && (typeof patch.rentalType !== 'string' || patch.rentalType.length === 0 || patch.rentalType.length > rentalTypeMaxLength)) throw invalidOp(`rentalType must have 1 to ${rentalTypeMaxLength} characters`);
  if (patch.rentalNotes != null && (typeof patch.rentalNotes !== 'string' || patch.rentalNotes.length === 0 || patch.rentalNotes.length > rentalNotesMaxLength)) throw invalidOp(`rentalNotes must have 1 to ${rentalNotesMaxLength} characters`);
}

/** The next row of a zone in the draft, exactly as the bulk generation would compute it on the real table (D34). */
function nextRowOf(state: DraftMachine, zone: SpotZone): number {
  let max = 0;
  for (const place of state.spots.values()) if (place.zone === zone && place.rowNumber > max) max = place.rowNumber;
  return max + 1;
}

const zoneLetter: Record<SpotZone, string> = { riva: 'R', ombrelloni: 'O', monte: 'M' };

/** What the apply must do for one op, with every reference resolved against the pre-op draft state. */
type ResolvedOp =
  | { kind: 'create_spot'; syntheticId: string; input: { zone: SpotZone; code: string; rowNumber: number; col: number; typeId?: string; umbrellas?: number; sunbeds?: number; maxGuests?: number } }
  | { kind: 'create_grid'; syntheticIds: string[]; input: { zone: SpotZone; prefix: string; rows: number; perRow: number; typeId?: string; umbrellas?: number; sunbeds?: number; maxGuests?: number } }
  | { kind: 'move_spot'; spotId: string; zone: SpotZone; rowNumber: number; col: number }
  | { kind: 'edit_spot'; spotId: string; patch: DraftSpotPatch }
  | { kind: 'delete_spot'; spotId: string }
  | { kind: 'add_element'; syntheticId: string; input: NewElement }
  | { kind: 'move_element'; elementId: string; zone: SpotZone | null; rowNumber?: number; rowAfter?: number; colStart: number }
  | { kind: 'remove_element'; elementId: string }
  | { kind: 'assign_zone'; spotId: string; zoneId: string | null };

/**
 * Validates one op against the draft state (form, existence, cell inside the
 * grid, EVIDENT collisions), applies it to the state in memory and says what the
 * apply must do. Throws the dedicated draft errors; writes nothing.
 */
function reduceOp(state: DraftMachine, op: DraftOp, index: number): { description: DraftOpDescription; resolved: ResolvedOp } {
  switch (op.op) {
    case 'create_spot': {
      assertCell(op.zone, op.row, op.col);
      if (op.typeId !== undefined && !state.types.has(op.typeId)) throw invalidOp('Spot type not found');
      const code = op.code ?? `${zoneLetter[op.zone]}${op.row}-${op.col}`;
      if (!/^[A-Z0-9][A-Z0-9-]{0,9}$/.test(code)) throw invalidOp('code must be 1 to 10 characters, A-Z, 0-9 or dash');
      for (const place of state.spots.values()) if (place.code === code) throw new DomainError('code_taken', `A spot with code ${code} already exists in the draft`);
      if (cellTaken(state, op.zone, op.row, op.col)) throw new DomainError('draft_cell_taken', `Cell ${op.zone}/${op.row}/${op.col} is already taken in the draft`);
      const type = op.typeId ? state.types.get(op.typeId)! : undefined;
      const syntheticId = `draft-${index}`;
      state.spots.set(syntheticId, {
        spotId: syntheticId,
        code,
        zone: op.zone,
        rowNumber: op.row,
        col: op.col,
        typeId: op.typeId ?? '',
        typeName: type?.name ?? (op.zone === 'ombrelloni' ? 'Ombrellone' : 'Lettino singolo'),
        typeMark: type?.mark ?? (op.zone === 'ombrelloni' ? 'umbrella' : 'sunbed'),
        umbrellas: op.umbrellas ?? type?.umbrellas ?? (op.zone === 'ombrelloni' ? 1 : 0),
        sunbeds: op.sunbeds ?? type?.sunbeds ?? (op.zone === 'ombrelloni' ? 2 : 1),
        maxGuests: op.maxGuests ?? type?.maxGuests ?? 2,
        rentalType: null,
        rentalNotes: null,
        retired: false,
        maintenance: false,
        namedZoneId: null,
        zoneName: null,
        draftOnly: true,
      });
      return {
        description: { action: 'create_spot', code, zone: op.zone, row: op.row, col: op.col, typeName: type?.name ?? null },
        resolved: { kind: 'create_spot', syntheticId, input: { zone: op.zone, code, rowNumber: op.row, col: op.col, typeId: op.typeId, umbrellas: op.umbrellas, sunbeds: op.sunbeds, maxGuests: op.maxGuests } },
      };
    }
    case 'create_grid': {
      if (!spotZones.includes(op.zone)) throw invalidOp('zone must be riva, ombrelloni or monte');
      if (typeof op.prefix !== 'string' || !/^[A-Z]{1,4}$/.test(op.prefix)) throw invalidOp('prefix must be 1 to 4 capital letters');
      if (op.typeId !== undefined && !state.types.has(op.typeId)) throw invalidOp('Spot type not found');
      if (!Number.isInteger(op.cols) || op.cols < 1 || op.cols > maxColumns) throw invalidOp(`cols must be a whole number from 1 to ${maxColumns}`);
      let codes: string[];
      try {
        // EXACTLY the bulk generation of D34 and its automatic numbering.
        codes = bulkRowCodes({ prefix: op.prefix, rows: op.rows, perRow: op.cols });
      } catch (error) {
        throw invalidOp(error instanceof Error ? error.message : 'rows × cols out of bounds');
      }
      const firstRow = nextRowOf(state, op.zone);
      if (op.fromRow !== undefined && op.fromRow !== firstRow) {
        throw invalidOp(`a grid appends after the last row of the zone (D34): the next row is ${firstRow}`);
      }
      const taken = new Set([...state.spots.values()].map((place) => place.code));
      for (const code of codes) if (taken.has(code)) throw new DomainError('code_taken', `A spot with code ${code} already exists in the draft`);
      const type = op.typeId ? state.types.get(op.typeId)! : undefined;
      const syntheticIds: string[] = [];
      for (const [position, code] of codes.entries()) {
        const syntheticId = `draft-${index}-${position + 1}`;
        syntheticIds.push(syntheticId);
        state.spots.set(syntheticId, {
          spotId: syntheticId,
          code,
          zone: op.zone,
          rowNumber: firstRow + Math.floor(position / op.cols),
          col: (position % op.cols) + 1,
          typeId: op.typeId ?? '',
          typeName: type?.name ?? (op.zone === 'ombrelloni' ? 'Ombrellone' : 'Lettino singolo'),
          typeMark: type?.mark ?? (op.zone === 'ombrelloni' ? 'umbrella' : 'sunbed'),
          umbrellas: op.umbrellas ?? type?.umbrellas ?? (op.zone === 'ombrelloni' ? 1 : 0),
          sunbeds: op.sunbeds ?? type?.sunbeds ?? (op.zone === 'ombrelloni' ? 2 : 1),
          maxGuests: op.maxGuests ?? type?.maxGuests ?? 2,
          rentalType: null,
          rentalNotes: null,
          retired: false,
          maintenance: false,
          namedZoneId: null,
          zoneName: null,
          draftOnly: true,
        });
      }
      return {
        description: { action: 'create_grid', zone: op.zone, fromRow: firstRow, rows: op.rows, cols: op.cols, spots: codes.length, firstCode: codes[0], lastCode: codes[codes.length - 1], typeName: type?.name ?? null },
        resolved: { kind: 'create_grid', syntheticIds, input: { zone: op.zone, prefix: op.prefix, rows: op.rows, perRow: op.cols, typeId: op.typeId, umbrellas: op.umbrellas, sunbeds: op.sunbeds, maxGuests: op.maxGuests } },
      };
    }
    case 'move_spot': {
      const place = state.spots.get(op.spotId);
      if (!place) throw new DomainError('draft_spot_missing', 'This spot is not in the draft');
      assertCell(op.zone, op.row, op.col);
      if (cellTaken(state, op.zone, op.row, op.col, op.spotId)) throw new DomainError('draft_cell_taken', `Cell ${op.zone}/${op.row}/${op.col} is already taken in the draft`);
      const from = { zone: place.zone, row: place.rowNumber, col: place.col };
      place.zone = op.zone;
      place.rowNumber = op.row;
      place.col = op.col;
      return {
        description: { action: 'move_spot', code: place.code, from, to: { zone: op.zone, row: op.row, col: op.col } },
        resolved: { kind: 'move_spot', spotId: op.spotId, zone: op.zone, rowNumber: op.row, col: op.col },
      };
    }
    case 'edit_spot': {
      const place = state.spots.get(op.spotId);
      if (!place) throw new DomainError('draft_spot_missing', 'This spot is not in the draft');
      assertPatchForm(op.patch);
      if (op.patch.typeId !== undefined && !state.types.has(op.patch.typeId)) throw invalidOp('Spot type not found');
      if (op.patch.namedZoneId != null && !state.zones.has(op.patch.namedZoneId)) throw new DomainError('draft_zone_missing', 'This named zone is not in the draft');
      if (op.patch.code !== undefined && op.patch.code !== place.code) {
        for (const other of state.spots.values()) if (other.code === op.patch.code) throw new DomainError('code_taken', `A spot with code ${op.patch.code} already exists in the draft`);
      }
      const changes = Object.keys(op.patch).filter((key) => (op.patch as Record<string, unknown>)[key] !== undefined);
      const type = op.patch.typeId ? state.types.get(op.patch.typeId)! : undefined;
      const description: DraftOpDescription = { action: 'edit_spot', code: place.code, changes, patch: { ...op.patch }, typeName: type?.name ?? null, zoneName: op.patch.namedZoneId != null ? state.zones.get(op.patch.namedZoneId)! : null };
      if (op.patch.code !== undefined) place.code = op.patch.code;
      if (type && op.patch.typeId) {
        place.typeId = op.patch.typeId;
        place.typeName = type.name;
        place.typeMark = type.mark;
      }
      if (op.patch.umbrellas !== undefined) place.umbrellas = op.patch.umbrellas;
      if (op.patch.sunbeds !== undefined) place.sunbeds = op.patch.sunbeds;
      if (op.patch.maxGuests !== undefined) place.maxGuests = op.patch.maxGuests;
      if (op.patch.maintenance !== undefined) place.maintenance = op.patch.maintenance;
      if (op.patch.rentalType !== undefined) place.rentalType = op.patch.rentalType;
      if (op.patch.rentalNotes !== undefined) place.rentalNotes = op.patch.rentalNotes;
      if (op.patch.namedZoneId !== undefined) {
        place.namedZoneId = op.patch.namedZoneId;
        place.zoneName = op.patch.namedZoneId === null ? null : (state.zones.get(op.patch.namedZoneId) ?? null);
      }
      return { description, resolved: { kind: 'edit_spot', spotId: op.spotId, patch: op.patch } };
    }
    case 'delete_spot': {
      const place = state.spots.get(op.spotId);
      if (!place) throw new DomainError('draft_spot_missing', 'This spot is not in the draft');
      state.spots.delete(op.spotId);
      return { description: { action: 'delete_spot', code: place.code, zone: place.zone, row: place.rowNumber, col: place.col }, resolved: { kind: 'delete_spot', spotId: op.spotId } };
    }
    case 'add_element': {
      const label = typeof op.label === 'string' ? op.label.trim() || null : null;
      const span = op.span ?? 1;
      if (!Number.isInteger(span) || span < 1 || span > maxColumns) throw invalidOp(`span must be a whole number from 1 to ${maxColumns}`);
      let input: NewElement;
      if (op.kind === 'walkway') {
        if (!walkwayOrientations.includes(op.orientation as WalkwayOrientation)) throw invalidOp('a walkway is horizontal or vertical');
        if (op.orientation === 'horizontal') {
          if (!spotZones.includes(op.zone as SpotZone)) throw invalidOp('a horizontal walkway needs its zone');
          if (!Number.isInteger(op.row) || op.row < 0 || op.row > 200) throw invalidOp('row must be a whole number from 0 to 200 (0 = before row 1)');
          if (!Number.isInteger(op.col) || op.col < 1 || op.col + span - 1 > maxColumns) throw invalidOp(`the walkway must stay inside columns 1 to ${maxColumns}`);
          input = { kind: 'walkway', orientation: 'horizontal', zone: op.zone, rowAfter: op.row, colStart: op.col, colEnd: op.col + span - 1, label };
        } else {
          if (!Number.isInteger(op.col) || op.col < 1 || op.col > maxColumns) throw invalidOp(`col must be a whole number from 1 to ${maxColumns}`);
          input = { kind: 'walkway', orientation: 'vertical', zone: op.zone ?? null, colStart: op.col, label };
        }
      } else if (op.kind === 'decoration') {
        if (!op.sign || !allDecorationSigns.includes(op.sign)) throw invalidOp('a decoration needs its sign from the repertoire');
        assertCell(op.zone, op.row, op.col);
        if (cellTaken(state, op.zone, op.row, op.col)) throw new DomainError('draft_cell_taken', `Cell ${op.zone}/${op.row}/${op.col} is already taken in the draft`);
        input = { kind: 'decoration', zone: op.zone, rowNumber: op.row, colStart: op.col, sign: op.sign, label };
      } else if (op.kind === 'structure' || op.kind === 'cabin_block') {
        if (op.kind === 'structure' && label === null) throw invalidOp('a structure needs its label');
        assertCell(op.zone, op.row, op.col);
        if (op.col + span - 1 > maxColumns) throw invalidOp(`the element must stay inside columns 1 to ${maxColumns}`);
        for (let col = op.col; col <= op.col + span - 1; col += 1) {
          if (cellTaken(state, op.zone, op.row, col)) throw new DomainError('draft_cell_taken', `Cell ${op.zone}/${op.row}/${col} is already taken in the draft`);
        }
        input = { kind: op.kind, zone: op.zone, rowNumber: op.row, colStart: op.col, colEnd: op.col + span - 1, label };
      } else {
        throw invalidOp('kind must be walkway, cabin_block, structure or decoration');
      }
      const syntheticId = `draft-${index}`;
      state.elements.set(syntheticId, {
        elementId: syntheticId,
        kind: input.kind,
        label: input.label ?? null,
        orientation: input.kind === 'walkway' ? (input.orientation ?? null) : null,
        zone: input.zone ?? null,
        rowAfter: input.rowAfter ?? null,
        rowNumber: input.rowNumber ?? null,
        colStart: input.colStart ?? null,
        colEnd: input.colEnd ?? null,
        sign: input.sign ?? null,
        draftOnly: true,
      });
      return {
        description: { action: 'add_element', kind: op.kind, sign: op.sign ?? null, label, zone: op.zone ?? null, row: op.row, col: op.col, span },
        resolved: { kind: 'add_element', syntheticId, input },
      };
    }
    case 'move_element': {
      const element = state.elements.get(op.elementId);
      if (!element) throw new DomainError('draft_element_missing', 'This element is not in the draft');
      const width = element.colEnd !== null && element.colStart !== null ? element.colEnd - element.colStart : 0;
      if (!Number.isInteger(op.col) || op.col < 1 || op.col + width > maxColumns) throw invalidOp(`the element must stay inside columns 1 to ${maxColumns}`);
      if (element.kind === 'walkway' && element.orientation === 'horizontal') {
        if (!spotZones.includes(op.zone as SpotZone)) throw invalidOp('a horizontal walkway needs its zone');
        if (!Number.isInteger(op.row) || op.row < 0 || op.row > 200) throw invalidOp('row must be a whole number from 0 to 200 (0 = before row 1)');
      } else if (element.kind !== 'walkway') {
        assertCell(op.zone, op.row, op.col);
        for (let col = op.col; col <= op.col + width; col += 1) {
          if (cellTaken(state, op.zone as SpotZone, op.row, col, undefined, op.elementId)) throw new DomainError('draft_cell_taken', `Cell ${op.zone}/${op.row}/${col} is already taken in the draft`);
        }
      }
      const from = { zone: element.zone, row: element.rowNumber ?? element.rowAfter, col: element.colStart };
      element.zone = op.zone;
      if (element.kind === 'walkway' && element.orientation === 'horizontal') element.rowAfter = op.row;
      else if (element.kind !== 'walkway') element.rowNumber = op.row;
      element.colStart = op.col;
      element.colEnd = element.colEnd === null ? null : op.col + width;
      return {
        description: { action: 'move_element', kind: element.kind, label: element.label, sign: element.sign, from, to: { zone: op.zone, row: op.row, col: op.col } },
        resolved: {
          kind: 'move_element',
          elementId: op.elementId,
          zone: op.zone,
          rowNumber: element.kind === 'walkway' ? undefined : op.row,
          rowAfter: element.kind === 'walkway' && element.orientation === 'horizontal' ? op.row : undefined,
          colStart: op.col,
        },
      };
    }
    case 'remove_element': {
      const element = state.elements.get(op.elementId);
      if (!element) throw new DomainError('draft_element_missing', 'This element is not in the draft');
      state.elements.delete(op.elementId);
      return { description: { action: 'remove_element', kind: element.kind, label: element.label, sign: element.sign }, resolved: { kind: 'remove_element', elementId: op.elementId } };
    }
    case 'assign_zone': {
      const place = state.spots.get(op.spotId);
      if (!place) throw new DomainError('draft_spot_missing', 'This spot is not in the draft');
      if (op.zoneId !== null && !state.zones.has(op.zoneId)) throw new DomainError('draft_zone_missing', 'This named zone is not in the draft');
      place.namedZoneId = op.zoneId;
      place.zoneName = op.zoneId === null ? null : (state.zones.get(op.zoneId) ?? null);
      return {
        description: { action: 'assign_zone', code: place.code, zoneName: place.zoneName },
        resolved: { kind: 'assign_zone', spotId: op.spotId, zoneId: op.zoneId },
      };
    }
    default:
      throw invalidOp('unknown operation');
  }
}

const zonePreviewOrder: Record<SpotZone, number> = { riva: 0, ombrelloni: 1, monte: 2 };

function previewOf(state: DraftMachine): DraftPreview {
  const spots = [...state.spots.values()].sort((left, right) => zonePreviewOrder[left.zone] - zonePreviewOrder[right.zone] || left.rowNumber - right.rowNumber || left.col - right.col);
  const elements = [...state.elements.values()].sort(
    (left, right) =>
      (left.zone === null ? 3 : zonePreviewOrder[left.zone]) - (right.zone === null ? 3 : zonePreviewOrder[right.zone]) ||
      (left.rowAfter ?? 0) - (right.rowAfter ?? 0) ||
      (left.rowNumber ?? 0) - (right.rowNumber ?? 0) ||
      (left.colStart ?? 0) - (right.colStart ?? 0),
  );
  return { seaSide: state.layout.seaSide, shoreGapRows: state.layout.shoreGapRows, landGapRows: state.layout.landGapRows, spots, elements };
}

function draftOps(row: { ops: unknown } | undefined): DraftOp[] {
  return Array.isArray(row?.ops) ? (row.ops as DraftOp[]) : [];
}

/** Creates the (single) draft row of the beach club if need be, and locks it: appends, undo and apply are serialized. */
async function lockDraft(tx: Transaction, beachId: string): Promise<DraftOp[]> {
  await tx.insert(layoutDraft).values({ beachId }).onConflictDoNothing();
  const [row] = await tx.select({ ops: layoutDraft.ops }).from(layoutDraft).where(eq(layoutDraft.beachId, beachId)).for('update');
  return draftOps(row);
}

/**
 * The draft with its preview (D57): the stored ops, each with its structured
 * description, and the layout WITH the ops applied in memory. An op the real
 * layout no longer allows is marked stale and skipped by the preview; the
 * public pages never see any of this.
 */
export function getDraft(db: Database, actor: Actor): Promise<DraftView> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const [row] = await tx.select({ ops: layoutDraft.ops, updatedBy: layoutDraft.updatedBy, updatedAt: layoutDraft.updatedAt }).from(layoutDraft).where(eq(layoutDraft.beachId, actor.beachId));
    const ops = draftOps(row);
    const state = await loadMachine(tx, actor);
    const views: DraftOpView[] = [];
    for (const [index, op] of ops.entries()) {
      try {
        const { description } = reduceOp(state, op, index);
        views.push({ op, description, stale: false });
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        views.push({ op, description: { action: op.op, reason: error.code }, stale: true });
      }
    }
    return { ops: views, updatedBy: row?.updatedBy ?? null, updatedAt: row?.updatedAt ?? null, preview: previewOf(state) };
  });
}

/**
 * Validates one op against the current draft (form, existence, cell inside the
 * grid, EVIDENT collisions) and appends it (D57). Nothing touches the beach:
 * only «Salva la spiaggia» does.
 */
export function appendOp(db: Database, actor: Actor, op: DraftOp): Promise<{ index: number; description: DraftOpDescription }> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const ops = await lockDraft(tx, actor.beachId);
    if (ops.length >= draftMaxOps) throw new DomainError('cap_reached', `A draft may hold at most ${draftMaxOps} operations: save or discard it first`);
    const state = await loadMachine(tx, actor);
    for (const [index, stored] of ops.entries()) {
      try {
        reduceOp(state, stored, index);
      } catch (error) {
        // A stored op gone stale stays in the list (the summary shows it); the new op is validated on what remains.
        if (!(error instanceof DomainError)) throw error;
      }
    }
    const { description } = reduceOp(state, op, ops.length);
    await tx
      .update(layoutDraft)
      .set({ ops: [...ops, op], updatedBy: actor.userId, updatedAt: sql`now()` })
      .where(eq(layoutDraft.beachId, actor.beachId));
    return { index: ops.length, description };
  });
}

/** «Annulla l'ultima operazione»: takes the last op off the draft (D57). */
export function undoLastOp(db: Database, actor: Actor): Promise<{ removed: DraftOp; remaining: number }> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const ops = await lockDraft(tx, actor.beachId);
    const removed = ops.pop();
    if (!removed) throw new DomainError('draft_empty', 'The draft has no operation to undo');
    await tx
      .update(layoutDraft)
      .set({ ops, updatedBy: actor.userId, updatedAt: sql`now()` })
      .where(eq(layoutDraft.beachId, actor.beachId));
    return { removed, remaining: ops.length };
  });
}

/** «Scarta la bozza»: empties it (D57). Harmless on an already empty draft. */
export function discardDraft(db: Database, actor: Actor): Promise<{ discarded: number }> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const ops = await lockDraft(tx, actor.beachId);
    await tx
      .update(layoutDraft)
      .set({ ops: [], updatedBy: actor.userId, updatedAt: sql`now()` })
      .where(eq(layoutDraft.beachId, actor.beachId));
    return { discarded: ops.length };
  });
}

/**
 * «Salva la spiaggia» (D57): applies the draft in ONE transaction, op by op and
 * in order, with the existing domain functions — creation, bulk generation
 * (D34), update, deletion, elements, zone assignment — plus moveSpot (D60) and
 * the maintenance patch (D56). If ONE op fails, NOTHING is applied and the
 * error names the op (failedIndex) and the reason. On success the draft is
 * emptied and ONE audit event `layout.saved` carries the count per op kind.
 */
export function applyDraft(db: Database, actor: Actor): Promise<{ applied: Record<string, number>; total: number }> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const ops = await lockDraft(tx, actor.beachId);
    if (ops.length === 0) throw new DomainError('draft_empty', 'The draft has no operation to apply');
    const state = await loadMachine(tx, actor);
    // Synthetic ids of spots and elements the draft creates → the real ids the apply creates.
    const realIds = new Map<string, string>();
    const realId = (id: string) => realIds.get(id) ?? id;
    const applied: Record<string, number> = {};
    for (const [index, op] of ops.entries()) {
      try {
        const { resolved } = reduceOp(state, op, index);
        switch (resolved.kind) {
          case 'create_spot': {
            const { spotId } = await addSpotWithin(tx, actor, resolved.input);
            realIds.set(resolved.syntheticId, spotId);
            break;
          }
          case 'create_grid': {
            const { spotIds } = await addRowsWithin(tx, actor, resolved.input);
            for (const [position, syntheticId] of resolved.syntheticIds.entries()) realIds.set(syntheticId, spotIds[position]!);
            break;
          }
          case 'move_spot':
            await moveSpotWithin(tx, actor, { spotId: realId(resolved.spotId), zone: resolved.zone, rowNumber: resolved.rowNumber, col: resolved.col });
            break;
          case 'edit_spot': {
            const spotId = realId(resolved.spotId);
            const { typeId, namedZoneId, ...plain } = resolved.patch;
            if (typeId !== undefined) await setSpotTypeWithin(tx, actor, { spotId, typeId });
            if (namedZoneId !== undefined) await assignZoneToSpotWithin(tx, actor, { spotId, zoneId: namedZoneId });
            if (Object.values(plain).some((value) => value !== undefined)) await updateSpotWithin(tx, actor, { spotId, ...plain });
            break;
          }
          case 'delete_spot':
            await deletePlannedSpotWithin(tx, actor, { spotId: realId(resolved.spotId) });
            break;
          case 'add_element': {
            const { elementId } = await addElementWithin(tx, actor, resolved.input);
            realIds.set(resolved.syntheticId, elementId);
            break;
          }
          case 'move_element':
            await moveElementWithin(tx, actor, { elementId: realId(resolved.elementId), zone: resolved.zone, rowNumber: resolved.rowNumber, rowAfter: resolved.rowAfter, colStart: resolved.colStart });
            break;
          case 'remove_element':
            await removeElementWithin(tx, actor, { elementId: realId(resolved.elementId) });
            break;
          case 'assign_zone':
            await assignZoneToSpotWithin(tx, actor, { spotId: realId(resolved.spotId), zoneId: resolved.zoneId });
            break;
        }
        applied[op.op] = (applied[op.op] ?? 0) + 1;
      } catch (error) {
        // ROLLBACK of everything: the error leaves the transaction and nothing of the draft lands.
        if (error instanceof DraftApplyError) throw error;
        if (error instanceof DomainError) throw new DraftApplyError(index, error.code, error.message);
        if (error instanceof RangeError) throw new DraftApplyError(index, 'draft_invalid_op', error.message);
        // A constraint the light validation missed (a code or cell race): named all the same.
        const code = (error as { code?: string; cause?: { code?: string } } | null)?.code ?? (error as { cause?: { code?: string } } | null)?.cause?.code;
        if (code === '23505') throw new DraftApplyError(index, 'draft_cell_taken', 'A cell or code of this operation has just been taken');
        throw error;
      }
    }
    await tx
      .update(layoutDraft)
      .set({ ops: [], updatedBy: actor.userId, updatedAt: sql`now()` })
      .where(eq(layoutDraft.beachId, actor.beachId));
    await tx.insert(auditEvent).values({ beachId: actor.beachId, actorUserId: actor.userId, action: 'layout.saved', target: null, detail: { ...applied, total: ops.length } });
    return { applied, total: ops.length };
  });
}
