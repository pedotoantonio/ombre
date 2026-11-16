import { createHash } from 'node:crypto';
import { and, asc, eq, gte, ilike, inArray, or, sql } from 'drizzle-orm';
import { quoteConventionDay, quoteDay, type DayQuote, type SeaSide, type SpotMark } from '@ombre/shared';
import { withBeach, type Database, type Transaction } from './client';
import { listElements, type LayoutElementView } from './layout';
import { beach, extraService, hold, holdExtra, hotelConvention, inventoryDay, promotion, spot, spotType } from './schema';

export type DomainErrorCode =
  | 'not_found'
  | 'inventory_conflict'
  | 'promo_not_applicable'
  | 'code_taken'
  | 'idempotency_mismatch'
  | 'invalid_credentials'
  | 'account_locked'
  | 'forbidden'
  | 'invalid_state'
  | 'hold_expired'
  | 'pass_invalid'
  | 'wrong_day'
  | 'extra_not_available'
  | 'cap_reached'
  | 'version_conflict'
  | 'totp_required'
  | 'totp_invalid'
  | 'totp_setup_required'
  // One neutral refusal for the public /paga page: invalid, expired, cancelled
  // and already paid tokens all answer the same, revealing nothing (spec §4.3).
  | 'request_unavailable'
  // The request is genuine but other collections reduced the residual below its
  // amount: refused with a clear message (spec §4.3).
  | 'request_not_payable';

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
  /** Null until the manager sets the position: the club then stays off the map. */
  latitude: number | null;
  longitude: number | null;
}

const publicBeachColumns = {
  id: beach.id,
  slug: beach.slug,
  name: beach.name,
  locality: beach.locality,
  timezone: beach.timezone,
  demo: beach.demo,
  latitude: beach.latitude,
  longitude: beach.longitude,
};

export type SpotZone = (typeof spot.$inferSelect)['zone'];

/** Zones in drawing and listing order: shore first, then umbrellas, then the land side. */
export const zoneOrder = sql`case ${spot.zone} when 'riva' then 0 when 'ombrelloni' then 1 else 2 end`;

/** Active beach clubs. `place` keeps those whose locality or name contains the text. */
export function listActiveBeaches(db: Database, place?: string): Promise<PublicBeach[]> {
  const text = place?.trim();
  // The text is matched literally: the wildcards of LIKE lose their meaning.
  const pattern = text ? `%${text.replace(/[\\%_]/g, '\\$&')}%` : null;
  return db
    .select(publicBeachColumns)
    .from(beach)
    .where(and(eq(beach.status, 'active'), pattern ? or(ilike(beach.locality, pattern), ilike(beach.name, pattern)) : undefined))
    .orderBy(asc(beach.name));
}

export async function findActiveBeach(db: Database, slug: string): Promise<PublicBeach | null> {
  const rows = await db.select(publicBeachColumns).from(beach).where(and(eq(beach.slug, slug), eq(beach.status, 'active')));
  return rows[0] ?? null;
}

export interface AvailableSpot {
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
  priceCents: number;
  shared: boolean;
}

// A day is free when nobody holds it, or when the hold has run out even if no job has cleaned it yet.
const notPast = sql`${inventoryDay.day} >= (select (now() at time zone b.timezone)::date from beach b where b.id = ${inventoryDay.beachId})`;
const isFree = sql`((${inventoryDay.state} = 'available' or (${inventoryDay.state} = 'held' and ${hold.expiresAt} <= now())) and ${notPast})`;

export function listAvailability(db: Database, beachId: string, day: string): Promise<AvailableSpot[]> {
  return withBeach(db, beachId, (tx) =>
    tx
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
        priceCents: inventoryDay.priceCents,
        shared: inventoryDay.shared,
      })
      .from(inventoryDay)
      .innerJoin(spot, eq(spot.id, inventoryDay.spotId))
      .innerJoin(spotType, eq(spotType.id, spot.typeId))
      .leftJoin(hold, eq(hold.id, inventoryDay.activeHoldId))
      .where(and(eq(inventoryDay.day, day), eq(spot.retired, false), isFree))
      .orderBy(zoneOrder, asc(spot.rowNumber), asc(spot.col)),
  );
}

