import { and, asc, eq, sql } from 'drizzle-orm';
import { assertCents } from '@ombre/shared';
import { withActor, withUser, type Database, type Transaction } from './client';
import { DomainError } from './inventory';
import type { Actor } from './manage';
import { auditEvent, availabilityProposal, beach, inventoryDay, seasonContract, spot } from './schema';

function pgCode(error: unknown): string | undefined {
  const candidate = error as { code?: string; cause?: { code?: string } } | null;
  return candidate?.code ?? candidate?.cause?.code;
}

export interface NewContract {
  holderEmail: string;
  spotId: string;
  validFrom: string;
  validTo: string;
  sharingMode: 'per_day' | 'automatic';
}

/** The manager records a verified season pass: person, spot and period. */
export async function createContract(db: Database, actor: Actor, input: NewContract): Promise<{ contractId: string }> {
  try {
    return await withActor(db, actor.beachId, actor.userId, async (tx) => {
      const found = await tx.execute<{ id: string | null }>(sql`select user_id_by_email(${input.holderEmail}) as id`);
      const holderUserId = found.rows[0]?.id;
      if (!holderUserId) throw new DomainError('not_found', 'No account with this email');
      const [place] = await tx.select({ id: spot.id }).from(spot).where(eq(spot.id, input.spotId));
      if (!place) throw new DomainError('not_found', 'Spot not found');
      const [created] = await tx
        .insert(seasonContract)
        .values({ beachId: actor.beachId, holderUserId, spotId: input.spotId, validFrom: input.validFrom, validTo: input.validTo, sharingMode: input.sharingMode })
        .returning({ id: seasonContract.id });
      if (!created) throw new Error('contract was not created');
      await tx.insert(auditEvent).values({ beachId: actor.beachId, actorUserId: actor.userId, action: 'sharing.contract', target: created.id, detail: { spotId: input.spotId } });
      return { contractId: created.id };
    });
  } catch (error) {
    if (pgCode(error) === '23P01') throw new DomainError('invalid_state', 'This spot already has a season pass in that period');
    if (pgCode(error) === '23514') throw new DomainError('invalid_state', 'The period ends before it starts');
    throw error;
  }
}

export function setSharingSettings(db: Database, actor: Actor, input: { dailySharedCap: number | null; sharedPriceCents: number | null }): Promise<void> {
  if (input.sharedPriceCents !== null) assertCents(input.sharedPriceCents, 'price');
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    await tx.update(beach).set({ dailySharedCap: input.dailySharedCap, sharedPriceCents: input.sharedPriceCents }).where(eq(beach.id, actor.beachId));
    await tx.insert(auditEvent).values({ beachId: actor.beachId, actorUserId: actor.userId, action: 'sharing.settings', target: null, detail: input });
  });
}

export function getSharingSettings(db: Database, actor: Actor): Promise<{ dailySharedCap: number | null; sharedPriceCents: number | null }> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const [row] = await tx.select({ dailySharedCap: beach.dailySharedCap, sharedPriceCents: beach.sharedPriceCents }).from(beach).where(eq(beach.id, actor.beachId));
    return row ?? { dailySharedCap: null, sharedPriceCents: null };
  });
}

export interface ContractRow {
  contractId: string;
  spotCode: string;
  validFrom: string;
  validTo: string;
  status: (typeof seasonContract.$inferSelect)['status'];
  sharingMode: (typeof seasonContract.$inferSelect)['sharingMode'];
}

export function listContracts(db: Database, actor: Actor): Promise<ContractRow[]> {
  return withActor(db, actor.beachId, actor.userId, (tx) =>
    tx
      .select({ contractId: seasonContract.id, spotCode: spot.code, validFrom: seasonContract.validFrom, validTo: seasonContract.validTo, status: seasonContract.status, sharingMode: seasonContract.sharingMode })
      .from(seasonContract)
      .innerJoin(spot, eq(spot.id, seasonContract.spotId))
      .orderBy(asc(spot.code), asc(seasonContract.validFrom)),
  );
}

interface ProposalRef {
  id: string;
  contractId: string;
  day: string;
  spotId: string;
}

/**
 * Publishes a proposed day as shared inventory. The daily cap is counted under a lock per
 * beach club and day, so two approvals at once cannot exceed it.
 */
