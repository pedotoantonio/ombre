import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { can, canTransition } from '@ombre/shared';
import type { SpotMark } from '@ombre/shared';
import { paidCentsOf, paymentStateOf, type PaymentState } from './bookings';
import { withActor, type Database } from './client';
import { DomainError, zoneOrder, type SpotZone } from './inventory';
import type { Actor } from './manage';
import { auditEvent, booking, hold, inventoryDay, promotion, spot, spotType } from './schema';

/**
 * Operational state of a spot on a day, for the "Today on the beach" console.
 * It is derived, never stored: inventory state and active hold say whether the day
 * can still be sold; the booking presence and the access events say where the guest is.
 */
export type OperationalState = 'free' | 'reserved' | 'expected' | 'present' | 'departed' | 'blocked' | 'not_for_sale';

export interface OperationsSpot {
  spotId: string;
  code: string;
  zone: SpotZone;
  rowNumber: number;
  col: number;
  typeName: string;
  typeMark: SpotMark;
  umbrellas: number;
  sunbeds: number;
  maxGuests: number;
  state: OperationalState;
  /** Why the day cannot be sold; null for every other state. The console card looks the same, the table tells them apart. */
  notForSale: 'never_published' | 'withdrawn' | null;
  /** True on a day offered by a season holder: the S badge. */
  shared: boolean;
  priceCents: number | null;
  /** Only with the bookings.read permission; null otherwise. */
  guestName: string | null;
  /** Only with the bookings.read permission; null otherwise. */
  bookingCode: string | null;
}

export interface OperationsSummary {
  counts: Record<OperationalState, number>;
  /** Sold days whose guest has not entered yet. */
  expectedGuests: number;
  /** Guests currently inside. */
  presentGuests: number;
  /** Gross of the day's confirmed and completed bookings. Null without the reports.read permission. */
  revenueCents: number | null;
}

export interface DayOperations {
  day: string;
  spots: OperationsSpot[];
  summary: OperationsSummary;
}

interface StateSource {
  dayState: (typeof inventoryDay.$inferSelect)['state'] | null;
  holdLive: boolean;
  presence: (typeof booking.$inferSelect)['presence'] | null;
  entered: boolean;
}

/** The one reading of inventory, hold, presence and accesses: console and spot card agree by construction. */
function deriveState(row: StateSource): { state: OperationalState; notForSale: OperationsSpot['notForSale'] } {
  if (row.dayState === null) return { state: 'not_for_sale', notForSale: 'never_published' };
  if (row.dayState === 'unpublishable') return { state: 'not_for_sale', notForSale: 'withdrawn' };
  if (row.dayState === 'blocked') return { state: 'blocked', notForSale: null };
  if (row.dayState === 'held') {
    // A hold that has run out no longer reserves anything, even before a job cleans it.
    return { state: row.holdLive ? 'reserved' : 'free', notForSale: null };
  }
  if (row.dayState === 'occupied' && row.presence !== null) {
    if (row.presence === 'inside') return { state: 'present', notForSale: null };
    if (row.presence === 'outside_reentry_allowed') return { state: 'departed', notForSale: null };
    // At the end of the day every presence is 'ended': only the access trail
    // still tells a guest who came from one who never did.
    if (row.presence === 'ended') return { state: row.entered ? 'departed' : 'expected', notForSale: null };
    return { state: 'expected', notForSale: null };
  }
  // Occupied without a live booking should not happen; shown as a sold day.
  if (row.dayState === 'occupied') return { state: 'expected', notForSale: null };
  return { state: 'free', notForSale: null };
}

/**
 * The whole beach on one day, one card per spot, for manager and reception.
 * Guest surnames need bookings.read and the day's takings need reports.read:
 * the fields stay null for anyone else.
 */
