import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import pg from 'pg';
import { splitAmount, type Share } from '@ombre/shared';
import { withActor, withBeach, type Database, type Transaction } from './client';
import type { Actor } from './manage';
import { allocation, availabilityProposal, booking, inventoryDay, ledgerEntry, refund, seasonContract, splitRule } from './schema';
import { ownContract } from './sharing';

type Party = 'season_holder' | 'beach_club' | 'platform';

/**
 * Writes the money trail of a confirmed booking: the payment and each party's share.
 * An ordinary day has no season holder: that share stays with the beach club.
 * The leftover cents of the division always go to the beach club.
 */
export async function recordSale(tx: Transaction, beachId: string, sale: { bookingId: string; inventoryDayId: string; totalCents: number }): Promise<void> {
  await tx.insert(ledgerEntry).values({ beachId, bookingId: sale.bookingId, kind: 'payment_received', amountCents: sale.totalCents });
  const [rule] = await tx.select().from(splitRule).orderBy(desc(splitRule.createdAt)).limit(1);
  if (!rule) return;

  const [day] = await tx
    .select({ shared: inventoryDay.shared, holderUserId: seasonContract.holderUserId })
    .from(inventoryDay)
    .leftJoin(seasonContract, eq(seasonContract.id, inventoryDay.contractId))
    .where(eq(inventoryDay.id, sale.inventoryDayId));
  const holderUserId = day?.shared ? (day.holderUserId ?? null) : null;

  const shares: Share<Party>[] = holderUserId
    ? [
        { party: 'season_holder', bps: rule.seasonHolderBps },
        { party: 'beach_club', bps: rule.beachClubBps },
        { party: 'platform', bps: rule.platformBps },
      ]
    : [
        { party: 'beach_club', bps: rule.seasonHolderBps + rule.beachClubBps },
        { party: 'platform', bps: rule.platformBps },
      ];
  const amounts = splitAmount(sale.totalCents, shares, 'beach_club');

  for (const share of shares) {
    const amountCents = amounts[share.party];
    await tx.insert(allocation).values({
      beachId,
      bookingId: sale.bookingId,
      party: share.party,
      beneficiaryUserId: share.party === 'season_holder' ? holderUserId : null,
      bps: share.bps,
      amountCents,
      splitRuleId: rule.id,
    });
    await tx.insert(ledgerEntry).values({ beachId, bookingId: sale.bookingId, kind: 'allocation_expected', party: share.party, amountCents });
  }
}

export async function recordRefundDue(tx: Transaction, beachId: string, bookingId: string, amountCents: number): Promise<void> {
  await tx.insert(ledgerEntry).values([
    { beachId, bookingId, kind: 'payment_received', amountCents },
    { beachId, bookingId, kind: 'refund_due', amountCents: -amountCents },
  ]);
}

/**
 * End of day: confirmed bookings of that day become completed, presences end and the
 * expected shares accrue. Running it again changes nothing.
 */
export function closeDay(db: Database, beachId: string, day: string): Promise<{ completed: number; accrued: number }> {
  return withBeach(db, beachId, async (tx) => {
    const done = await tx
      .update(booking)
      .set({ status: 'completed', presence: 'ended' })
      .where(and(eq(booking.status, 'confirmed'), inArray(booking.inventoryDayId, tx.select({ id: inventoryDay.id }).from(inventoryDay).where(eq(inventoryDay.day, day)))))
      .returning({ id: booking.id });
    if (done.length === 0) return { completed: 0, accrued: 0 };
    const accrued = await tx
      .update(allocation)
      .set({ state: 'accrued' })
      .where(and(eq(allocation.state, 'expected'), inArray(allocation.bookingId, done.map((row) => row.id))))
      .returning({ bookingId: allocation.bookingId, party: allocation.party, amountCents: allocation.amountCents });
    if (accrued.length > 0) {
      await tx.insert(ledgerEntry).values(accrued.map((row) => ({ beachId, bookingId: row.bookingId, kind: 'allocation_accrued', party: row.party, amountCents: row.amountCents })));
    }
    return { completed: done.length, accrued: accrued.length };
  });
}

export interface ReportSummary {
  from: string;
  to: string;
  bookings: { shared: number; ordinary: number };
  grossCents: { shared: number; ordinary: number };
  byParty: Record<Party, { expected: number; accrued: number; other: number }>;
  refundsDueCents: number;
}

