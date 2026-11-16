import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { SpotMark } from '@ombre/shared';
import { withActor, type Database } from './client';
import { zoneOrder, type SpotZone } from './inventory';
import type { Actor } from './manage';
import { beach, booking, inventoryDay, payment, spot, spotType } from './schema';

/** Figures only, never a guest: the statistics page shows numbers, not people. */
export interface SpotFigures {
  spotId: string;
  code: string;
  zone: SpotZone;
  rowNumber: number;
  col: number;
  /** Days of the period the spot was on sale (blocked ones included, withdrawn and never published ones not). */
  publishedDays: number;
  soldDays: number;
  grossCents: number;
  /** Occupancy of this spot in basis points; null when nothing was published. */
  rateBps: number | null;
}

export interface StatisticsReport {
  from: string;
  to: string;
  /** Time zone the period boundaries are meant in, so the caller can anchor "today". */
  timezone: string;
  /** Sold days: one booking is one spot for one day. Confirmed and completed only. */
  soldDays: number;
  grossCents: number;
  /** Cancelled bookings of the period, counted apart. */
  cancelled: { bookings: number; grossCents: number };
  /** Average basket: gross / sold bookings, rounded to the cent. Null without sales. */
  averageCents: number | null;
  /** Sold days over published days. Blocked days stay in the denominator (declared on the page). */
  occupancy: { soldDays: number; publishedDays: number; rateBps: number | null };
  byChannel: { source: string; bookings: number; grossCents: number }[];
  byPaymentStatus: { status: string; bookings: number }[];
  /** Arrivals come from the access events, never from the presence, which ends every evening. */
  arrivals: { arrived: number; notArrived: number };
  byType: { typeId: string; name: string; mark: SpotMark; soldDays: number; grossCents: number }[];
  /** Best and worst earning spots among those on sale in the period, five each. */
  topSpots: SpotFigures[];
  bottomSpots: SpotFigures[];
  /** Every active spot with its occupancy, for the heatmap and its table. */
  heatmap: SpotFigures[];
}

const soldStatuses = ['confirmed', 'completed'] as const;

/**
 * Aggregates of a period for the statistics page (reports.read). Everything is
 * computed from the database; the answer carries numbers only, no guest data.
 */
