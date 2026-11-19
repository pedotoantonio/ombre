import { createHash } from 'node:crypto';
import { and, asc, eq, gte, ilike, inArray, or, sql } from 'drizzle-orm';
import { beachAmenities, quoteConventionDay, quoteDay, type DayQuote, type SeaSide, type SpotMark } from '@ombre/shared';
import { withBeach, type Database, type Transaction } from './client';
import { listElements, type LayoutElementView } from './layout';
import { beach, beachZone, extraService, hold, holdExtra, hotelConvention, inventoryDay, promotion, spot, spotType } from './schema';

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
  | 'request_not_payable'
  // ---- The cart and the order (D46) ----
  | 'cart_full'
  | 'cart_item_duplicate'
  // The spot does not belong to the cart's beach club (a cart is of ONE club).
  | 'cart_mixed_beach'
  // «Conferma e paga» is all or nothing: the message names the offending item.
  | 'order_item_unavailable'
  // ---- Reviews (D51) ----
  // Only a concluded, not cancelled stay can be reviewed; one review per stay.
  | 'review_not_allowed'
  | 'review_exists'
  // ---- Cancellation from the account (D53) ----
  | 'cancel_not_allowed'
  | 'cancel_deadline_passed'
  // ---- The planner's draft (D57) ----
  // The op points at a spot, element or zone that the draft no longer has.
  | 'draft_spot_missing'
  | 'draft_element_missing'
  | 'draft_zone_missing'
  // The target cell is already taken by a spot or an element in the draft.
  | 'draft_cell_taken'
  // The op is malformed or impossible on this grid.
  | 'draft_invalid_op'
  // Undo or apply on a draft with no operations.
  | 'draft_empty'
  // «Salva la spiaggia» failed: NOTHING was applied; failedIndex and reason say why.
  | 'draft_apply_failed'
  // Deleting from the planner (D57): a booked future refuses with its count, a
  // sold past points at retirement or maintenance.
  | 'spot_has_future_bookings'
  | 'spot_has_history';

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
  /** The amenities chosen from the fixed catalogue (D49), in catalogue order. */
  amenities: string[];
  /** Average (one decimal) and number of the verified reviews (D51); null without any. */
  rating: { average: number; count: number } | null;
  /** «Caparra adesso, saldo al lido» (D52): how the online payment at confirmation is sized. */
  paymentMode: 'full' | 'deposit';
  depositPercent: number;
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
  paymentMode: beach.paymentMode,
  depositPercent: beach.depositPercent,
  // The public policies of migrations 021 and 022 let these reads cross the beach
  // boundary for active clubs. Qualified by hand: an interpolated column would
  // render unqualified in the subquery.
  amenities: sql<string[]>`coalesce((select array_agg(a.amenity order by a.amenity) from beach_amenity a where a.beach_id = beach.id), '{}'::text[])`,
  ratingCount: sql<number>`(select count(*) from review r where r.beach_id = beach.id)::int`,
  ratingAverage: sql<string | null>`(select round(avg(r.rating)::numeric, 1)::text from review r where r.beach_id = beach.id)`,
};

type PublicBeachRow = Omit<PublicBeach, 'rating'> & { ratingCount: number; ratingAverage: string | null };

/** The chosen amenities in the catalogue's own order, whatever the storage order. */
function amenitiesInCatalogueOrder(chosen: readonly string[]): string[] {
  const set = new Set(chosen);
  return beachAmenities.filter((amenity) => set.has(amenity));
}

function toPublicBeach({ ratingCount, ratingAverage, ...club }: PublicBeachRow): PublicBeach {
  return {
    ...club,
    amenities: amenitiesInCatalogueOrder(club.amenities),
    rating: ratingCount > 0 && ratingAverage !== null ? { average: Number(ratingAverage), count: ratingCount } : null,
  };
}

/** True for the clubs that offer EVERY requested amenity (D49); everything else drops out. */
const hasAllAmenities = (required: readonly string[]) =>
  sql`(select count(*) from beach_amenity a where a.beach_id = beach.id and a.amenity = any(${sql.param(required.slice())}::text[])) = ${required.length}`;

