import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { can } from '@ombre/shared';
import type { SpotMark } from '@ombre/shared';
import { withActor, type Database } from './client';
import { DomainError, zoneOrder, type SpotZone } from './inventory';
import type { Actor } from './manage';
import { booking, inventoryDay, spot, spotType } from './schema';

/** The planner never goes past a month per request (D33). */
export const plannerMaxDays = 31;

/**
 * State of one spot-day cell. In the model a booking is one spot for one day
 * (see stats.ts), so the grid is the faithful representation, not a summary.
 * A held day counts as free: a hold is not a booking and dies by itself.
 */
export type PlannerCellState = 'not_published' | 'free' | 'blocked' | 'not_for_sale' | 'booked';

export interface PlannerCell {
  day: string;
  state: PlannerCellState;
  /** Only on a booked cell, and only with the bookings.read permission; null otherwise. */
  bookingCode: string | null;
  guestName: string | null;
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
        guestName: booking.guestName,
      })
      .from(spot)
      .innerJoin(spotType, eq(spotType.id, spot.typeId))
      // The same join as the ledger reads: a sold day is its inventory row plus its live booking.
      .leftJoin(inventoryDay, and(eq(inventoryDay.spotId, spot.id), sql`${inventoryDay.day} between ${input.from} and ${input.to}`))
      .leftJoin(booking, and(eq(booking.inventoryDayId, inventoryDay.id), inArray(booking.status, ['confirmed', 'completed'])))
      .where(and(eq(spot.retired, false), ...(input.zone ? [eq(spot.zone, input.zone)] : [])))
      .orderBy(zoneOrder, asc(spot.rowNumber), asc(spot.col), asc(inventoryDay.day));

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
      });
    }
    for (const entry of spots) {
      entry.cells = days.map((day) => bySpot.get(entry.spotId)?.get(day) ?? { day, state: 'not_published', bookingCode: null, guestName: null });
    }
    return { from: input.from, to: input.to, days, spots };
  });
}