export interface DaySpot {
  spotId: string;
  code: string;
  zone: SpotZone;
  rowNumber: number;
  /** Column inside the row: the drawing may leave holes, drawn as plain sand. */
  col: number;
  /** Name of the spot type, shown on the public label. */
  typeName: string;
  /** Mark of the spot type, so the public drawing uses the exact sign. */
  typeMark: SpotMark;
  umbrellas: number;
  sunbeds: number;
  maxGuests: number;
  /** `unavailable` covers everything that cannot be bought: held, sold, blocked, never published, past. */
  status: 'free' | 'shared' | 'unavailable';
  /** Only for a spot that can be bought. */
  priceCents: number | null;
}

/** Every spot of the beach club on a day, for the map: free ones with their price, the others without details. Retired spots stay hidden. */
export function listDayMap(db: Database, beachId: string, day: string): Promise<DaySpot[]> {
  return withBeach(db, beachId, async (tx) => {
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
        free: sql<boolean>`coalesce(${isFree}, false)`,
        priceCents: inventoryDay.priceCents,
        shared: inventoryDay.shared,
      })
      .from(spot)
      .innerJoin(spotType, eq(spotType.id, spot.typeId))
      .leftJoin(inventoryDay, and(eq(inventoryDay.spotId, spot.id), eq(inventoryDay.day, day)))
      .leftJoin(hold, eq(hold.id, inventoryDay.activeHoldId))
      .where(eq(spot.retired, false))
      .orderBy(zoneOrder, asc(spot.rowNumber), asc(spot.col));
    return rows.map(({ free, priceCents, shared, ...place }) =>
      free && priceCents !== null
        ? { ...place, status: shared ? ('shared' as const) : ('free' as const), priceCents }
        : { ...place, status: 'unavailable' as const, priceCents: null },
    );
  });
}

/** Empty corridor rows between the zones, for drawing the public map. */
export async function getZoneGaps(db: Database, beachId: string): Promise<{ shoreGapRows: number; landGapRows: number }> {
  const [row] = await db.select({ shoreGapRows: beach.shoreGapRows, landGapRows: beach.landGapRows }).from(beach).where(eq(beach.id, beachId));
  return row ?? { shoreGapRows: 1, landGapRows: 1 };
}

export interface PublicCanvas {
  seaSide: SeaSide;
  shoreGapRows: number;
  landGapRows: number;
  /** Walkways, structures and cabin blocks, exactly as the manager drew them. */
  elements: LayoutElementView[];
}

/** The drawing of the beach as the public map renders it: sea side, distances and elements. */
export function getPublicCanvas(db: Database, beachId: string): Promise<PublicCanvas> {
  return withBeach(db, beachId, async (tx) => {
    const [row] = await tx.select({ seaSide: beach.seaSide, shoreGapRows: beach.shoreGapRows, landGapRows: beach.landGapRows }).from(beach).where(eq(beach.id, beachId));
    return { ...(row ?? { seaSide: 'top' as const, shoreGapRows: 1, landGapRows: 1 }), elements: await listElements(tx) };
  });
}

export interface BeachSearch {
  day: string;
  /** People who must fit under one spot. One when not given. */
  guests?: number;
  sharedOnly?: boolean;
  place?: string;
}

export interface BeachOffer extends PublicBeach {
  /** Spots that can be bought on the day and fit the guests. */
  freeSpots: number;
  /** Lowest price among those same spots: a price that can really be paid. Null when there is none. */
  priceFromCents: number | null;
}

/** Active beach clubs with what each one can sell on a day. Each club is read inside its own boundary. */
export async function searchBeaches(db: Database, search: BeachSearch): Promise<BeachOffer[]> {
  const beaches = await listActiveBeaches(db, search.place);
  const offers: BeachOffer[] = [];
  for (const target of beaches) {
    const [found] = await withBeach(db, target.id, (tx) =>
      tx
        .select({ freeSpots: sql<number>`count(*)::int`, priceFromCents: sql<number | null>`min(${inventoryDay.priceCents})` })
        .from(inventoryDay)
        .innerJoin(spot, eq(spot.id, inventoryDay.spotId))
        .leftJoin(hold, eq(hold.id, inventoryDay.activeHoldId))
        .where(and(eq(inventoryDay.day, search.day), eq(spot.retired, false), isFree, gte(spot.maxGuests, search.guests ?? 1), search.sharedOnly ? eq(inventoryDay.shared, true) : undefined)),
    );
    offers.push({ ...target, freeSpots: found?.freeSpots ?? 0, priceFromCents: found?.priceFromCents ?? null });
  }
  return offers;
}