export function listDayOperations(db: Database, actor: Actor, day: string): Promise<DayOperations> {
  const seeGuests = can(actor.role, 'bookings.read');
  const seeRevenue = can(actor.role, 'reports.read');
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
        umbrellas: spot.umbrellas,
        sunbeds: spot.sunbeds,
        maxGuests: spot.maxGuests,
        dayState: inventoryDay.state,
        priceCents: inventoryDay.priceCents,
        shared: inventoryDay.shared,
        holdLive: sql<boolean>`coalesce(${hold.status} = 'active' and ${hold.expiresAt} > now(), false)`,
        presence: booking.presence,
        guestName: booking.guestName,
        bookingCode: booking.code,
        totalCents: booking.totalCents,
        entered: sql<boolean>`coalesce(exists (select 1 from access_event e where e.booking_id = ${booking.id} and e.kind = 'entry'), false)`,
      })
      .from(spot)
      .innerJoin(spotType, eq(spotType.id, spot.typeId))
      .leftJoin(inventoryDay, and(eq(inventoryDay.spotId, spot.id), eq(inventoryDay.day, day)))
      .leftJoin(hold, eq(hold.id, inventoryDay.activeHoldId))
      .leftJoin(booking, and(eq(booking.inventoryDayId, inventoryDay.id), inArray(booking.status, ['confirmed', 'completed'])))
      .where(eq(spot.retired, false))
      .orderBy(zoneOrder, asc(spot.rowNumber), asc(spot.col));

    const counts: Record<OperationalState, number> = { free: 0, reserved: 0, expected: 0, present: 0, departed: 0, blocked: 0, not_for_sale: 0 };
    let revenueCents = 0;
    const spots = rows.map((row) => {
      const { state, notForSale } = deriveState(row);
      counts[state] += 1;
      if (row.totalCents !== null) revenueCents += row.totalCents;
      return {
        spotId: row.spotId,
        code: row.code,
        zone: row.zone,
        rowNumber: row.rowNumber,
        col: row.col,
        typeName: row.typeName,
        typeMark: row.typeMark,
        umbrellas: row.umbrellas,
        sunbeds: row.sunbeds,
        maxGuests: row.maxGuests,
        state,
        notForSale,
        shared: row.shared ?? false,
        priceCents: row.priceCents,
        guestName: seeGuests ? row.guestName : null,
        bookingCode: seeGuests ? row.bookingCode : null,
      };
    });

    return {
      day,
      spots,
      summary: {
        counts,
        expectedGuests: counts.expected,
        presentGuests: counts.present,
        revenueCents: seeRevenue ? revenueCents : null,
      },
    };
  });
}

export interface SpotCardBooking {
  code: string;
  guestName: string;
  /** Sale channel: 'online' or 'desk'. */
  source: string;
  presence: (typeof booking.$inferSelect)['presence'];
  /** Comprehensive, extras included; the residual follows the D31 payment model. */
  totalCents: number;
  paidCents: number;
  remainingCents: number;
  paymentState: PaymentState;
}

export interface SpotCard {
  day: string;
  spotId: string;
  code: string;
  zone: SpotZone;
  rowNumber: number;
  col: number;
  typeName: string;
  typeMark: SpotMark;
  umbrellas: number;
  sunbeds: number;
  maxGuests: number;
  /** Rental label of the spot («Stagionale», «Albergo» or a custom text): management data, never public. */
  rentalType: string | null;
  state: OperationalState;
  /** Why the day cannot be sold; null for every other state. */
  notForSale: 'never_published' | 'withdrawn' | null;
  /** The reason given with the block, from the audit trail; null when not blocked or none was given. */
  blockedReason: string | null;
  shared: boolean;
  priceCents: number | null;
  /** Only with the bookings.read permission; null otherwise, and null when the day is not sold. */
  booking: SpotCardBooking | null;
}

/**
 * The card of one spot on one day (spec §2, D32): the same derived state as the
 * console, plus the block reason and, on a sold day, the booking with its paid
 * and outstanding amounts under the D31 payment model. An unknown code, a retired
 * spot or a day never published answer with a DomainError, like the single-day
 * actions do.
 */
export function spotCard(db: Database, actor: Actor, input: { day: string; code: string }): Promise<SpotCard> {
  const seeBooking = can(actor.role, 'bookings.read');
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const [row] = await tx
      .select({
        spotId: spot.id,
        code: spot.code,
        zone: spot.zone,
        rowNumber: spot.rowNumber,
        col: spot.col,
        typeName: spotType.name,
        typeMark: spotType.mark,
        umbrellas: spot.umbrellas,
        sunbeds: spot.sunbeds,
        maxGuests: spot.maxGuests,
        rentalType: spot.rentalType,
        dayState: inventoryDay.state,
        priceCents: inventoryDay.priceCents,
        shared: inventoryDay.shared,
        holdLive: sql<boolean>`coalesce(${hold.status} = 'active' and ${hold.expiresAt} > now(), false)`,
        bookingId: booking.id,
        bookingCode: booking.code,
        guestName: booking.guestName,
        source: booking.source,
        presence: booking.presence,
        totalCents: booking.totalCents,
        entered: sql<boolean>`coalesce(exists (select 1 from access_event e where e.booking_id = ${booking.id} and e.kind = 'entry'), false)`,
      })
      .from(spot)
      .innerJoin(spotType, eq(spotType.id, spot.typeId))
      .leftJoin(inventoryDay, and(eq(inventoryDay.spotId, spot.id), eq(inventoryDay.day, input.day)))
      .leftJoin(hold, eq(hold.id, inventoryDay.activeHoldId))
      .leftJoin(booking, and(eq(booking.inventoryDayId, inventoryDay.id), inArray(booking.status, ['confirmed', 'completed'])))
      .where(and(eq(spot.code, input.code), eq(spot.retired, false)));
    if (!row) throw new DomainError('not_found', 'Spot not found');
    if (row.dayState === null) throw new DomainError('not_found', 'This day is not published for this spot');

    const { state, notForSale } = deriveState(row);

    let blockedReason: string | null = null;
    if (state === 'blocked') {
      const [blockedBy] = await tx
        .select({ reason: sql<string | null>`${auditEvent.detail} ->> 'reason'` })
        .from(auditEvent)
        .where(and(eq(auditEvent.action, 'inventory.block'), eq(auditEvent.target, `${row.spotId}/${input.day}`)))
        .orderBy(desc(auditEvent.createdAt))
        .limit(1);
      blockedReason = blockedBy?.reason ?? null;
    }

    let sold: SpotCardBooking | null = null;
    if (seeBooking && row.bookingId && row.bookingCode && row.guestName && row.source && row.presence && row.totalCents !== null) {
      const paidCents = await paidCentsOf(tx, row.bookingId);
      sold = {
        code: row.bookingCode,
        guestName: row.guestName,
        source: row.source,
        presence: row.presence,
        totalCents: row.totalCents,
        paidCents,
        remainingCents: Math.max(0, row.totalCents - paidCents),
        paymentState: paymentStateOf(row.totalCents, paidCents),
      };
    }

    return {
      day: input.day,
      spotId: row.spotId,
      code: row.code,
      zone: row.zone,
      rowNumber: row.rowNumber,
      col: row.col,
      typeName: row.typeName,
      typeMark: row.typeMark,
      umbrellas: row.umbrellas,
      sunbeds: row.sunbeds,
      maxGuests: row.maxGuests,
      rentalType: row.rentalType,
      state,
      notForSale,
      blockedReason,
      shared: row.shared ?? false,
      priceCents: row.priceCents,
      booking: sold,
    };
  });
}