async function approve(tx: Transaction, beachId: string, proposal: ProposalRef, priceOverride: number | null, decidedBy: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`share/${beachId}/${proposal.day}`}, 0))`);
  const [settings] = await tx.select({ cap: beach.dailySharedCap, price: beach.sharedPriceCents }).from(beach).where(eq(beach.id, beachId));
  if (settings?.cap !== null && settings?.cap !== undefined) {
    const [count] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(availabilityProposal)
      .where(and(eq(availabilityProposal.day, proposal.day), eq(availabilityProposal.status, 'approved')));
    if ((count?.n ?? 0) >= settings.cap) throw new DomainError('cap_reached', 'The daily limit of shared days has been reached');
  }
  const price = priceOverride ?? settings?.price ?? null;
  if (price === null) throw new DomainError('invalid_state', 'Set the price of shared days first');

  const [existing] = await tx
    .select()
    .from(inventoryDay)
    .where(and(eq(inventoryDay.spotId, proposal.spotId), eq(inventoryDay.day, proposal.day)))
    .for('update');
  const shared = { state: 'available' as const, shared: true, contractId: proposal.contractId, priceCents: price };
  if (!existing) {
    await tx.insert(inventoryDay).values({ beachId, spotId: proposal.spotId, day: proposal.day, ...shared });
  } else if (existing.state === 'unpublishable' || existing.state === 'available') {
    await tx.update(inventoryDay).set({ ...shared, updatedAt: sql`now()` }).where(eq(inventoryDay.id, existing.id));
  } else {
    throw new DomainError('inventory_conflict', 'This day is already held, sold or blocked');
  }
  await tx.update(availabilityProposal).set({ status: 'approved', decidedBy, decidedAt: sql`now()` }).where(eq(availabilityProposal.id, proposal.id));
}

export interface ProposalRow {
  proposalId: string;
  day: string;
  status: (typeof availabilityProposal.$inferSelect)['status'];
  spotCode: string;
  contractId: string;
}

export function listProposals(db: Database, actor: Actor, status?: ProposalRow['status']): Promise<ProposalRow[]> {
  return withActor(db, actor.beachId, actor.userId, (tx) =>
    tx
      .select({ proposalId: availabilityProposal.id, day: availabilityProposal.day, status: availabilityProposal.status, spotCode: spot.code, contractId: seasonContract.id })
      .from(availabilityProposal)
      .innerJoin(seasonContract, eq(seasonContract.id, availabilityProposal.contractId))
      .innerJoin(spot, eq(spot.id, seasonContract.spotId))
      .where(status ? eq(availabilityProposal.status, status) : undefined)
      .orderBy(asc(availabilityProposal.day), asc(spot.code)),
  );
}

export function decideProposal(db: Database, actor: Actor, proposalId: string, decision: { approve: boolean; priceCents?: number }): Promise<void> {
  if (decision.priceCents !== undefined) assertCents(decision.priceCents, 'price');
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const [row] = await tx
      .select({ id: availabilityProposal.id, contractId: availabilityProposal.contractId, day: availabilityProposal.day, status: availabilityProposal.status, spotId: seasonContract.spotId, contractStatus: seasonContract.status })
      .from(availabilityProposal)
      .innerJoin(seasonContract, eq(seasonContract.id, availabilityProposal.contractId))
      .where(eq(availabilityProposal.id, proposalId))
      .for('update', { of: availabilityProposal });
    if (!row) throw new DomainError('not_found', 'Proposal not found');
    if (row.status !== 'proposed') throw new DomainError('invalid_state', 'This proposal has already been decided');
    if (decision.approve) {
      if (row.contractStatus !== 'active') throw new DomainError('invalid_state', 'This season pass is not active');
      await approve(tx, actor.beachId, row, decision.priceCents ?? null, actor.userId);
    } else {
      await tx.update(availabilityProposal).set({ status: 'rejected', decidedBy: actor.userId, decidedAt: sql`now()` }).where(eq(availabilityProposal.id, row.id));
    }
    await tx.insert(auditEvent).values({ beachId: actor.beachId, actorUserId: actor.userId, action: decision.approve ? 'sharing.approve' : 'sharing.reject', target: `${row.contractId}/${row.day}`, detail: {} });
  });
}

/** Stops or resumes new sales on a season pass. Confirmed bookings are never touched. */
export function setContractStatus(db: Database, actor: Actor, contractId: string, status: 'active' | 'suspended'): Promise<void> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const [updated] = await tx.update(seasonContract).set({ status }).where(and(eq(seasonContract.id, contractId), sql`${seasonContract.status} <> 'ended'`)).returning({ id: seasonContract.id });
    if (!updated) throw new DomainError('not_found', 'Season pass not found');
    await tx
      .update(inventoryDay)
      .set({ state: status === 'suspended' ? 'unpublishable' : 'available', updatedAt: sql`now()` })
      .where(and(eq(inventoryDay.contractId, contractId), eq(inventoryDay.state, status === 'suspended' ? 'available' : 'unpublishable'), sql`${inventoryDay.day} >= current_date`));
    await tx.insert(auditEvent).values({ beachId: actor.beachId, actorUserId: actor.userId, action: `sharing.${status}`, target: contractId, detail: {} });
  });
}

export interface ContractView {
  contractId: string;
  beachId: string;
  beachSlug: string;
  beachName: string;
  spotCode: string;
  validFrom: string;
  validTo: string;
  status: (typeof seasonContract.$inferSelect)['status'];
  sharingMode: (typeof seasonContract.$inferSelect)['sharingMode'];
}

export function listMyContracts(db: Database, userId: string): Promise<ContractView[]> {
  return withUser(db, userId, async (tx) => {
    const contracts = await tx
      .select({ contractId: seasonContract.id, beachId: beach.id, beachSlug: beach.slug, beachName: beach.name, spotId: seasonContract.spotId, validFrom: seasonContract.validFrom, validTo: seasonContract.validTo, status: seasonContract.status, sharingMode: seasonContract.sharingMode })
      .from(seasonContract)
      .innerJoin(beach, eq(beach.id, seasonContract.beachId))
      .where(eq(seasonContract.holderUserId, userId))
      .orderBy(asc(seasonContract.validFrom));
    const views: ContractView[] = [];
    for (const { spotId, ...contract } of contracts) {
      // Spots are visible only inside their beach club.
      await tx.execute(sql`select set_config('app.beach_id', ${contract.beachId}, true)`);
      const [place] = await tx.select({ code: spot.code }).from(spot).where(eq(spot.id, spotId));
      views.push({ ...contract, spotCode: place?.code ?? '' });
    }
    return views;
  });
}

/** Loads a season pass only if it belongs to the person asking. */
async function ownContract(db: Database, userId: string, contractId: string) {
  const [contract] = await withUser(db, userId, (tx) =>
    tx.select().from(seasonContract).where(and(eq(seasonContract.id, contractId), eq(seasonContract.holderUserId, userId))),
  );
  if (!contract) throw new DomainError('not_found', 'Season pass not found');
  return contract;
}

export interface ProposalSummary {
  added: string[];
  alreadyPresent: string[];
  outsidePeriod: string[];
  /** Proposed but not published automatically: the daily limit or the inventory prevented it. */
  waiting: string[];
}

/** The holder offers days. Each day ends in exactly one list of the summary. */
export async function proposeDays(db: Database, userId: string, contractId: string, days: readonly string[]): Promise<ProposalSummary> {
  const contract = await ownContract(db, userId, contractId);
  if (contract.status !== 'active') throw new DomainError('invalid_state', 'This season pass is not active');
  return withActor(db, contract.beachId, userId, async (tx) => {
    const [clock] = await tx.select({ today: sql<string>`(now() at time zone ${beach.timezone})::date::text` }).from(beach).where(eq(beach.id, contract.beachId));
    const today = clock?.today ?? '';
    const summary: ProposalSummary = { added: [], alreadyPresent: [], outsidePeriod: [], waiting: [] };

    for (const day of [...new Set(days)].sort()) {
      if (day < contract.validFrom || day > contract.validTo || day < today) {
        summary.outsidePeriod.push(day);
        continue;
      }
      const [existing] = await tx.select().from(availabilityProposal).where(and(eq(availabilityProposal.contractId, contractId), eq(availabilityProposal.day, day))).for('update');
      if (existing && (existing.status === 'proposed' || existing.status === 'approved')) {
        summary.alreadyPresent.push(day);
        continue;
      }
      const [proposal] = existing
        ? await tx.update(availabilityProposal).set({ status: 'proposed', decidedBy: null, decidedAt: null }).where(eq(availabilityProposal.id, existing.id)).returning()
        : await tx.insert(availabilityProposal).values({ beachId: contract.beachId, contractId, day }).returning();
      if (!proposal) throw new Error('proposal was not saved');
      summary.added.push(day);

      if (contract.sharingMode === 'automatic') {
        try {
          await approve(tx, contract.beachId, { id: proposal.id, contractId, day, spotId: contract.spotId }, null, userId);
        } catch (error) {
          if (!(error instanceof DomainError)) throw error;
          summary.waiting.push(day);
        }
      }
    }
    return summary;
  });
}

/** The holder takes a day back, as long as nobody has held or bought it. */
export async function withdrawDay(db: Database, userId: string, contractId: string, day: string): Promise<void> {
  const contract = await ownContract(db, userId, contractId);
  return withActor(db, contract.beachId, userId, async (tx) => {
    const [row] = await tx.select().from(inventoryDay).where(and(eq(inventoryDay.spotId, contract.spotId), eq(inventoryDay.day, day))).for('update');
    const [proposal] = await tx.select().from(availabilityProposal).where(and(eq(availabilityProposal.contractId, contractId), eq(availabilityProposal.day, day))).for('update');
    if (!proposal || (proposal.status !== 'proposed' && proposal.status !== 'approved')) throw new DomainError('not_found', 'No proposal for this day');
    if (proposal.status === 'approved') {
      if (!row || row.state !== 'available') throw new DomainError('invalid_state', 'This day is already held or sold: contact support');
      await tx.update(inventoryDay).set({ state: 'unpublishable', updatedAt: sql`now()` }).where(eq(inventoryDay.id, row.id));
    }
    await tx.update(availabilityProposal).set({ status: 'withdrawn', decidedAt: sql`now()` }).where(eq(availabilityProposal.id, proposal.id));
  });
}

export { ownContract };