/** First day, from today in the beach club's time zone, with at least one free spot. */
export async function nextAvailableDay(db: Database, target: PublicBeach): Promise<string | null> {
  return withBeach(db, target.id, async (tx) => {
    const [row] = await tx
      .select({ day: sql<string | null>`min(${inventoryDay.day})::text` })
      .from(inventoryDay)
      .innerJoin(spot, eq(spot.id, inventoryDay.spotId))
      .leftJoin(hold, eq(hold.id, inventoryDay.activeHoldId))
      .where(and(sql`${inventoryDay.day} >= (now() at time zone ${target.timezone})::date`, eq(spot.retired, false), isFree));
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
  /** `total` is comprehensive: spot discounted price + extras. */
  quote: PurchaseQuote;
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
        extrasCents: row.hold.extrasCents,
        extras: await holdExtraLines(tx, row.hold.id),
      },
    };
  });
}

// ---- Extra services in the purchase flow (spec §4.2) ----

/** Quantities per service, as the quote and hold requests carry them. */
export interface ExtraRequest {
  serviceId: string;
  quantity: number;
}

/** Reasonable per-service ceiling, mirrored by a database CHECK. */
export const maxExtraQuantity = 20;

/** One quote line per chosen service. The English name is null when the manager gave none: callers fall back to the Italian one, like the website contents. */
export interface ExtraLine {
  serviceId: string;
  name: { it: string; en: string | null };
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
}

/**
 * A full purchase quote: the spot fields of DayQuote (list price, discount — a
 * promotion or hotel convention discounts the spot alone, never the extras) plus
 * the extras per line. `total` is comprehensive: listPrice − discount + extrasCents.
 */
export interface PurchaseQuote extends DayQuote {
  extrasCents: number;
  extras: ExtraLine[];
}

const lineOrder = (left: ExtraLine, right: ExtraLine) => left.name.it.localeCompare(right.name.it) || left.serviceId.localeCompare(right.serviceId);

/**
 * Prices the requested extras against the live catalogue of the beach club. A
 * retired or unknown service is refused with a clear domain error; quantities
 * are bounded. Returns the lines in the manager's display order.
 */
export async function priceExtras(tx: Transaction, requested: ExtraRequest[]): Promise<{ lines: ExtraLine[]; extrasCents: number }> {
  if (requested.length === 0) return { lines: [], extrasCents: 0 };
  const ids = requested.map((entry) => entry.serviceId);
  if (new Set(ids).size !== ids.length) throw new DomainError('invalid_state', 'Each extra service may appear at most once');
  for (const entry of requested) {
    if (!Number.isInteger(entry.quantity) || entry.quantity < 1 || entry.quantity > maxExtraQuantity) {
      throw new DomainError('invalid_state', `Each extra quantity must be between 1 and ${maxExtraQuantity}`);
    }
  }
  const services = await tx
    .select({ id: extraService.id, nameIt: extraService.nameIt, nameEn: extraService.nameEn, unitPriceCents: extraService.unitPriceCents, active: extraService.active, position: extraService.position })
    .from(extraService)
    .where(inArray(extraService.id, ids));
  const byId = new Map(services.map((service) => [service.id, service]));
  const lines = requested.map((entry) => {
    const service = byId.get(entry.serviceId);
    if (!service || !service.active) throw new DomainError('extra_not_available', 'This extra service is not available');
    return {
      serviceId: service.id,
      name: { it: service.nameIt, en: service.nameEn },
      quantity: entry.quantity,
      unitPriceCents: service.unitPriceCents,
      subtotalCents: service.unitPriceCents * entry.quantity,
      position: service.position,
    };
  });
  lines.sort((left, right) => left.position - right.position || lineOrder(left, right));
  return {
    lines: lines.map((line) => ({ serviceId: line.serviceId, name: line.name, quantity: line.quantity, unitPriceCents: line.unitPriceCents, subtotalCents: line.subtotalCents })),
    extrasCents: lines.reduce((sum, line) => sum + line.subtotalCents, 0),
  };
}