export type SpotZone = (typeof spot.$inferSelect)['zone'];

/** A period never goes past a month (D38): beyond it there are season passes. */
export const periodMaxDays = 31;

/**
 * The consecutive days of a closed dal–al range, computed once in UTC so no time
 * zone can slip a day in. `to` equal to `from` is the single day; a backwards
 * range or one beyond 31 days is refused with a DomainError (D38, D39).
 */
export function periodDays(from: string, to: string): string[] {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) throw new DomainError('invalid_state', 'from and to must be YYYY-MM-DD days');
  if (end < start) throw new DomainError('invalid_state', 'The end day must not come before the start day');
  const span = (end - start) / 86_400_000 + 1;
  if (span > periodMaxDays) throw new DomainError('cap_reached', `The period must not exceed ${periodMaxDays} days`);
  return Array.from({ length: span }, (_, index) => new Date(start + index * 86_400_000).toISOString().slice(0, 10));
}

/** Zones in drawing and listing order: shore first, then umbrellas, then the land side. */
export const zoneOrder = sql`case ${spot.zone} when 'riva' then 0 when 'ombrelloni' then 1 else 2 end`;

/**
 * Active beach clubs. `place` keeps those whose locality or name contains the
 * text; `amenities` keeps only the clubs that offer ALL the requested ones (D49).
 */
export async function listActiveBeaches(db: Database, place?: string, amenities?: readonly string[]): Promise<PublicBeach[]> {
  const text = place?.trim();
  // The text is matched literally: the wildcards of LIKE lose their meaning.
  const pattern = text ? `%${text.replace(/[\\%_]/g, '\\$&')}%` : null;
  const rows = await db
    .select(publicBeachColumns)
    .from(beach)
    .where(
      and(
        eq(beach.status, 'active'),
        pattern ? or(ilike(beach.locality, pattern), ilike(beach.name, pattern)) : undefined,
        amenities && amenities.length > 0 ? hasAllAmenities(amenities) : undefined,
      ),
    )
    .orderBy(asc(beach.name));
  return rows.map(toPublicBeach);
}

export async function findActiveBeach(db: Database, slug: string): Promise<PublicBeach | null> {
  const rows = await db.select(publicBeachColumns).from(beach).where(and(eq(beach.slug, slug), eq(beach.status, 'active')));
  return rows[0] ? toPublicBeach(rows[0]) : null;
}

export interface AvailableSpot {
  spotId: string;
  code: string;
  zone: SpotZone;
  /** Name of the manager's named zone (D50); null when the spot belongs to none. */
  zoneName: string | null;
  rowNumber: number;
  col: number;
  typeName: string;
  typeMark: SpotMark;
  umbrellas: number;
  sunbeds: number;
  maxGuests: number;
  /** Total over the period: sum of the days. */
  priceCents: number;
  /** True when EVERY day of the period is a shared one; a period may mix ordinary and shared days (D39). */
  shared: boolean;
}

// A day is free when nobody holds it, or when the hold has run out even if no job has cleaned it yet.
const notPast = sql`${inventoryDay.day} >= (select (now() at time zone b.timezone)::date from beach b where b.id = ${inventoryDay.beachId})`;
const isFree = sql`((${inventoryDay.state} = 'available' or (${inventoryDay.state} = 'held' and ${hold.expiresAt} <= now())) and ${notPast})`;

/**
 * Spots that can be bought for the WHOLE dal–al period (D39): a spot is listed
 * only when it is free on every day, and its price is the sum of the days.
 */