/** Totals for a period. Shared sales are counted apart from ordinary ones. */
export function reportSummary(db: Database, actor: Actor, from: string, to: string): Promise<ReportSummary> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const inPeriod = and(sql`${inventoryDay.day} between ${from} and ${to}`, inArray(booking.status, ['confirmed', 'completed']));
    const sales = await tx
      .select({ shared: inventoryDay.shared, n: sql<number>`count(*)::int`, gross: sql<number>`coalesce(sum(${booking.totalCents}), 0)::int` })
      .from(booking)
      .innerJoin(inventoryDay, eq(inventoryDay.id, booking.inventoryDayId))
      .where(inPeriod)
      .groupBy(inventoryDay.shared);
    const parts = await tx
      .select({ party: allocation.party, state: allocation.state, total: sql<number>`coalesce(sum(${allocation.amountCents}), 0)::int` })
      .from(allocation)
      .innerJoin(booking, eq(booking.id, allocation.bookingId))
      .innerJoin(inventoryDay, eq(inventoryDay.id, booking.inventoryDayId))
      .where(inPeriod)
      .groupBy(allocation.party, allocation.state);
    const [refunds] = await tx.select({ total: sql<number>`coalesce(sum(${refund.amountCents}), 0)::int` }).from(refund).where(eq(refund.status, 'requested'));

    const summary: ReportSummary = {
      from,
      to,
      bookings: { shared: 0, ordinary: 0 },
      grossCents: { shared: 0, ordinary: 0 },
      byParty: {
        season_holder: { expected: 0, accrued: 0, other: 0 },
        beach_club: { expected: 0, accrued: 0, other: 0 },
        platform: { expected: 0, accrued: 0, other: 0 },
      },
      refundsDueCents: refunds?.total ?? 0,
    };
    for (const row of sales) {
      const key = row.shared ? 'shared' : 'ordinary';
      summary.bookings[key] = row.n;
      summary.grossCents[key] = row.gross;
    }
    for (const row of parts) {
      const bucket = row.state === 'expected' || row.state === 'accrued' ? row.state : 'other';
      summary.byParty[row.party][bucket] += row.total;
    }
    return summary;
  });
}

export interface StatementRow {
  day: string;
  proposal: (typeof availabilityProposal.$inferSelect)['status'];
  sold: boolean;
  shareCents: number | null;
  shareState: (typeof allocation.$inferSelect)['state'] | null;
}

/** What a season holder sees: their days and their share, with nothing about the guest. */
export async function holderStatement(db: Database, userId: string, contractId: string): Promise<StatementRow[]> {
  const contract = await ownContract(db, userId, contractId);
  return withActor(db, contract.beachId, userId, async (tx) => {
    const rows = await tx
      .select({ day: availabilityProposal.day, proposal: availabilityProposal.status, bookingId: booking.id, shareCents: allocation.amountCents, shareState: allocation.state })
      .from(availabilityProposal)
      .leftJoin(inventoryDay, and(eq(inventoryDay.contractId, availabilityProposal.contractId), eq(inventoryDay.day, availabilityProposal.day)))
      .leftJoin(booking, and(eq(booking.inventoryDayId, inventoryDay.id), inArray(booking.status, ['confirmed', 'completed'])))
      .leftJoin(allocation, and(eq(allocation.bookingId, booking.id), eq(allocation.party, 'season_holder')))
      .where(eq(availabilityProposal.contractId, contractId))
      .orderBy(asc(availabilityProposal.day));
    return rows.map((row) => ({ day: row.day, proposal: row.proposal, sold: row.bookingId !== null, shareCents: row.shareCents, shareState: row.shareState }));
  });
}

/** Owner-side: sets the percentages applied to the next bookings of a beach club. */
export async function setSplitRule(adminUrl: string, beachId: string, bps: { seasonHolder: number; beachClub: number; platform: number }): Promise<void> {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query('INSERT INTO split_rule (beach_id, season_holder_bps, beach_club_bps, platform_bps) VALUES ($1, $2, $3, $4)', [beachId, bps.seasonHolder, bps.beachClub, bps.platform]);
  } finally {
    await client.end();
  }
}