/** The snapshot of a hold as quote lines: frozen prices, live names. */
async function holdExtraLines(tx: Transaction, holdId: string): Promise<ExtraLine[]> {
  const rows = await tx
    .select({
      serviceId: holdExtra.serviceId,
      nameIt: extraService.nameIt,
      nameEn: extraService.nameEn,
      quantity: holdExtra.quantity,
      unitPriceCents: holdExtra.unitPriceCents,
      position: extraService.position,
    })
    .from(holdExtra)
    .innerJoin(extraService, eq(extraService.id, holdExtra.serviceId))
    .where(eq(holdExtra.holdId, holdId));
  const lines = rows.map((row) => ({
    serviceId: row.serviceId,
    name: { it: row.nameIt, en: row.nameEn },
    quantity: row.quantity,
    unitPriceCents: row.unitPriceCents,
    subtotalCents: row.unitPriceCents * row.quantity,
    position: row.position,
  }));
  lines.sort((left, right) => left.position - right.position || lineOrder(left, right));
  return lines.map((line) => ({ serviceId: line.serviceId, name: line.name, quantity: line.quantity, unitPriceCents: line.unitPriceCents, subtotalCents: line.subtotalCents }));
}

export interface DayRequest {
  spotId: string;
  day: string;
  promoCode?: string | null;
  /** Quantities per extra service; empty or missing means a spot alone. */
  extras?: ExtraRequest[];
}

export function normalizePromo(code: string | null | undefined): string | null {
  const trimmed = code?.trim().toUpperCase();
  return trimmed ? trimmed : null;
}

/** An active convention whose validity window, when set, contains the booked day. */
export const conventionAppliesOn = (day: string) =>
  and(
    eq(hotelConvention.active, true),
    sql`(${hotelConvention.validFrom} is null or ${hotelConvention.validFrom} <= ${day})`,
    sql`(${hotelConvention.validTo} is null or ${hotelConvention.validTo} >= ${day})`,
  );

interface ConventionPricing {
  id: string;
  percentBps: number | null;
  fixedPriceCents: number | null;
}

/**
 * One code field serves both registries. A promotion is looked up first, then a
 * convention: the order is documented and, since migration 014 keeps a code in a
 * single registry per beach club, it can never be ambiguous. The refusal is the
 * same for every failure (unknown, suspended, exhausted, out of validity), so the
 * answer never reveals whether a convention exists.
 */
function codeRefused(): DomainError {
  return new DomainError('promo_not_applicable', 'This code cannot be applied');
}

async function findConvention(tx: Transaction, code: string, day: string): Promise<ConventionPricing | undefined> {
  const [deal] = await tx
    .select({ id: hotelConvention.id, percentBps: hotelConvention.percentBps, fixedPriceCents: hotelConvention.fixedPriceCents })
    .from(hotelConvention)
    .where(and(eq(hotelConvention.code, code), conventionAppliesOn(day)));
  return deal;
}

/** Joins a spot quote and its extra lines into a comprehensive purchase quote. */
function withExtras(quote: DayQuote, priced: { lines: ExtraLine[]; extrasCents: number }): PurchaseQuote {
  return { ...quote, total: quote.total + priced.extrasCents, extrasCents: priced.extrasCents, extras: priced.lines };
}

/** Price of a day, with the chosen extras per line, as the server computes it. It reserves nothing. */
export function quoteSpot(db: Database, beachId: string, request: DayRequest): Promise<PurchaseQuote> {
  return withBeach(db, beachId, async (tx) => {
    const [row] = await tx
      .select({ priceCents: inventoryDay.priceCents })
      .from(inventoryDay)
      .innerJoin(spot, eq(spot.id, inventoryDay.spotId))
      .leftJoin(hold, eq(hold.id, inventoryDay.activeHoldId))
      .where(and(eq(inventoryDay.spotId, request.spotId), eq(inventoryDay.day, request.day), eq(spot.retired, false), isFree));
    if (!row) throw new DomainError('inventory_conflict', 'This spot is not available on this day');

    const priced = await priceExtras(tx, request.extras ?? []);
    const code = normalizePromo(request.promoCode);
    if (!code) return withExtras(quoteDay(row.priceCents), priced);

    const [promo] = await tx
      .select({ percentBps: promotion.percentBps })
      .from(promotion)
      .where(and(eq(promotion.code, code), eq(promotion.active, true), sql`(${promotion.maxUses} is null or ${promotion.committedUses} < ${promotion.maxUses})`));
    // A promotion or convention discounts the spot alone: the extras are added after.
    if (promo) return withExtras(quoteDay(row.priceCents, { code, percentBps: promo.percentBps }), priced);
    const deal = await findConvention(tx, code, request.day);
    if (!deal) throw codeRefused();
    return withExtras(quoteConventionDay(row.priceCents, code, deal), priced);
  });
}