export function statisticsReport(db: Database, actor: Actor, from: string, to: string): Promise<StatisticsReport> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const dayInPeriod = sql`${inventoryDay.day} between ${from} and ${to}`;
    const sold = and(dayInPeriod, inArray(booking.status, [...soldStatuses]));

    const [zone] = await tx.select({ timezone: beach.timezone }).from(beach).where(eq(beach.id, actor.beachId));

    const [totals] = await tx
      .select({ bookings: sql<number>`count(*)::int`, grossCents: sql<number>`coalesce(sum(${booking.totalCents}), 0)::int` })
      .from(booking)
      .innerJoin(inventoryDay, eq(inventoryDay.id, booking.inventoryDayId))
      .where(sold);
    const [cancelled] = await tx
      .select({ bookings: sql<number>`count(*)::int`, grossCents: sql<number>`coalesce(sum(${booking.totalCents}), 0)::int` })
      .from(booking)
      .innerJoin(inventoryDay, eq(inventoryDay.id, booking.inventoryDayId))
      .where(and(dayInPeriod, eq(booking.status, 'cancelled')));
    const [published] = await tx
      .select({ days: sql<number>`count(*)::int` })
      .from(inventoryDay)
      .where(and(dayInPeriod, ne(inventoryDay.state, 'unpublishable')));

    const byChannel = await tx
      .select({ source: booking.source, bookings: sql<number>`count(*)::int`, grossCents: sql<number>`coalesce(sum(${booking.totalCents}), 0)::int` })
      .from(booking)
      .innerJoin(inventoryDay, eq(inventoryDay.id, booking.inventoryDayId))
      .where(sold)
      .groupBy(booking.source)
      .orderBy(asc(booking.source));
    const byPaymentStatus = await tx
      .select({ status: sql<string>`${payment.status}::text`, bookings: sql<number>`count(distinct ${booking.id})::int` })
      .from(booking)
      .innerJoin(inventoryDay, eq(inventoryDay.id, booking.inventoryDayId))
      .innerJoin(payment, eq(payment.bookingId, booking.id))
      .where(sold)
      .groupBy(payment.status)
      .orderBy(asc(sql`${payment.status}::text`));
    // A booking has arrived when at least one entry was registered at the desk.
    const [arrived] = await tx
      .select({ bookings: sql<number>`count(*)::int` })
      .from(booking)
      .innerJoin(inventoryDay, eq(inventoryDay.id, booking.inventoryDayId))
      .where(and(sold, sql`exists (select 1 from access_event e where e.booking_id = ${booking.id} and e.kind = 'entry')`));

    const byType = await tx
      .select({
        typeId: spotType.id,
        name: spotType.name,
        mark: spotType.mark,
        soldDays: sql<number>`count(*)::int`,
        grossCents: sql<number>`coalesce(sum(${booking.totalCents}), 0)::int`,
      })
      .from(booking)
      .innerJoin(inventoryDay, eq(inventoryDay.id, booking.inventoryDayId))
      .innerJoin(spot, eq(spot.id, inventoryDay.spotId))
      .innerJoin(spotType, eq(spotType.id, spot.typeId))
      .where(sold)
      .groupBy(spotType.id, spotType.name, spotType.mark)
      .orderBy(asc(spotType.name));

    // Per spot: published days on one side, sales on the other, merged here.
    const places = await tx
      .select({ spotId: spot.id, code: spot.code, zone: spot.zone, rowNumber: spot.rowNumber, col: spot.col })
      .from(spot)
      .where(eq(spot.retired, false))
      .orderBy(zoneOrder, asc(spot.rowNumber), asc(spot.col));
    const publishedBySpot = await tx
      .select({ spotId: inventoryDay.spotId, days: sql<number>`count(*)::int` })
      .from(inventoryDay)
      .where(and(dayInPeriod, ne(inventoryDay.state, 'unpublishable')))
      .groupBy(inventoryDay.spotId);
    const soldBySpot = await tx
      .select({ spotId: inventoryDay.spotId, soldDays: sql<number>`count(*)::int`, grossCents: sql<number>`coalesce(sum(${booking.totalCents}), 0)::int` })
      .from(booking)
      .innerJoin(inventoryDay, eq(inventoryDay.id, booking.inventoryDayId))
      .where(sold)
      .groupBy(inventoryDay.spotId);
    const publishedOf = new Map(publishedBySpot.map((row) => [row.spotId, row.days]));
    const soldOf = new Map(soldBySpot.map((row) => [row.spotId, row]));
    const heatmap: SpotFigures[] = places.map((place) => {
      const publishedDays = publishedOf.get(place.spotId) ?? 0;
      const sale = soldOf.get(place.spotId);
      const soldDays = sale?.soldDays ?? 0;
      return {
        ...place,
        publishedDays,
        soldDays,
        grossCents: sale?.grossCents ?? 0,
        rateBps: publishedDays > 0 ? Math.round((soldDays * 10_000) / publishedDays) : null,
      };
    });
    // Ranking among the spots that were on sale at all; gross decides, the code breaks ties.
    const ranked = heatmap.filter((figure) => figure.publishedDays > 0).sort((a, b) => b.grossCents - a.grossCents || b.soldDays - a.soldDays || a.code.localeCompare(b.code));

    const soldDays = totals?.bookings ?? 0;
    const grossCents = totals?.grossCents ?? 0;
    const publishedDays = published?.days ?? 0;
    return {
      from,
      to,
      timezone: zone?.timezone ?? 'Europe/Rome',
      soldDays,
      grossCents,
      cancelled: { bookings: cancelled?.bookings ?? 0, grossCents: cancelled?.grossCents ?? 0 },
      averageCents: soldDays > 0 ? Math.round(grossCents / soldDays) : null,
      occupancy: { soldDays, publishedDays, rateBps: publishedDays > 0 ? Math.round((soldDays * 10_000) / publishedDays) : null },
      byChannel,
      byPaymentStatus,
      arrivals: { arrived: arrived?.bookings ?? 0, notArrived: soldDays - (arrived?.bookings ?? 0) },
      byType,
      topSpots: ranked.slice(0, 5),
      bottomSpots: ranked.slice(-5).reverse(),
      heatmap,
    };
  });
}
