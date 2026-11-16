import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { withActor, type Database, type Transaction } from './client';
import { conventionAppliesOn, DomainError, normalizePromo } from './inventory';
import type { Actor } from './manage';
import { auditEvent, booking, hold, hotelConvention, inventoryDay, promotion, spot } from './schema';

// Hotel conventions (spec §4.1, D30): partner structures whose guests pay an agreed
// price, recognised through the same code field as the promotions. Management data,
// never public; every write lands in the audit trail.

export interface ConventionInput {
  partnerName: string;
  /** Normalized like promotion codes: trimmed and upper-cased. */
  code: string;
  /** Exactly one of the two pricings, as the database CHECK demands. */
  percentBps: number | null;
  fixedPriceCents: number | null;
  validFrom: string | null;
  validTo: string | null;
  notes: string | null;
}

export interface ConventionView extends ConventionInput {
  conventionId: string;
  active: boolean;
}

const viewColumns = {
  conventionId: hotelConvention.id,
  partnerName: hotelConvention.partnerName,
  code: hotelConvention.code,
  percentBps: hotelConvention.percentBps,
  fixedPriceCents: hotelConvention.fixedPriceCents,
  validFrom: hotelConvention.validFrom,
  validTo: hotelConvention.validTo,
  active: hotelConvention.active,
  notes: hotelConvention.notes,
};

function errorCode(error: unknown): string | undefined {
  const candidate = error as { code?: string; cause?: { code?: string } } | null;
  return candidate?.code ?? candidate?.cause?.code;
}

/** Trims, upper-cases and refuses blanks: one normalization for both registries. */
function cleanCode(raw: string): string {
  const code = normalizePromo(raw);
  if (!code || /\s/.test(code)) throw new DomainError('invalid_state', 'The code must not contain spaces');
  return code;
}

function assertPricing(input: ConventionInput): void {
  if ((input.percentBps === null) === (input.fixedPriceCents === null)) {
    throw new DomainError('invalid_state', 'Give either a percent discount or a fixed price, not both');
  }
  if (input.validFrom !== null && input.validTo !== null && input.validFrom > input.validTo) {
    throw new DomainError('invalid_state', 'The validity window runs backwards');
  }
}

/** A code lives in one registry per beach club: migration 014 also enforces this with triggers. */
async function assertCodeFree(tx: Transaction, code: string): Promise<void> {
  const [taken] = await tx.select({ id: promotion.id }).from(promotion).where(eq(promotion.code, code));
  if (taken) throw new DomainError('code_taken', 'This code already names a promotion of this beach club');
}

export function listConventions(db: Database, actor: Actor): Promise<ConventionView[]> {
  return withActor(db, actor.beachId, actor.userId, (tx) =>
    tx.select(viewColumns).from(hotelConvention).orderBy(asc(hotelConvention.partnerName), asc(hotelConvention.code)),
  );
}

export interface DeskConvention {
  conventionId: string;
  partnerName: string;
  code: string;
  percentBps: number | null;
  fixedPriceCents: number | null;
}

/** Conventions the front desk can pick for a booked day: active and inside their window. */
export function listDeskConventions(db: Database, actor: Actor, day: string): Promise<DeskConvention[]> {
  return withActor(db, actor.beachId, actor.userId, (tx) =>
    tx
      .select({
        conventionId: hotelConvention.id,
        partnerName: hotelConvention.partnerName,
        code: hotelConvention.code,
        percentBps: hotelConvention.percentBps,
        fixedPriceCents: hotelConvention.fixedPriceCents,
      })
      .from(hotelConvention)
      .where(conventionAppliesOn(day))
      .orderBy(asc(hotelConvention.partnerName), asc(hotelConvention.code)),
  );
}

export function createConvention(db: Database, actor: Actor, input: ConventionInput): Promise<ConventionView> {
  assertPricing(input);
  const code = cleanCode(input.code);
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    await assertCodeFree(tx, code);
    try {
      const [created] = await tx
        .insert(hotelConvention)
        .values({ ...input, code, beachId: actor.beachId })
        .returning(viewColumns);
      if (!created) throw new Error('convention was not created');
      await tx.insert(auditEvent).values({ beachId: actor.beachId, actorUserId: actor.userId, action: 'convention.create', target: code, detail: { ...input, code } });
      return created;
    } catch (error) {
      // The unique index or the cross-registry trigger stopped a duplicate code.
      if (errorCode(error) === '23505') throw new DomainError('code_taken', 'This code is already in use for this beach club');
      throw error;
    }
  });
}