export type BulkRefusalReason = 'not_published' | 'held' | 'occupied' | 'not_blocked';

export interface BulkBlockResult {
  /** Spots now in the requested state, the ones that already were included. */
  done: number;
  refused: { spotId: string; reason: BulkRefusalReason }[];
}

/**
 * Blocks or unblocks many spots of one day in a single transaction, with the same
 * rules as the single block: a held or sold day is refused, never forced. The rows
 * are locked in a stable order; the outcome says what was done and what was refused
 * and why. One audit entry per spot that really changed, like the single action.
 */
export function setBlockedBulk(db: Database, actor: Actor, input: { day: string; spotIds: string[]; blocked: boolean; reason?: string }): Promise<BulkBlockResult> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const unique = [...new Set(input.spotIds)];
    const rows = await tx
      .select()
      .from(inventoryDay)
      .where(and(eq(inventoryDay.day, input.day), inArray(inventoryDay.spotId, unique)))
      .orderBy(asc(inventoryDay.id))
      .for('update');
    const bySpot = new Map(rows.map((row) => [row.spotId, row]));

    const result: BulkBlockResult = { done: 0, refused: [] };
    const target = input.blocked ? ('blocked' as const) : ('available' as const);
    for (const spotId of unique) {
      const row = bySpot.get(spotId);
      if (!row) {
        result.refused.push({ spotId, reason: 'not_published' });
        continue;
      }
      let state = row.state;
      if (state === 'held' && row.activeHoldId) {
        // A run out hold is free: it is expired here, exactly as a new buyer would do.
        const [lapsed] = await tx
          .update(hold)
          .set({ status: 'expired' })
          .where(and(eq(hold.id, row.activeHoldId), eq(hold.status, 'active'), sql`${hold.expiresAt} <= now()`))
          .returning({ promotionId: hold.promotionId });
        if (lapsed) {
          if (lapsed.promotionId) {
            await tx.update(promotion).set({ committedUses: sql`${promotion.committedUses} - 1` }).where(eq(promotion.id, lapsed.promotionId));
          }
          await tx.update(inventoryDay).set({ state: 'available', activeHoldId: null, updatedAt: sql`now()` }).where(eq(inventoryDay.id, row.id));
          state = 'available';
        }
      }
      if (state === target) {
        result.done += 1;
        continue;
      }
      if (!input.blocked && state !== 'blocked') {
        result.refused.push({ spotId, reason: 'not_blocked' });
        continue;
      }
      if (!canTransition('inventory', state, target)) {
        result.refused.push({ spotId, reason: state === 'held' ? 'held' : 'occupied' });
        continue;
      }
      await tx.update(inventoryDay).set({ state: target, updatedAt: sql`now()` }).where(eq(inventoryDay.id, row.id));
      await tx.insert(auditEvent).values({
        beachId: actor.beachId,
        actorUserId: actor.userId,
        action: input.blocked ? 'inventory.block' : 'inventory.unblock',
        target: `${spotId}/${input.day}`,
        detail: { reason: input.reason ?? null, bulk: true },
      });
      result.done += 1;
    }
    return result;
  });
}
