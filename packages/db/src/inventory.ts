import { createHash } from 'node:crypto';
import { and, asc, eq, sql } from 'drizzle-orm';
import { quoteDay, type DayQuote } from '@ombre/shared';
import { withBeach, type Database, type Transaction } from './client';
import { beach, hold, inventoryDay, promotion, spot } from './schema';

export type DomainErrorCode =
  | 'not_found'
  | 'inventory_conflict'
  | 'promo_not_applicable'
  | 'idempotency_mismatch'
  | 'invalid_credentials'
  | 'account_locked'
  | 'forbidden'
  | 'invalid_state'
  | 'hold_expired'
  | 'pass_invalid'
  | 'wrong_day';

/** A refusal the caller can explain to the user. Anything else is an internal fault. */
export class DomainError extends Error {
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

export interface PublicBeach {
  id: string;
  slug: string;
  name: string;
  locality: string;
  timezone: string;
  demo: boolean;
}

const publicBeachColumns = {
  id: beach.id,
  slug: beach.slug,
  name: beach.name,
  locality: beach.locality,
  timezone: beach.timezone,
  demo: beach.demo,
};

export function listActiveBeaches(db: Database): Promise<PublicBeach[]> {
  return db.select(publicBeachColumns).from(beach).where(eq(beach.status, 'active')).orderBy(asc(beach.name));
}

export async function findActiveBeach(db: Database, slug: string): Promise<PublicBeach | null> {
  const rows = await db.select(publicBeachColumns).from(beach).where(and(eq(beach.slug, slug), eq(beach.status, 'active')));
  return rows[0] ?? null;
}

export interface AvailableSpot {
  spotId: string;
  code: string;
  rowNumber: number;
  umbrellas: number;
  sunbeds: number;
  maxGuests: number;
  priceCents: number;
  shared: boolean;
}

// A day is free when nobody holds it, or when the hold has run out even if no job has cleaned it yet.
const isFree = sql`(${inventoryDay.state} = 'available' or (${inventoryDay.state} = 'held' and ${hold.expiresAt} <= now()))`;

export function listAvailability(db: Database, beachId: string, day: string): Promise<AvailableSpot[]> {
  return withBeach(db, beachId, (tx) =>
    tx
      .select({
        spotId: spot.id,
        code: spot.code,
        rowNumber: spot.rowNumber,
        umbrellas: spot.umbrellas,
        sunbeds: spot.sunbeds,
        maxGuests: spot.maxGuests,
        priceCents: inventoryDay.priceCents,
        shared: inventoryDay.shared,
      })
      .from(inventoryDay)
      .innerJoin(spot, eq(spot.id, inventoryDay.spotId))
      .leftJoin(hold, eq(hold.id, inventoryDay.activeHoldId))
      .where(and(eq(inventoryDay.day, day), isFree))
      .orderBy(asc(spot.rowNumber), asc(spot.code)),
  );
}

/** First day, from today in the beach club's time zone, with at least one free spot. */
export async function nextAvailableDay(db: Database, target: PublicBeach): Promise<string | null> {
  return withBeach(db, target.id, async (tx) => {
    const [row] = await tx
      .select({ day: sql<string | null>`min(${inventoryDay.day})::text` })
      .from(inventoryDay)
      .leftJoin(hold, eq(hold.id, inventoryDay.activeHoldId))
      .where(and(sql`${inventoryDay.day} >= (now() at time zone ${target.timezone})::date`, isFree));
    return row?.day ?? null;
  });
}

export interface HoldView {
  holdId: string;
  status: (typeof hold.$inferSelect)['status'];
  /** False once the time is up, even if the row still says active. */
  live: boolean;
  expiresAt: Date;
  day: string;
  spotCode: string;
  rowNumber: number;
  umbrellas: number;
  sunbeds: number;
  quote: DayQuote;
}

export async function getHold(db: Database, beachId: string, holdId: string): Promise<HoldView> {
  return withBeach(db, beachId, async (tx) => {
    const [row] = await tx
      .select({
        hold,
        live: sql<boolean>`${hold.status} = 'active' and ${hold.expiresAt} > now()`,
        day: inventoryDay.day,
        spotCode: spot.code,
        rowNumber: spot.rowNumber,
        umbrellas: spot.umbrellas,
        sunbeds: spot.sunbeds,
      })
      .from(hold)
      .innerJoin(inventoryDay, eq(inventoryDay.id, hold.inventoryDayId))
      .innerJoin(spot, eq(spot.id, inventoryDay.spotId))
      .where(eq(hold.id, holdId));
    if (!row) throw new DomainError('not_found', 'Hold not found');
    return {
      holdId: row.hold.id,
      status: row.hold.status,
      live: row.live,
      expiresAt: row.hold.expiresAt,
      day: row.day,
      spotCode: row.spotCode,
      rowNumber: row.rowNumber,
      umbrellas: row.umbrellas,
      sunbeds: row.sunbeds,
      quote: {
        listPrice: row.hold.listPriceCents,
        discount: row.hold.discountCents,
        total: row.hold.totalCents,
        promoCode: row.hold.promoCode,
      },
    };
  });
}

export interface DayRequest {
  spotId: string;
  day: string;
  promoCode?: string | null;
}

function normalizePromo(code: string | null | undefined): string | null {
  const trimmed = code?.trim().toUpperCase();
  return trimmed ? trimmed : null;
}

/** Price of a day as the server computes it. It reserves nothing. */
export function quoteSpot(db: Database, beachId: string, request: DayRequest): Promise<DayQuote> {
  return withBeach(db, beachId, async (tx) => {
    const [row] = await tx
      .select({ priceCents: inventoryDay.priceCents })
      .from(inventoryDay)
      .leftJoin(hold, eq(hold.id, inventoryDay.activeHoldId))
      .where(and(eq(inventoryDay.spotId, request.spotId), eq(inventoryDay.day, request.day), isFree));
    if (!row) throw new DomainError('inventory_conflict', 'This spot is not available on this day');

    const code = normalizePromo(request.promoCode);
    if (!code) return quoteDay(row.priceCents);

    const [promo] = await tx
      .select({ percentBps: promotion.percentBps })
      .from(promotion)
      .where(and(eq(promotion.code, code), eq(promotion.active, true), sql`(${promotion.maxUses} is null or ${promotion.committedUses} < ${promotion.maxUses})`));
    if (!promo) throw new DomainError('promo_not_applicable', 'This promotion cannot be applied');
    return quoteDay(row.priceCents, { code, percentBps: promo.percentBps });
  });
}

export interface HoldResult {
  holdId: string;
  status: (typeof hold.$inferSelect)['status'];
  expiresAt: Date;
  quote: DayQuote;
  /** True when the same request had already been served and nothing new was created. */
  replayed: boolean;
}

function toResult(row: typeof hold.$inferSelect, replayed: boolean): HoldResult {
  return {
    holdId: row.id,
    status: row.status,
    expiresAt: row.expiresAt,
    quote: {
      listPrice: row.listPriceCents,
      discount: row.discountCents,
      total: row.totalCents,
      promoCode: row.promoCode,
    },
    replayed,
  };
}

async function returnPromoUse(tx: Transaction, promotionId: string | null): Promise<void> {
  if (!promotionId) return;
  await tx
    .update(promotion)
    .set({ committedUses: sql`${promotion.committedUses} - 1` })
    .where(eq(promotion.id, promotionId));
}

function errorCode(error: unknown): string | undefined {
  const candidate = error as { code?: string; cause?: { code?: string } } | null;
  return candidate?.code ?? candidate?.cause?.code;
}

export interface HoldRequest extends DayRequest {
  idempotencyKey: string;
  ttlSeconds: number;
}

/**
 * Takes a day for a limited time. The inventory row is locked first, so two buyers of the
 * same day are served one after the other and only one can win. Lock order is always
 * inventory row, then promotion.
 */
export async function acquireHold(db: Database, beachId: string, request: HoldRequest): Promise<HoldResult> {
  const promoCode = normalizePromo(request.promoCode);
  const requestHash = createHash('sha256').update(JSON.stringify([request.spotId, request.day, promoCode])).digest('hex');

  try {
    return await withBeach(db, beachId, async (tx) => {
      const [row] = await tx
        .select()
        .from(inventoryDay)
        .where(and(eq(inventoryDay.spotId, request.spotId), eq(inventoryDay.day, request.day)))
        .for('update');

      const [previous] = await tx.select().from(hold).where(eq(hold.idempotencyKey, request.idempotencyKey));
      if (previous) {
        if (previous.requestHash !== requestHash) {
          throw new DomainError('idempotency_mismatch', 'This idempotency key was used for a different request');
        }
        return toResult(previous, true);
      }
      if (!row) throw new DomainError('not_found', 'Spot or day not found');

      let state = row.state;
      if (state === 'held' && row.activeHoldId) {
        const [lapsed] = await tx
          .update(hold)
          .set({ status: 'expired' })
          .where(and(eq(hold.id, row.activeHoldId), eq(hold.status, 'active'), sql`${hold.expiresAt} <= now()`))
          .returning({ promotionId: hold.promotionId });
        if (lapsed) {
          await returnPromoUse(tx, lapsed.promotionId);
          state = 'available';
        }
      }
      if (state !== 'available') throw new DomainError('inventory_conflict', 'This spot has just been taken');

      let promo: { id: string; percentBps: number } | undefined;
      if (promoCode) {
        [promo] = await tx
          .update(promotion)
          .set({ committedUses: sql`${promotion.committedUses} + 1` })
          .where(and(eq(promotion.code, promoCode), eq(promotion.active, true), sql`(${promotion.maxUses} is null or ${promotion.committedUses} < ${promotion.maxUses})`))
          .returning({ id: promotion.id, percentBps: promotion.percentBps });
        if (!promo) throw new DomainError('promo_not_applicable', 'This promotion cannot be applied');
      }

      const quote = quoteDay(row.priceCents, promo && promoCode ? { code: promoCode, percentBps: promo.percentBps } : undefined);
      const [created] = await tx
        .insert(hold)
        .values({
          beachId,
          inventoryDayId: row.id,
          promotionId: promo?.id ?? null,
          idempotencyKey: request.idempotencyKey,
          requestHash,
          listPriceCents: quote.listPrice,
          discountCents: quote.discount,
          totalCents: quote.total,
          promoCode: quote.promoCode,
          expiresAt: sql`now() + make_interval(secs => ${request.ttlSeconds})`,
        })
        .returning();
      if (!created) throw new Error('hold was not created');

      await tx
        .update(inventoryDay)
        .set({ state: 'held', activeHoldId: created.id, updatedAt: sql`now()` })
        .where(eq(inventoryDay.id, row.id));
      return toResult(created, false);
    });
  } catch (error) {
    // Two different requests raced with the same key: the unique index stopped the second.
    if (errorCode(error) === '23505') {
      throw new DomainError('idempotency_mismatch', 'This idempotency key was used for a different request');
    }
    throw error;
  }
}

/** Gives a held day back. Returns false when the hold was no longer active. */
export function releaseHold(db: Database, beachId: string, holdId: string): Promise<boolean> {
  return withBeach(db, beachId, async (tx) => {
    const [target] = await tx.select({ inventoryDayId: hold.inventoryDayId }).from(hold).where(eq(hold.id, holdId));
    if (!target) throw new DomainError('not_found', 'Hold not found');

    await tx.select({ id: inventoryDay.id }).from(inventoryDay).where(eq(inventoryDay.id, target.inventoryDayId)).for('update');
    const [released] = await tx
      .update(hold)
      .set({ status: 'released' })
      .where(and(eq(hold.id, holdId), eq(hold.status, 'active')))
      .returning({ promotionId: hold.promotionId });
    if (!released) return false;

    await returnPromoUse(tx, released.promotionId);
    await tx
      .update(inventoryDay)
      .set({ state: 'available', activeHoldId: null, updatedAt: sql`now()` })
      .where(and(eq(inventoryDay.id, target.inventoryDayId), eq(inventoryDay.activeHoldId, holdId)));
    return true;
  });
}