export function listAvailability(db: Database, beachId: string, day: string, to: string = day): Promise<AvailableSpot[]> {
  const days = periodDays(day, to);
  return withBeach(db, beachId, (tx) =>
    tx
      .select({
        spotId: spot.id,
        code: spot.code,
        zone: spot.zone,
        zoneName: beachZone.name,
        rowNumber: spot.rowNumber,
        col: spot.col,
        typeName: spotType.name,
        typeMark: spotType.mark,
        umbrellas: spot.umbrellas,
        sunbeds: spot.sunbeds,
        maxGuests: spot.maxGuests,
        priceCents: sql<number>`sum(${inventoryDay.priceCents})::int`,
        shared: sql<boolean>`bool_and(${inventoryDay.shared})`,
      })
      .from(inventoryDay)
      .innerJoin(spot, eq(spot.id, inventoryDay.spotId))
      .innerJoin(spotType, eq(spotType.id, spot.typeId))
      .leftJoin(beachZone, eq(beachZone.id, spot.namedZoneId))
      .leftJoin(hold, eq(hold.id, inventoryDay.activeHoldId))
      // A spot under maintenance (D56) cannot be bought, exactly like a retired one.
      .where(and(inArray(inventoryDay.day, days), eq(spot.retired, false), eq(spot.maintenance, false), isFree))
      .groupBy(spot.id, spot.code, spot.zone, beachZone.name, spot.rowNumber, spot.col, spotType.name, spotType.mark, spot.umbrellas, spot.sunbeds, spot.maxGuests)
      .having(sql`count(*) = ${days.length}`)
      .orderBy(zoneOrder, asc(spot.rowNumber), asc(spot.col)),
  );
}

export interface DaySpot {
  spotId: string;
  code: string;
  zone: SpotZone;
  /** Name of the manager's named zone (D50); null when the spot belongs to none. */
  zoneName: string | null;
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
  /** `unavailable` covers everything that cannot be bought on every day of the period: held, sold, blocked, never published, past, under maintenance. */
  status: 'free' | 'shared' | 'unavailable';
  /** Under maintenance (D56): never buyable, but it stays in the drawing. */
  maintenance: boolean;
  /** Only for a spot that can be bought: the sum over the period. */
  priceCents: number | null;
}

/**
 * Every spot of the beach club over a dal–al period, for the map: the ones free
 * on EVERY day with their total price (D39), the others without details. The
 * `shared` badge appears only when every day is a shared one; a period may mix
 * ordinary and shared days. Retired spots stay hidden.
 */