/** Full replacement of the writable fields; `active` has its own route. */
export function updateConvention(db: Database, actor: Actor, conventionId: string, input: ConventionInput): Promise<ConventionView> {
  assertPricing(input);
  const code = cleanCode(input.code);
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    await assertCodeFree(tx, code);
    try {
      const [updated] = await tx
        .update(hotelConvention)
        .set({ ...input, code })
        .where(eq(hotelConvention.id, conventionId))
        .returning(viewColumns);
      if (!updated) throw new DomainError('not_found', 'Convention not found');
      await tx.insert(auditEvent).values({ beachId: actor.beachId, actorUserId: actor.userId, action: 'convention.update', target: code, detail: { conventionId, ...input, code } });
      return updated;
    } catch (error) {
      if (errorCode(error) === '23505') throw new DomainError('code_taken', 'This code is already in use for this beach club');
      throw error;
    }
  });
}

/** Suspends or resumes a convention. A suspended code is refused like an unknown one. */
export function setConventionStatus(db: Database, actor: Actor, conventionId: string, active: boolean): Promise<void> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const [updated] = await tx.update(hotelConvention).set({ active }).where(eq(hotelConvention.id, conventionId)).returning({ code: hotelConvention.code });
    if (!updated) throw new DomainError('not_found', 'Convention not found');
    await tx.insert(auditEvent).values({ beachId: actor.beachId, actorUserId: actor.userId, action: 'convention.status', target: updated.code, detail: { conventionId, active } });
  });
}

/**
 * Deletes a convention that was never used. One that any hold or booking names stays,
 * suspended if need be: the statement per structure must keep adding up (documented
 * choice; the foreign keys would restrict the delete anyway).
 */
export function deleteConvention(db: Database, actor: Actor, conventionId: string): Promise<void> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const [found] = await tx.select({ code: hotelConvention.code }).from(hotelConvention).where(eq(hotelConvention.id, conventionId));
    if (!found) throw new DomainError('not_found', 'Convention not found');
    const [used] = await tx.select({ id: hold.id }).from(hold).where(eq(hold.conventionId, conventionId)).limit(1);
    if (used) throw new DomainError('invalid_state', 'This convention has been used: suspend it instead of deleting it');
    try {
      await tx.delete(hotelConvention).where(eq(hotelConvention.id, conventionId));
    } catch (error) {
      if (errorCode(error) === '23503') throw new DomainError('invalid_state', 'This convention has been used: suspend it instead of deleting it');
      throw error;
    }
    await tx.insert(auditEvent).values({ beachId: actor.beachId, actorUserId: actor.userId, action: 'convention.delete', target: found.code, detail: { conventionId } });
  });
}

export interface ConventionStatementRow {
  code: string;
  day: string;
  spotCode: string;
  guestName: string;
  status: (typeof booking.$inferSelect)['status'];
  listPriceCents: number;
  discountCents: number;
  totalCents: number;
}

export interface ConventionStatement {
  from: string;
  to: string;
  convention: { conventionId: string; partnerName: string; code: string; active: boolean };
  /** Confirmed and completed bookings of the period, by booked day. */
  bookings: ConventionStatementRow[];
  totals: { bookings: number; grossCents: number; discountCents: number };
}

/**
 * The informative statement per structure (D30): who the partner sent, for how much,
 * over a period of booked days. The split of the discounted total stays the ordinary
 * one and is already visible in the financial reports.
 */
export function conventionStatement(db: Database, actor: Actor, conventionId: string, from: string, to: string): Promise<ConventionStatement> {
  return withActor(db, actor.beachId, actor.userId, async (tx) => {
    const [deal] = await tx
      .select({ conventionId: hotelConvention.id, partnerName: hotelConvention.partnerName, code: hotelConvention.code, active: hotelConvention.active })
      .from(hotelConvention)
      .where(eq(hotelConvention.id, conventionId));
    if (!deal) throw new DomainError('not_found', 'Convention not found');

    const rows = await tx
      .select({
        code: booking.code,
        day: inventoryDay.day,
        spotCode: spot.code,
        guestName: booking.guestName,
        status: booking.status,
        listPriceCents: booking.listPriceCents,
        discountCents: booking.discountCents,
        totalCents: booking.totalCents,
      })
      .from(booking)
      .innerJoin(inventoryDay, eq(inventoryDay.id, booking.inventoryDayId))
      .innerJoin(spot, eq(spot.id, inventoryDay.spotId))
      .where(and(eq(booking.conventionId, conventionId), sql`${inventoryDay.day} between ${from} and ${to}`, inArray(booking.status, ['confirmed', 'completed'])))
      .orderBy(asc(inventoryDay.day), asc(booking.code));

    return {
      from,
      to,
      convention: deal,
      bookings: rows,
      totals: {
        bookings: rows.length,
        grossCents: rows.reduce((sum, row) => sum + row.totalCents, 0),
        discountCents: rows.reduce((sum, row) => sum + row.discountCents, 0),
      },
    };
  });
}