export interface HoldResult {
  holdId: string;
  status: (typeof hold.$inferSelect)['status'];
  expiresAt: Date;
  /** `total` is comprehensive: spot discounted price + extras. */
  quote: PurchaseQuote;
  /** True when the same request had already been served and nothing new was created. */
  replayed: boolean;
}

function toResult(row: typeof hold.$inferSelect, extras: ExtraLine[], replayed: boolean): HoldResult {
  return {
    holdId: row.id,
    status: row.status,
    expiresAt: row.expiresAt,
    quote: {
      listPrice: row.listPriceCents,
      discount: row.discountCents,
      total: row.totalCents,
      promoCode: row.promoCode,
      extrasCents: row.extrasCents,
      extras,
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
  // The idempotency fingerprint covers the extras in a canonical, sorted form: the
  // same request replays the same hold, different quantities are a different request.
  // Without extras the fingerprint is the same as before migration 015.
  const canonicalExtras = (request.extras ?? [])
    .map((entry) => [entry.serviceId, entry.quantity] as const)
    .sort((left, right) => left[0].localeCompare(right[0]));
  const hashedParts: unknown[] = [request.spotId, request.day, promoCode];
  if (canonicalExtras.length > 0) hashedParts.push(canonicalExtras);
  const requestHash = createHash('sha256').update(JSON.stringify(hashedParts)).digest('hex');

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
        return toResult(previous, await holdExtraLines(tx, previous.id), true);
      }
      if (!row) throw new DomainError('not_found', 'Spot or day not found');
      const [place] = await tx.select({ retired: spot.retired }).from(spot).where(eq(spot.id, request.spotId));
      if (place?.retired) throw new DomainError('inventory_conflict', 'This spot has been retired from sale');
      const [clock] = await tx.select({ past: sql<boolean>`${row.day}::date < (now() at time zone ${beach.timezone})::date` }).from(beach).where(eq(beach.id, beachId));
      if (clock?.past) throw new DomainError('inventory_conflict', 'This day has already passed');

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

      // Promotion first, then convention (same documented order as the quote); a
      // convention has no use counter, so it is only read, never locked.
      let promo: { id: string; percentBps: number } | undefined;
      let deal: { id: string; percentBps: number | null; fixedPriceCents: number | null } | undefined;
      if (promoCode) {
        [promo] = await tx
          .update(promotion)
          .set({ committedUses: sql`${promotion.committedUses} + 1` })
          .where(and(eq(promotion.code, promoCode), eq(promotion.active, true), sql`(${promotion.maxUses} is null or ${promotion.committedUses} < ${promotion.maxUses})`))
          .returning({ id: promotion.id, percentBps: promotion.percentBps });
        if (!promo) {
          deal = await findConvention(tx, promoCode, request.day);
          if (!deal) throw codeRefused();
        }
      }

      // The discount applies to the spot alone; the hold freezes the unit prices
      // of the extras in its own snapshot (hold_extra).
      const quote =
        promoCode && promo
          ? quoteDay(row.priceCents, { code: promoCode, percentBps: promo.percentBps })
          : promoCode && deal
            ? quoteConventionDay(row.priceCents, promoCode, deal)
            : quoteDay(row.priceCents);
      const priced = await priceExtras(tx, request.extras ?? []);
      const [created] = await tx
        .insert(hold)
        .values({
          beachId,
          inventoryDayId: row.id,
          promotionId: promo?.id ?? null,
          conventionId: deal?.id ?? null,
          idempotencyKey: request.idempotencyKey,
          requestHash,
          listPriceCents: quote.listPrice,
          discountCents: quote.discount,
          extrasCents: priced.extrasCents,
          totalCents: quote.total + priced.extrasCents,
          promoCode: quote.promoCode,
          expiresAt: sql`now() + make_interval(secs => ${request.ttlSeconds})`,
        })
        .returning();
      if (!created) throw new Error('hold was not created');
      if (priced.lines.length > 0) {
        await tx
          .insert(holdExtra)
          .values(priced.lines.map((line) => ({ beachId, holdId: created.id, serviceId: line.serviceId, quantity: line.quantity, unitPriceCents: line.unitPriceCents })));
      }

      await tx
        .update(inventoryDay)
        .set({ state: 'held', activeHoldId: created.id, updatedAt: sql`now()` })
        .where(eq(inventoryDay.id, row.id));
      return toResult(created, priced.lines, false);
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