export function listDayMap(db: Database, beachId: string, day: string, to: string = day): Promise<DaySpot[]> {
  const days = periodDays(day, to);
  return withBeach(db, beachId, async (tx) => {
    const rows = await tx
      .select({
        spotId: spot.id,
        code: spot.code,
        zone: spot.zone,
        zoneName: beachZone.name,
        rowNumber: spot.rowNumber,
        col: spot.col,
        typeName: spotType.name,
        typeMark: spotType.mark,
        umbrellas: spot.umbrellas,
        sunbeds: spot.sunbeds,
        maxGuests: spot.maxGuests,
        maintenance: spot.maintenance,
        freeDays: sql<number>`count(*) filter (where ${isFree})::int`,
        priceCents: sql<number | null>`sum(${inventoryDay.priceCents}) filter (where ${isFree})::int`,
        shared: sql<boolean>`coalesce(bool_and(${inventoryDay.shared}) filter (where ${isFree}), false)`,
      })
      .from(spot)
      .innerJoin(spotType, eq(spotType.id, spot.typeId))
      .leftJoin(beachZone, eq(beachZone.id, spot.namedZoneId))
      .leftJoin(inventoryDay, and(eq(inventoryDay.spotId, spot.id), inArray(inventoryDay.day, days)))
      .leftJoin(hold, eq(hold.id, inventoryDay.activeHoldId))
      .where(eq(spot.retired, false))
      .groupBy(spot.id, spot.code, spot.zone, beachZone.name, spot.rowNumber, spot.col, spotType.name, spotType.mark, spot.umbrellas, spot.sunbeds, spot.maxGuests)
      .orderBy(zoneOrder, asc(spot.rowNumber), asc(spot.col));
    // A spot under maintenance (D56) stays in the drawing but can never be bought.
    return rows.map(({ freeDays, priceCents, shared, ...place }) =>
      !place.maintenance && freeDays === days.length && priceCents !== null
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
  /** Last day of the period; the single day when not given (D39). */
  to?: string;
  /** People who must fit under one spot. One when not given. */
  guests?: number;
  sharedOnly?: boolean;
  place?: string;
  /** Catalogue identifiers (D49): only the clubs that offer them ALL are kept. */
  amenities?: readonly string[];
}

export interface BeachOffer extends PublicBeach {
  /** Spots that can be bought on EVERY day of the period and fit the guests. */
  freeSpots: number;
  /** Lowest total over the period among those same spots: a price that can really be paid. Null when there is none. */
  priceFromCents: number | null;
}

/** Active beach clubs with what each one can sell over a dal–al period. Each club is read inside its own boundary. */
export async function searchBeaches(db: Database, search: BeachSearch): Promise<BeachOffer[]> {
  const days = periodDays(search.day, search.to ?? search.day);
  const beaches = await listActiveBeaches(db, search.place, search.amenities);
  const offers: BeachOffer[] = [];
  for (const target of beaches) {
    // One row per spot free on every day, with the total of the period; with
    // sharedOnly, every day of the period must be a shared one.
    const rows = await withBeach(db, target.id, (tx) =>
      tx
        .select({ totalCents: sql<number>`sum(${inventoryDay.priceCents})::int` })
        .from(inventoryDay)
        .innerJoin(spot, eq(spot.id, inventoryDay.spotId))
        .leftJoin(hold, eq(hold.id, inventoryDay.activeHoldId))
        .where(and(inArray(inventoryDay.day, days), eq(spot.retired, false), eq(spot.maintenance, false), isFree, gte(spot.maxGuests, search.guests ?? 1), search.sharedOnly ? eq(inventoryDay.shared, true) : undefined))
        .groupBy(inventoryDay.spotId)
        .having(sql`count(*) = ${days.length}`),
    );
    offers.push({ ...target, freeSpots: rows.length, priceFromCents: rows.length > 0 ? Math.min(...rows.map((row) => row.totalCents)) : null });
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
      .where(and(sql`${inventoryDay.day} >= (now() at time zone ${target.timezone})::date`, eq(spot.retired, false), eq(spot.maintenance, false), isFree));
    return row?.day ?? null;
  });
}

export interface HoldView {
  holdId: string;
  status: (typeof hold.$inferSelect)['status'];
  /** False once the time is up, even if the row still says active. */
  live: boolean;
  expiresAt: Date;
  /** First day of the reserved period; `from`–`to` carry the whole of it (D39). */
  day: string;
  from: string;
  to: string;
  spotCode: string;
  /** Name of the manager's named zone (D50); null when the spot belongs to none. */
  zoneName: string | null;
  rowNumber: number;
  umbrellas: number;
  sunbeds: number;
  /** `total` is comprehensive over the period: discounted days + extras, chosen once. */
  quote: PurchaseQuote;
}

/** The reserve family behind a lead hold, each member with its day, first day first. */
async function holdFamilyRows(tx: Transaction, lead: typeof hold.$inferSelect): Promise<{ held: typeof hold.$inferSelect; day: string }[]> {
  const rows = await tx
    .select({ held: hold, day: inventoryDay.day })
    .from(hold)
    .innerJoin(inventoryDay, eq(inventoryDay.id, hold.inventoryDayId))
    .where(or(eq(hold.id, lead.id), eq(hold.parentHoldId, lead.id)))
    .orderBy(asc(inventoryDay.day));
  return rows;
}

/** Joins the per-day quotes of a family into the period quote, extras counted once (they sit on the lead). */
function familyQuote(members: { held: typeof hold.$inferSelect; day: string }[], extras: ExtraLine[]): PurchaseQuote {
  const listPrice = members.reduce((sum, member) => sum + member.held.listPriceCents, 0);
  const discount = members.reduce((sum, member) => sum + member.held.discountCents, 0);
  const extrasCents = members.reduce((sum, member) => sum + member.held.extrasCents, 0);
  const total = members.reduce((sum, member) => sum + member.held.totalCents, 0);
  return {
    listPrice,
    discount,
    total,
    promoCode: members[0]?.held.promoCode ?? null,
    extrasCents,
    extras,
    days: members.map((member) => ({
      day: member.day,
      listPriceCents: member.held.listPriceCents,
      discountCents: member.held.discountCents,
      totalCents: member.held.totalCents - member.held.extrasCents,
    })),
  };
}

export async function getHold(db: Database, beachId: string, holdId: string): Promise<HoldView> {
  return withBeach(db, beachId, async (tx) => {
    const [row] = await tx
      .select({
        hold,
        live: sql<boolean>`${hold.status} = 'active' and ${hold.expiresAt} > now()`,
        day: inventoryDay.day,
        spotCode: spot.code,
        zoneName: beachZone.name,
        rowNumber: spot.rowNumber,
        umbrellas: spot.umbrellas,
        sunbeds: spot.sunbeds,
      })
      .from(hold)
      .innerJoin(inventoryDay, eq(inventoryDay.id, hold.inventoryDayId))
      .innerJoin(spot, eq(spot.id, inventoryDay.spotId))
      .leftJoin(beachZone, eq(beachZone.id, spot.namedZoneId))
      .where(eq(hold.id, holdId));
    if (!row || row.hold.parentHoldId !== null) throw new DomainError('not_found', 'Hold not found');
    const members = await holdFamilyRows(tx, row.hold);
    return {
      holdId: row.hold.id,
      status: row.hold.status,
      live: row.live,
      expiresAt: row.hold.expiresAt,
      day: members[0]?.day ?? row.day,
      from: members[0]?.day ?? row.day,
      to: members[members.length - 1]?.day ?? row.day,
      spotCode: row.spotCode,
      zoneName: row.zoneName,
      rowNumber: row.rowNumber,
      umbrellas: row.umbrellas,
      sunbeds: row.sunbeds,
      quote: familyQuote(members, await holdExtraLines(tx, row.hold.id)),
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

/** One day of a period quote: the spot alone, discounts applied per day as always (D39). */
export interface PeriodDayQuote {
  day: string;
  listPriceCents: number;
  discountCents: number;
  totalCents: number;
}

/**
 * A full purchase quote: the spot fields of DayQuote (list price, discount — a
 * promotion or hotel convention discounts the spot alone, never the extras) plus
 * the extras per line. `total` is comprehensive: listPrice − discount + extrasCents.
 * Over a period every money field is the sum of the days; `days` lists them.
 */
export interface PurchaseQuote extends DayQuote {
  extrasCents: number;
  extras: ExtraLine[];
  /** The days of the period, in order; absent only on pre-period payloads. */
  days?: PeriodDayQuote[];
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
  /** Last day of the period; the single day when left out (D39). */
  to?: string | null;
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

/** An active convention whose validity window, when set, contains the WHOLE booked period. */
async function findConvention(tx: Transaction, code: string, from: string, to: string = from): Promise<ConventionPricing | undefined> {
  const [deal] = await tx
    .select({ id: hotelConvention.id, percentBps: hotelConvention.percentBps, fixedPriceCents: hotelConvention.fixedPriceCents })
    .from(hotelConvention)
    .where(
      and(
        eq(hotelConvention.code, code),
        eq(hotelConvention.active, true),
        sql`(${hotelConvention.validFrom} is null or ${hotelConvention.validFrom} <= ${from})`,
        sql`(${hotelConvention.validTo} is null or ${hotelConvention.validTo} >= ${to})`,
      ),
    );
  return deal;
}

/** Joins per-day spot quotes and the extra lines into a comprehensive period quote (D39). */
function periodPurchaseQuote(days: string[], per: DayQuote[], priced: { lines: ExtraLine[]; extrasCents: number }): PurchaseQuote {
  const listPrice = per.reduce((sum, quote) => sum + quote.listPrice, 0);
  const discount = per.reduce((sum, quote) => sum + quote.discount, 0);
  const total = per.reduce((sum, quote) => sum + quote.total, 0) + priced.extrasCents;
  return {
    listPrice,
    discount,
    total,
    promoCode: per[0]?.promoCode ?? null,
    extrasCents: priced.extrasCents,
    extras: priced.lines,
    days: per.map((quote, index) => ({ day: days[index]!, listPriceCents: quote.listPrice, discountCents: quote.discount, totalCents: quote.total })),
  };
}

/**
 * Price of a dal–al period, with the chosen extras per line, as the server
 * computes it: discounts per day as always and summed, extras once for the
 * period. It reserves nothing. The spot must be free on EVERY day.
 */
export function quoteSpot(db: Database, beachId: string, request: DayRequest): Promise<PurchaseQuote> {
  return withBeach(db, beachId, (tx) => quoteSpotWithin(tx, request));
}

/** The same quote inside an existing beach transaction: the cart recomputes each item with it (D46). */
export async function quoteSpotWithin(tx: Transaction, request: DayRequest): Promise<PurchaseQuote> {
  const days = periodDays(request.day, request.to ?? request.day);
  const rows = await tx
    .select({ day: inventoryDay.day, priceCents: inventoryDay.priceCents })
    .from(inventoryDay)
    .innerJoin(spot, eq(spot.id, inventoryDay.spotId))
    .leftJoin(hold, eq(hold.id, inventoryDay.activeHoldId))
    .where(and(eq(inventoryDay.spotId, request.spotId), inArray(inventoryDay.day, days), eq(spot.retired, false), eq(spot.maintenance, false), isFree))
    .orderBy(asc(inventoryDay.day));
  if (rows.length !== days.length) {
    throw new DomainError('inventory_conflict', days.length === 1 ? 'This spot is not available on this day' : 'This spot is not available on every day of this period');
  }

  const priced = await priceExtras(tx, request.extras ?? []);
  const code = normalizePromo(request.promoCode);
  if (!code) return periodPurchaseQuote(days, rows.map((row) => quoteDay(row.priceCents)), priced);

  const [promo] = await tx
    .select({ percentBps: promotion.percentBps })
    .from(promotion)
    .where(and(eq(promotion.code, code), eq(promotion.active, true), sql`(${promotion.maxUses} is null or ${promotion.committedUses} < ${promotion.maxUses})`));
  // A promotion or convention discounts the spot alone, day by day: the extras are added after.
  if (promo) return periodPurchaseQuote(days, rows.map((row) => quoteDay(row.priceCents, { code, percentBps: promo.percentBps })), priced);
  const deal = await findConvention(tx, code, days[0]!, days[days.length - 1]!);
  if (!deal) throw codeRefused();
  return periodPurchaseQuote(days, rows.map((row) => quoteConventionDay(row.priceCents, code, deal)), priced);
}

export interface HoldResult {
  holdId: string;
  status: (typeof hold.$inferSelect)['status'];
  expiresAt: Date;
  /** The reserved period; from = to for the single day (D39). */
  from: string;
  to: string;
  /** `total` is comprehensive over the period: discounted days + extras, chosen once. */
  quote: PurchaseQuote;
  /** True when the same request had already been served and nothing new was created. */
  replayed: boolean;
}

function toResult(lead: typeof hold.$inferSelect, members: { held: typeof hold.$inferSelect; day: string }[], extras: ExtraLine[], replayed: boolean): HoldResult {
  return {
    holdId: lead.id,
    status: lead.status,
    expiresAt: lead.expiresAt,
    from: members[0]?.day ?? '',
    to: members[members.length - 1]?.day ?? '',
    quote: familyQuote(members, extras),
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
 * Takes a dal–al period for a limited time, all or nothing (D39): every day of the
 * period is locked and must be free, one hold per day is written with a SINGLE
 * expiry — the first day leads the family, the others name it — and the extras
 * are frozen once on the lead. The inventory rows are locked first, in identifier
 * order like every multi-day path, so two buyers of the same days are served one
 * after the other and only one can win. Lock order is always inventory rows,
 * then promotion.
 */
export async function acquireHold(db: Database, beachId: string, request: HoldRequest): Promise<HoldResult> {
  try {
    return await withBeach(db, beachId, (tx) => acquireHoldWithin(tx, beachId, request));
  } catch (error) {
    // Two different requests raced with the same key: the unique index stopped the second.
    if (errorCode(error) === '23505') {
      throw new DomainError('idempotency_mismatch', 'This idempotency key was used for a different request');
    }
    throw error;
  }
}

/**
 * The same reserve inside an existing beach transaction: the order confirmation
 * (D46) takes every item's family through it, so one transaction holds them all
 * with ONE shared expiry. A unique-key race (23505) aborts the transaction and
 * is mapped by the caller.
 */
export async function acquireHoldWithin(tx: Transaction, beachId: string, request: HoldRequest): Promise<HoldResult> {
  const promoCode = normalizePromo(request.promoCode);
  const days = periodDays(request.day, request.to ?? request.day);
  // The idempotency fingerprint covers the extras in a canonical, sorted form: the
  // same request replays the same hold, different quantities are a different request.
  // Without extras and for a single day the fingerprint is the same as before.
  const canonicalExtras = (request.extras ?? [])
    .map((entry) => [entry.serviceId, entry.quantity] as const)
    .sort((left, right) => left[0].localeCompare(right[0]));
  const hashedParts: unknown[] = [request.spotId, request.day, promoCode];
  if (canonicalExtras.length > 0) hashedParts.push(canonicalExtras);
  if (days.length > 1) hashedParts.push(['to', days[days.length - 1]]);
  const requestHash = createHash('sha256').update(JSON.stringify(hashedParts)).digest('hex');

  const rows = await tx
    .select()
    .from(inventoryDay)
    .where(and(eq(inventoryDay.spotId, request.spotId), inArray(inventoryDay.day, days)))
    .orderBy(asc(inventoryDay.id))
    .for('update');

  const [previous] = await tx.select().from(hold).where(eq(hold.idempotencyKey, request.idempotencyKey));
  if (previous) {
    if (previous.requestHash !== requestHash || previous.parentHoldId !== null) {
      throw new DomainError('idempotency_mismatch', 'This idempotency key was used for a different request');
    }
    return toResult(previous, await holdFamilyRows(tx, previous), await holdExtraLines(tx, previous.id), true);
  }
  if (rows.length !== days.length) throw new DomainError('not_found', 'Spot or day not found');
  const [place] = await tx.select({ retired: spot.retired, maintenance: spot.maintenance }).from(spot).where(eq(spot.id, request.spotId));
  if (place?.retired) throw new DomainError('inventory_conflict', 'This spot has been retired from sale');
  // Maintenance (D56): not bookable from any channel — online, desk, cart — while it lasts.
  if (place?.maintenance) throw new DomainError('inventory_conflict', 'This spot is under maintenance');
  const [clock] = await tx.select({ past: sql<boolean>`${days[0]}::date < (now() at time zone ${beach.timezone})::date` }).from(beach).where(eq(beach.id, beachId));
  if (clock?.past) throw new DomainError('inventory_conflict', 'This day has already passed');

  for (const row of rows) {
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
    // One busy day refuses the whole period: the reserve is all or nothing (D39).
    if (state !== 'available') throw new DomainError('inventory_conflict', 'This spot has just been taken');
  }

  // Promotion first, then convention (same documented order as the quote); a
  // convention has no use counter, so it is only read, never locked. The
  // promotion commits one use per day, as its economy stays per day.
  let promo: { id: string; percentBps: number } | undefined;
  let deal: { id: string; percentBps: number | null; fixedPriceCents: number | null } | undefined;
  if (promoCode) {
    [promo] = await tx
      .update(promotion)
      .set({ committedUses: sql`${promotion.committedUses} + ${days.length}` })
      .where(and(eq(promotion.code, promoCode), eq(promotion.active, true), sql`(${promotion.maxUses} is null or ${promotion.committedUses} + ${days.length} <= ${promotion.maxUses})`))
      .returning({ id: promotion.id, percentBps: promotion.percentBps });
    if (!promo) {
      deal = await findConvention(tx, promoCode, days[0]!, days[days.length - 1]!);
      if (!deal) throw codeRefused();
    }
  }

  // The discount applies to the spot alone, day by day; the lead hold freezes
  // the unit prices of the extras in its own snapshot (hold_extra), once for
  // the whole period.
  const priced = await priceExtras(tx, request.extras ?? []);
  const byDay = new Map(rows.map((row) => [row.day, row]));
  let lead: typeof hold.$inferSelect | undefined;
  const members: { held: typeof hold.$inferSelect; day: string }[] = [];
  for (const [index, day] of days.entries()) {
    const row = byDay.get(day)!;
    const quote =
      promoCode && promo
        ? quoteDay(row.priceCents, { code: promoCode, percentBps: promo.percentBps })
        : promoCode && deal
          ? quoteConventionDay(row.priceCents, promoCode, deal)
          : quoteDay(row.priceCents);
    const extrasCents = index === 0 ? priced.extrasCents : 0;
    const [created] = await tx
      .insert(hold)
      .values({
        beachId,
        inventoryDayId: row.id,
        parentHoldId: index === 0 ? null : lead!.id,
        promotionId: promo?.id ?? null,
        conventionId: deal?.id ?? null,
        idempotencyKey: index === 0 ? request.idempotencyKey : `${lead!.id}#${index}`,
        requestHash,
        listPriceCents: quote.listPrice,
        discountCents: quote.discount,
        extrasCents,
        totalCents: quote.total + extrasCents,
        promoCode: quote.promoCode,
        // now() is transaction-stable: the whole family shares ONE expiry (D39).
        expiresAt: sql`now() + make_interval(secs => ${request.ttlSeconds})`,
      })
      .returning();
    if (!created) throw new Error('hold was not created');
    if (index === 0) lead = created;
    members.push({ held: created, day });
    await tx
      .update(inventoryDay)
      .set({ state: 'held', activeHoldId: created.id, updatedAt: sql`now()` })
      .where(eq(inventoryDay.id, row.id));
  }
  if (priced.lines.length > 0) {
    await tx
      .insert(holdExtra)
      .values(priced.lines.map((line) => ({ beachId, holdId: lead!.id, serviceId: line.serviceId, quantity: line.quantity, unitPriceCents: line.unitPriceCents })));
  }
  return toResult(lead!, members, priced.lines, false);
}

/** Gives a reserved period back, the whole family (D39). Returns false when the lead hold was no longer active. */
export function releaseHold(db: Database, beachId: string, holdId: string): Promise<boolean> {
  return withBeach(db, beachId, async (tx) => {
    const [target] = await tx.select().from(hold).where(eq(hold.id, holdId));
    if (!target || target.parentHoldId !== null) throw new DomainError('not_found', 'Hold not found');
    const family = await tx
      .select()
      .from(hold)
      .where(or(eq(hold.id, holdId), eq(hold.parentHoldId, holdId)));
    await tx
      .select({ id: inventoryDay.id })
      .from(inventoryDay)
      .where(inArray(inventoryDay.id, family.map((member) => member.inventoryDayId)))
      .orderBy(asc(inventoryDay.id))
      .for('update');

    let leadReleased = false;
    for (const member of family) {
      const [released] = await tx
        .update(hold)
        .set({ status: 'released' })
        .where(and(eq(hold.id, member.id), eq(hold.status, 'active')))
        .returning({ promotionId: hold.promotionId });
      if (!released) continue;
      if (member.id === holdId) leadReleased = true;
      await returnPromoUse(tx, released.promotionId);
      await tx
        .update(inventoryDay)
        .set({ state: 'available', activeHoldId: null, updatedAt: sql`now()` })
        .where(and(eq(inventoryDay.id, member.inventoryDayId), eq(inventoryDay.activeHoldId, member.id)));
    }
    return leadReleased;
  });
}
