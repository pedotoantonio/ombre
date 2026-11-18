import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { formatDeadline, formatLongPeriod, paymentRequestMessage } from '@ombre/comms';
import {
  acquireHold,
  addElement,
  addExtrasAsOwner,
  addExtrasToBooking,
  addItem,
  addRow,
  addRows,
  addSpot,
  applyPaymentOutcome,
  cancelPaymentRequest,
  collectAtDesk,
  createPaymentRequest,
  assignCabin,
  authorize,
  beginTwoFactor,
  cabinHistory,
  cabinsToday,
  cancelByBeachClub,
  cartAccessToken,
  cartOwnerId,
  cartTokenIsValid,
  changePassword,
  checkAccess,
  claimCart,
  confirmOrder,
  confirmTwoFactor,
  conventionStatement,
  createCabin,
  createCart,
  createContract,
  createConvention,
  createExtraService,
  createSpotType,
  decideProposal,
  decideSublet,
  deleteCabin,
  deleteConvention,
  deleteExtraService,
  deleteSpot,
  deleteSpotType,
  deskBooking,
  DomainError,
  endAssignment,
  findActiveBeach,
  getBooking,
  getCart,
  getHold,
  getOrder,
  getLayout,
  getPublicCanvas,
  getPublishedSite,
  getSharingSettings,
  getSiteState,
  holderStatement,
  identityLogin,
  listActiveBeaches,
  listActiveExtras,
  listCabins,
  listDayMap,
  listBookings,
  listContracts,
  listConventions,
  listDayOperations,
  listDeskConventions,
  listExtraServices,
  listInventory,
  listMyCabins,
  listMyContracts,
  listNotifications,
  listPaymentRequests,
  listPendingSublets,
  listProposals,
  plannerGrid,
  plannerMaxDays,
  listMemberships,
  listMyBookings,
  listMyCarts,
  listSpotTypes,
  locateCartBeach,
  login,
  logout,
  passwordMinLength,
  registerAccount,
  relinkBookings,
  moveBooking,
  nextAvailableDay,
  proposeDays,
  proposeSublet,
  publishDraft,
  publishDay,
  readPayRequest,
  removeElement,
  removeItem,
  reportSummary,
  resolveSession,
  restoreRevision,
  saveDraft,
  searchBeaches,
  setBeachPosition,
  setBlocked,
  setBlockedBulk,
  setContractStatus,
  setConventionStatus,
  setExtraServiceStatus,
  setGapRows,
  setPrice,
  setRetired,
  setRowRental,
  setSeaSide,
  setSharingSettings,
  setSpotType,
  spotCard,
  startCheckout,
  startPayRequestPayment,
  statisticsReport,
  updateCabin,
  updateConvention,
  updateExtraService,
  updateItem,
  updateSpot,
  updateSpotType,
  withdrawDay,
  quoteSpot,
  maxExtraQuantity,
  type Database,
  type DomainErrorCode,
  type PayRequestMessageData,
  type PaymentRequestRow,
  type PublicBeach,
  type PurchaseQuote,
  type SessionUser,
} from '@ombre/db';
import { buildOpenApi, type Operation } from './openapi';
import { createRateLimiter, type RateLimiter } from './rate-limit';
import {
  base32Encode,
  cabinCodeMaxLength,
  cabinNotesMaxLength,
  decorationSigns,
  elementLabelMaxLength,
  expandRecurrence,
  holderContactMaxLength,
  holderNameMaxLength,
  maxColumns,
  maxGapRows,
  occupantNameMaxLength,
  payPath,
  rentalNotesMaxLength,
  rentalTypeMaxLength,
  seaSides,
  siteTemplates,
  siteTextLimits,
  spotMarks,
  spotTypeNameMaxLength,
  spotZones,
  suggestSpot,
  type Action,
  type DayQuote,
} from '@ombre/shared';

export interface AppOptions {
  db: Database;
  /** How long a hold keeps a spot, in seconds. */
  holdSeconds: number;
  /** How long a sign-in lasts, in seconds. Twelve hours when not given. */
  sessionSeconds?: number;
  /** Signs booking links and passes. At least 32 characters. */
  signingSecret: string;
  /** Shared with the test payment provider. Without it the test provider is switched off. */
  sandboxWebhookSecret?: string;
  /**
   * Sign-in with an external identity (D48). Absent: the link does not exist,
   * the callback answers 503. Every secret stays here, on the API side.
   */
  oidc?: { provider: 'test'; testSecret: string } | { provider: 'google'; clientId: string; clientSecret: string; redirectUrl: string };
  /** Public address of the website, for the /paga/{token} links in the messages. */
  siteUrl?: string;
  /** Shared counter of requests. A new one is created when not given. */
  rateLimiter?: RateLimiter;
  /** When true, managers must switch two-step verification on before managing a beach club. */
  requireTwoFactor?: boolean;
  /** Name shown by authenticator apps. */
  brand?: string;
  log?: (message: string, error: unknown) => void;
}

type Handler = (c: Context) => Response | Promise<Response>;

class HttpError extends Error {
  readonly status: 400 | 401 | 403 | 404 | 422 | 503;
  readonly code: string;

  constructor(status: 400 | 401 | 403 | 404 | 422 | 503, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const domainStatus: Record<DomainErrorCode, 401 | 403 | 404 | 409 | 422 | 429> = {
  not_found: 404,
  inventory_conflict: 409,
  promo_not_applicable: 422,
  code_taken: 409,
  idempotency_mismatch: 422,
  invalid_credentials: 401,
  account_locked: 429,
  forbidden: 403,
  invalid_state: 409,
  hold_expired: 409,
  pass_invalid: 422,
  wrong_day: 409,
  extra_not_available: 422,
  cap_reached: 409,
  version_conflict: 409,
  totp_required: 401,
  totp_invalid: 422,
  totp_setup_required: 403,
  // The one neutral refusal of /paga/{token}: it never says why (spec §4.3).
  request_unavailable: 404,
  request_not_payable: 409,
  // ---- The cart and the order (D46) ----
  cart_full: 409,
  cart_item_duplicate: 409,
  cart_mixed_beach: 422,
  // «Conferma e paga» is all or nothing: the message names the offending item.
  order_item_unavailable: 409,
};

const slugSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(80);
const daySchema = z.iso.date();
// Extra services chosen with the spot (spec §4.2): quantities per service, each
// service at most once, with a reasonable ceiling per quantity.
const extrasRequestSchema = z
  .array(z.object({ serviceId: z.uuid(), quantity: z.number().int().min(1).max(maxExtraQuantity) }))
  .max(20)
  .refine((extras) => new Set(extras.map((entry) => entry.serviceId)).size === extras.length)
  .optional();
// Since D39 a quote or a hold may cover a dal–al period: `to` is the last day,
// equal to `day` when left out; at most 31 consecutive days (checked in the domain).
const dayRequestSchema = z.object({
  beachSlug: slugSchema,
  spotId: z.uuid(),
  day: daySchema,
  to: daySchema.optional(),
  promoCode: z.string().trim().min(1).max(40).optional(),
  extras: extrasRequestSchema,
});
const codeSchema = z.string().regex(/^\d{6}$/);
const loginSchema = z.object({ email: z.email().max(200), password: z.string().min(1).max(200), code: codeSchema.optional() });
// The guest's account (D44): name and email, nothing else; the password is generated.
const registerSchema = z.object({ name: z.string().trim().min(1).max(120), email: z.email().max(200), locale: z.enum(['it', 'en']).default('it') });
const changePasswordSchema = z.object({ current: z.string().min(1).max(200), next: z.string().min(1).max(200) });
const priceSchema = z.number().int().min(0).max(1_000_000);
const publishSchema = z.object({ day: daySchema, priceCents: priceSchema, spotIds: z.array(z.uuid()).min(1).max(500).optional() });
const blockSchema = z.object({ spotId: z.uuid(), day: daySchema, blocked: z.boolean(), reason: z.string().trim().max(200).optional() });
const bulkBlockSchema = z.object({ day: daySchema, spotIds: z.array(z.uuid()).min(1).max(500), blocked: z.boolean(), reason: z.string().trim().max(200).optional() });
const guestsQuerySchema = z.string().regex(/^\d{1,2}$/).transform(Number).pipe(z.number().int().min(1).max(20)).optional();
const spotPriceSchema = z.object({ spotId: z.uuid(), day: daySchema, priceCents: priceSchema });
const checkoutSchema = z.object({
  beachSlug: slugSchema,
  holdId: z.uuid(),
  guestName: z.string().trim().min(1).max(120),
  guestEmail: z.email().max(200),
  locale: z.enum(['it', 'en']).default('it'),
});
const noticeSchema = z.object({
  eventId: z.string().min(8).max(100),
  reference: z.string().min(8).max(100),
  outcome: z.enum(['succeeded', 'failed']),
});
const accessSchema = z.object({ credential: z.string().trim().min(8).max(120), kind: z.enum(['entry', 'exit']) });
const contractSchema = z.object({
  holderEmail: z.email().max(200),
  spotId: z.uuid(),
  validFrom: daySchema,
  validTo: daySchema,
  sharingMode: z.enum(['per_day', 'automatic']).default('per_day'),
});
const sharingSettingsSchema = z.object({ dailySharedCap: z.number().int().min(0).max(10_000).nullable(), sharedPriceCents: priceSchema.nullable() });
const decisionSchema = z.object({ approve: z.boolean(), priceCents: priceSchema.optional() });
const proposeSchema = z
  .object({
    days: z.array(daySchema).min(1).max(366).optional(),
    recurrence: z.object({ from: daySchema, to: daySchema, weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7) }).optional(),
  })
  .refine((value) => Boolean(value.days) !== Boolean(value.recurrence));
// Website texts are plain text: anything that looks like markup is refused.
const plain = (max: number) => z.string().trim().max(max).regex(/^[^<>]*$/);
// Pictures can only come from the sample library shipped with the site: no outside addresses.
const siteImageSchema = z.object({ src: z.string().regex(/^\/demo\/[a-z0-9-]+\.svg$/), alt: plain(160).min(1) });
const siteTextsSchema = z.object({
  tagline: plain(siteTextLimits.tagline),
  description: plain(siteTextLimits.description),
  services: z.array(plain(siteTextLimits.service).min(1)).max(siteTextLimits.services),
  openingPeriod: plain(siteTextLimits.line),
  openingHours: plain(siteTextLimits.line),
  address: plain(siteTextLimits.line),
  phone: z.string().trim().max(siteTextLimits.phone).regex(/^[+0-9 ()./-]*$/),
  accessibility: plain(siteTextLimits.accessibility),
  images: z.object({ cover: siteImageSchema.nullable(), gallery: z.array(siteImageSchema).max(12) }).optional(),
});
const siteDraftSchema = z.object({
  expectedVersion: z.number().int().min(1).nullable(),
  template: z.enum(siteTemplates),
  content: z.object({ it: siteTextsSchema.refine((texts) => texts.description.length > 0), en: siteTextsSchema.nullable() }),
});
// The desk picks a convention from a list, by identifier, never by typing the code.
// Extras follow the same internal hold as an online purchase (spec §4.2). Email and
// phone are optional (spec §4.3); `collect: later` confirms «da incassare» (D31).
const guestPhoneSchema = z.string().trim().min(3).max(40).regex(/^[+0-9 ()./-]+$/);
const deskSchema = z.object({
  spotId: z.uuid(),
  day: daySchema,
  /** Last day of the period (D39): the desk books dal–al like the website; one day when left out. */
  to: daySchema.optional(),
  guestName: z.string().trim().min(1).max(120),
  guestEmail: z.email().max(200).nullable().optional(),
  guestPhone: guestPhoneSchema.nullable().optional(),
  conventionId: z.uuid().nullable().optional(),
  extras: extrasRequestSchema,
  collect: z.enum(['now', 'later']).default('now'),
});
// ---- B3 (spec §4.3): collections, payment requests and communications ----
const collectSchema = z.object({ amountCents: z.number().int().min(1).max(1_000_000) });
const addExtrasSchema = z.object({
  extras: z
    .array(z.object({ serviceId: z.uuid(), quantity: z.number().int().min(1).max(maxExtraQuantity) }))
    .min(1)
    .max(20)
    .refine((extras) => new Set(extras.map((entry) => entry.serviceId)).size === extras.length),
  collect: z.enum(['desk', 'later']),
});
const paymentRequestSchema = z.object({
  amountCents: z.number().int().min(1).max(1_000_000),
  note: z.string().trim().min(1).max(200).nullable().default(null),
  // 72 hours when left out; always truncated to the end of the booked day.
  expiresInHours: z.number().int().min(1).max(240).optional(),
});
// The token is validated by the signature check, in constant time: a malformed
// token must answer the SAME neutral refusal as an expired one, never a 400.
const payTokenSchema = z.string().min(1).max(200);
// ---- The cart and the order (D46) ----
const cartCreateSchema = z.object({ beachSlug: slugSchema });
const cartItemSchema = z.object({
  spotId: z.uuid(),
  day: daySchema,
  to: daySchema.optional(),
  /** «Per chi è»: free text; empty or missing means the orderer. */
  guestName: z.string().trim().max(120).optional(),
  promoCode: z.string().trim().min(1).max(40).optional(),
  extras: extrasRequestSchema,
});
// Absent leaves a field as it is; promoCode null clears it, extras replace the whole set.
const cartItemChangeSchema = z
  .object({
    guestName: z.string().trim().max(120).optional(),
    promoCode: z.string().trim().min(1).max(40).nullable().optional(),
    extras: extrasRequestSchema,
  })
  .refine((change) => Object.values(change).some((value) => value !== undefined));
const cartClaimSchema = z.object({ accessToken: z.string().min(20).max(200) });
const confirmOrderSchema = z.object({
  guestName: z.string().trim().min(1).max(120),
  guestEmail: z.email().max(200),
  locale: z.enum(['it', 'en']).default('it'),
});
// The §5 add-services route: at least one line, each service at most once.
const ownerExtrasSchema = z.object({
  extras: z
    .array(z.object({ serviceId: z.uuid(), quantity: z.number().int().min(1).max(maxExtraQuantity) }))
    .min(1)
    .max(20)
    .refine((extras) => new Set(extras.map((entry) => entry.serviceId)).size === extras.length),
});
// ---- Extra services (spec §4.2): Italian name required, English optional with fallback ----
const extraServiceSchema = z.object({
  nameIt: z.string().trim().min(1).max(80),
  nameEn: z.string().trim().min(1).max(80).nullable().default(null),
  unitPriceCents: z.number().int().min(0).max(1_000_000),
  position: z.number().int().min(0).max(10_000).default(0),
});
const extraStatusSchema = z.object({ active: z.boolean() });
// ---- Hotel conventions (spec §4.1): one pricing out of two, optional validity window ----
const conventionSchema = z
  .object({
    partnerName: z.string().trim().min(1).max(120),
    // Normalized server-side like promotion codes: upper case, no spaces.
    code: z.string().trim().min(1).max(40).regex(/^\S+$/),
    percentBps: z.number().int().min(1).max(10_000).nullable(),
    fixedPriceCents: priceSchema.nullable(),
    validFrom: daySchema.nullable().default(null),
    validTo: daySchema.nullable().default(null),
    notes: z.string().trim().min(1).max(500).nullable().default(null),
  })
  .refine((deal) => (deal.percentBps === null) !== (deal.fixedPriceCents === null))
  .refine((deal) => deal.validFrom === null || deal.validTo === null || deal.validFrom <= deal.validTo);
const conventionStatusSchema = z.object({ active: z.boolean() });
const bookingCodeSchema = z.string().regex(/^OM-\d{6}-\d{3}$/i);
const idempotencyKeySchema = z.string().min(8).max(200).regex(/^[\x21-\x7e]+$/);
// A position is complete or absent: a lone coordinate would be meaningless.
const positionSchema = z
  .object({ latitude: z.number().min(-90).max(90).nullable(), longitude: z.number().min(-180).max(180).nullable() })
  .refine((position) => (position.latitude === null) === (position.longitude === null));
const zoneSchema = z.enum(spotZones);
const gapRowsSchema = z.number().int().min(0).max(maxGapRows);
const gapsSchema = z.object({ shoreGapRows: gapRowsSchema, landGapRows: gapRowsSchema });
const equipmentFields = {
  umbrellas: z.number().int().min(0).max(10).optional(),
  sunbeds: z.number().int().min(0).max(10).optional(),
  maxGuests: z.number().int().min(1).max(20).optional(),
};
const rentalTypeSchema = z.string().trim().min(1).max(rentalTypeMaxLength);
const rentalNotesSchema = z.string().trim().min(1).max(rentalNotesMaxLength);
const colSchema = z.number().int().min(1).max(maxColumns);
const addRowSchema = z.object({ zone: zoneSchema, prefix: z.string().regex(/^[A-Z]{1,4}$/), count: z.number().int().min(1).max(50), typeId: z.uuid().optional(), ...equipmentFields });
// Up to 10 rows of up to 50 spots, never more than 200 spots in one operation (D34).
const addRowsSchema = z
  .object({ zone: zoneSchema, prefix: z.string().regex(/^[A-Z]{1,4}$/), rows: z.number().int().min(1).max(10), perRow: z.number().int().min(1).max(50), typeId: z.uuid().optional(), ...equipmentFields })
  .refine((bulk) => bulk.rows * bulk.perRow <= 200);
const spotCodeSchema = z.string().regex(/^[A-Z0-9][A-Z0-9-]{0,9}$/);
const addSpotSchema = z.object({
  zone: zoneSchema,
  code: spotCodeSchema,
  rowNumber: z.number().int().min(1).max(200).optional(),
  col: colSchema.optional(),
  typeId: z.uuid().optional(),
  ...equipmentFields,
  rentalType: rentalTypeSchema.nullable().optional(),
  rentalNotes: rentalNotesSchema.nullable().optional(),
});
// ---- The drawing of the beach ----
const seaSideSchema = z.object({ seaSide: z.enum(seaSides) });
const elementLabelSchema = z.string().trim().min(1).max(elementLabelMaxLength);
// A horizontal walkway is its own lane after a row (0 = before row 1); a vertical
// one runs in the gap after a column; structures and cabin blocks occupy free cells;
// a decoration is one free cell with its sign from the repertoire (D35).
const elementSchema = z.union([
  z.object({ kind: z.literal('walkway'), orientation: z.literal('horizontal'), zone: zoneSchema, rowAfter: z.number().int().min(0).max(200), colStart: colSchema, colEnd: colSchema, label: elementLabelSchema.optional() }),
  z.object({ kind: z.literal('walkway'), orientation: z.literal('vertical'), zone: zoneSchema.nullable().optional(), colStart: colSchema, label: elementLabelSchema.optional() }),
  z.object({ kind: z.literal('structure'), zone: zoneSchema, rowNumber: z.number().int().min(1).max(200), colStart: colSchema, colEnd: colSchema, label: elementLabelSchema }),
  z.object({ kind: z.literal('cabin_block'), zone: zoneSchema, rowNumber: z.number().int().min(1).max(200), colStart: colSchema, colEnd: colSchema, label: elementLabelSchema.optional() }),
  z.object({ kind: z.literal('decoration'), zone: zoneSchema, rowNumber: z.number().int().min(1).max(200), colStart: colSchema, sign: z.enum(decorationSigns), label: elementLabelSchema.optional() }),
]);
// ---- Spot types ----
const spotTypeFields = {
  name: z.string().trim().min(1).max(spotTypeNameMaxLength),
  mark: z.enum(spotMarks),
  umbrellas: z.number().int().min(0).max(10),
  sunbeds: z.number().int().min(0).max(10),
  maxGuests: z.number().int().min(1).max(20),
  defaultPriceCents: priceSchema.nullable(),
};
const spotTypeSchema = z.object({ ...spotTypeFields, defaultPriceCents: priceSchema.nullable().optional() });
const spotTypeUpdateSchema = z
  .object({
    name: spotTypeFields.name.optional(),
    mark: spotTypeFields.mark.optional(),
    umbrellas: spotTypeFields.umbrellas.optional(),
    sunbeds: spotTypeFields.sunbeds.optional(),
    maxGuests: spotTypeFields.maxGuests.optional(),
    defaultPriceCents: priceSchema.nullable().optional(),
  })
  .refine((change) => Object.values(change).some((value) => value !== undefined));
const spotTypeRefSchema = z.object({ typeId: z.uuid() });
// ---- Cabins ----
const cabinCodeSchema = z.string().regex(new RegExp(`^[A-Z0-9][A-Z0-9-]{0,${cabinCodeMaxLength - 1}}$`));
const cabinNotesSchema = z.string().trim().min(1).max(cabinNotesMaxLength);
const cabinSchema = z.object({ code: cabinCodeSchema, elementId: z.uuid().nullable().optional(), notes: cabinNotesSchema.nullable().optional() });
const cabinUpdateSchema = z
  .object({ code: cabinCodeSchema.optional(), elementId: z.uuid().nullable().optional(), notes: cabinNotesSchema.nullable().optional() })
  .refine((change) => Object.values(change).some((value) => value !== undefined));
// The holder has an account email, a written name, or both; never neither.
const assignmentSchema = z
  .object({
    holderEmail: z.email().max(200).optional(),
    holderName: z.string().trim().min(1).max(holderNameMaxLength).optional(),
    holderContact: z.string().trim().min(1).max(holderContactMaxLength).optional(),
    validFrom: daySchema,
    validTo: daySchema,
  })
  .refine((assignment) => assignment.holderEmail !== undefined || assignment.holderName !== undefined);
const endAssignmentSchema = z.object({ endOn: daySchema });
const subletProposalSchema = z.object({
  fromDay: daySchema,
  toDay: daySchema,
  occupantName: z.string().trim().min(1).max(occupantNameMaxLength),
  occupantContact: z.string().trim().min(1).max(holderContactMaxLength).optional(),
});
const subletDecisionSchema = z.object({ approve: z.boolean() });
// Absent leaves a field as it is; an explicit null clears an annotation.
const updateSpotSchema = z
  .object({ ...equipmentFields, rentalType: rentalTypeSchema.nullable().optional(), rentalNotes: rentalNotesSchema.nullable().optional() })
  .refine((change) => Object.values(change).some((value) => value !== undefined));
const rowRentalSchema = z.object({ zone: zoneSchema, rowNumber: z.number().int().min(1).max(200), rentalType: rentalTypeSchema.nullable(), rentalNotes: rentalNotesSchema.nullable() });
const retiredSchema = z.object({ retired: z.boolean() });
// Guests, shared days and a period only mean something on a given day.
const beachSearchSchema = z
  .object({
    day: daySchema.optional(),
    to: daySchema.optional(),
    guests: z.string().regex(/^\d{1,2}$/).transform(Number).pipe(z.number().int().min(1).max(20)).optional(),
    locality: z.string().trim().min(1).max(80).optional(),
    sharedOnly: z.enum(['true', 'false']).optional(),
  })
  .refine((search) => search.day !== undefined || (search.guests === undefined && search.sharedOnly === undefined && search.to === undefined));

function parse<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new HttpError(400, 'invalid_request', `Invalid ${what}`);
  return result.data;
}

function money(quote: DayQuote) {
  return {
    currency: 'EUR',
    listPriceCents: quote.listPrice,
    discountCents: quote.discount,
    totalCents: quote.total,
    promoCode: quote.promoCode,
  };
}

/**
 * Money of a purchase with extras (spec §4.2): listPriceCents and discountCents
 * keep meaning the spot alone, extrasCents is separate and totalCents is
 * comprehensive (list − discount + extras); `extras` lists the lines.
 */
function purchaseMoney(quote: PurchaseQuote) {
  return { ...money(quote), extrasCents: quote.extrasCents, extras: quote.extras, ...(quote.days ? { days: quote.days } : {}) };
}

function publicBeach(beach: PublicBeach) {
  // Coordinates are null until the manager sets them: the club then stays off the map.
  return { slug: beach.slug, name: beach.name, locality: beach.locality, timezone: beach.timezone, demo: beach.demo, latitude: beach.latitude, longitude: beach.longitude };
}

// Requests per minute and per client on the routes most exposed to abuse.
const limits: Record<string, number> = {
  'post /v1/auth/login': 10,
  // Registration is limited like the sign-in (D44).
  'post /v1/account/register': 10,
  'post /v1/holds': 30,
  'post /v1/checkouts': 20,
  'post /v1/quotes': 120,
  // The cart confirmation takes the reserves and opens the payment, like a checkout.
  'post /v1/carts': 30,
  'post /v1/carts/:cartId/confirm': 20,
  // The public payment page, limited like the purchase routes (spec §4.3).
  'get /v1/pay-requests/:token': 60,
  'post /v1/pay-requests/:token/payments': 20,
};

export function createApp(options: AppOptions): Hono {
  const { db, holdSeconds, sessionSeconds = 12 * 60 * 60, signingSecret, sandboxWebhookSecret, log = console.error } = options;
  if (signingSecret.length < 32) throw new RangeError('signingSecret must be at least 32 characters long');
  const siteUrl = (options.siteUrl ?? 'http://localhost:3210').replace(/\/+$/, '');
  const app = new Hono();

  /** The full text of a payment request, with the /paga/{token} link of the website. */
  function composeRequestMessage(data: PayRequestMessageData): string {
    return paymentRequestMessage({
      brand: options.brand ?? 'Ombrè',
      locale: data.locale,
      guestName: data.guestName,
      beachName: data.beachName,
      // The whole dal–al period of the group (D38), written out; one day reads as before.
      period: formatLongPeriod(data.day, data.to, data.locale),
      spotCode: data.spotCode,
      bookingCode: data.bookingCode,
      amountCents: data.amountCents,
      payUrl: `${siteUrl}${payPath(data.locale, data.token)}`,
      deadline: formatDeadline(data.expiresAt, data.locale, data.timezone),
    }).text;
  }

  const operations: Operation[] = [];
  const limiter = options.rateLimiter ?? createRateLimiter();

  /** Registers a route together with its description, and applies its request limit. */
  function route(operation: Operation, handler: Handler): void {
    operations.push(operation);
    const limit = limits[`${operation.method} ${operation.path}`];
    app.on(operation.method.toUpperCase(), operation.path, async (c) => {
      if (limit) {
        const client = c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() || 'local';
        const wait = limiter.hit(`${operation.path}|${client}`, limit, 60);
        if (wait > 0) {
          c.header('Retry-After', String(wait));
          return c.json({ error: { code: 'rate_limited', message: 'Too many requests. Try again shortly' } }, 429);
        }
      }
      return handler(c);
    });
  }

  /** A beach club as shown in a list: with the cover picture of its published website, if any. */
  async function listedBeach(beach: PublicBeach) {
    const site = await getPublishedSite(db, beach.id);
    const cover = site?.content.it.images?.cover ?? null;
    return {
      ...publicBeach(beach),
      cover: cover ? { src: cover.src, alt: { it: cover.alt, en: site?.content.en?.images?.cover?.alt ?? null } } : null,
    };
  }

  async function beachBySlug(slug: string): Promise<PublicBeach> {
    const beach = await findActiveBeach(db, slug);
    if (!beach) throw new HttpError(404, 'not_found', 'Beach club not found');
    return beach;
  }

  async function body(request: Request): Promise<unknown> {
    try {
      return await request.json();
    } catch {
      throw new HttpError(400, 'invalid_request', 'The body must be JSON');
    }
  }

  async function currentUser(authorization: string | undefined, options: { allowPendingPasswordChange?: boolean } = {}): Promise<SessionUser & { token: string }> {
    const token = /^Bearer ([A-Za-z0-9_-]{20,200})$/.exec(authorization ?? '')?.[1];
    const user = token ? await resolveSession(db, token) : null;
    if (!token || !user) throw new HttpError(401, 'unauthenticated', 'Sign in to continue');
    // The forced first change (D44): until the generated password is replaced, the
    // session only reads itself, signs out or changes the password.
    if (user.mustChangePassword && !options.allowPendingPasswordChange) {
      throw new HttpError(403, 'password_change_required', 'Change the generated password to continue');
    }
    return { ...user, token };
  }

  /** Signed-in person, member of the beach club, with a role that allows the action. */
  async function actorFor(authorization: string | undefined, slug: string | undefined, action: Action) {
    const user = await currentUser(authorization);
    const actor = await authorize(db, user.userId, parse(slugSchema, slug, 'beach club'), action);
    if (options.requireTwoFactor && actor.role === 'manager' && !user.twoFactor) {
      throw new DomainError('totp_setup_required', 'Switch two-step verification on to manage this beach club');
    }
    return actor;
  }

  route({ method: 'post', path: '/v1/auth/login', summary: 'Sign in with email and password', tag: 'Sign-in', auth: 'none', request: loginSchema, success: 200, errors: [400, 401, 429] }, async (c) => {
    const credentials = parse(loginSchema, await body(c.req.raw), 'credentials');
    const session = await login(db, credentials.email, credentials.password, sessionSeconds, credentials.code);
    // Orphan stays with this email join the account at every sign-in (D47).
    await relinkBookings(db, session.userId, credentials.email);
    return c.json({ token: session.token, expiresAt: session.expiresAt.toISOString() });
  });

  route({ method: 'post', path: '/v1/auth/logout', summary: 'End the current session', tag: 'Sign-in', auth: 'session', success: 204, errors: [401] }, async (c) => {
    const user = await currentUser(c.req.header('Authorization'), { allowPendingPasswordChange: true });
    await logout(db, user.token);
    return c.body(null, 204);
  });

  route({ method: 'post', path: '/v1/auth/two-factor/begin', summary: 'Start two-step verification setup', tag: 'Sign-in', auth: 'session', success: 200, errors: [401, 409] }, async (c) => {
    const user = await currentUser(c.req.header('Authorization'));
    const secret = await beginTwoFactor(db, user.token);
    if (!secret) throw new DomainError('invalid_state', 'Two-step verification is already on');
    const text = base32Encode(secret);
    const label = encodeURIComponent(`${options.brand ?? 'Ombrè'}:${user.email}`);
    const issuer = encodeURIComponent(options.brand ?? 'Ombrè');
    return c.json({ secret: text, otpauthUri: `otpauth://totp/${label}?secret=${text}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30` });
  });

  route({ method: 'post', path: '/v1/auth/two-factor/confirm', summary: 'Switch two-step verification on with a first code', tag: 'Sign-in', auth: 'session', request: z.object({ code: codeSchema }), success: 204, errors: [400, 401, 422] }, async (c) => {
    const user = await currentUser(c.req.header('Authorization'));
    const { code } = parse(z.object({ code: codeSchema }), await body(c.req.raw), 'code');
    if (!(await confirmTwoFactor(db, user.token, code))) throw new DomainError('totp_invalid', 'The code is not valid');
    return c.body(null, 204);
  });

  route({ method: 'get', path: '/v1/me', summary: 'The signed-in person and the beach clubs they belong to', tag: 'Sign-in', auth: 'session', success: 200, errors: [401] }, async (c) => {
    const user = await currentUser(c.req.header('Authorization'), { allowPendingPasswordChange: true });
    const memberships = await listMemberships(db, user.userId);
    return c.json({
      user: { email: user.email, name: user.name, platformRole: user.platformRole, twoFactor: user.twoFactor, mustChangePassword: user.mustChangePassword },
      memberships: memberships.map(({ beachSlug, beachName, role }) => ({ beachSlug, beachName, role })),
    });
  });

  // ---- The guest's account (D44, D47) ----
  route({ method: 'post', path: '/v1/account/register', summary: 'Open an account with name and email; the password arrives by mail', tag: 'Account', auth: 'none', request: registerSchema, success: 201, errors: [400, 429] }, async (c) => {
    const request = parse(registerSchema, await body(c.req.raw), 'registration');
    // Created or already existing: both queue their mail and answer the same (D44).
    await registerAccount(db, request);
    return c.json({ result: 'ok' }, 201);
  });

  route({ method: 'post', path: '/v1/account/password', summary: 'Change the password of the signed-in person; clears the forced first change', tag: 'Account', auth: 'session', request: changePasswordSchema, success: 204, errors: [400, 401, 422] }, async (c) => {
    const user = await currentUser(c.req.header('Authorization'), { allowPendingPasswordChange: true });
    const { current, next } = parse(changePasswordSchema, await body(c.req.raw), 'password change');
    if (next.length < passwordMinLength) throw new HttpError(422, 'weak_password', `The new password must be at least ${passwordMinLength} characters long`);
    await changePassword(db, user.userId, current, next);
    return c.body(null, 204);
  });

  route({ method: 'get', path: '/v1/account/bookings', summary: "«Le mie prenotazioni»: the person's stays across beach clubs, upcoming and past, with totals and passes", tag: 'Account', auth: 'session', success: 200, errors: [401, 403] }, async (c) => {
    const user = await currentUser(c.req.header('Authorization'));
    return c.json({ currency: 'EUR', ...(await listMyBookings(db, user.userId, signingSecret)) });
  });

  // ---- The cart and the order (D46, spec §3 and §5) ----
  /** The session user when a valid token rides along; null otherwise: the cart works without an account. */
  async function optionalUser(authorization: string | undefined): Promise<(SessionUser & { token: string }) | null> {
    try {
      return await currentUser(authorization);
    } catch {
      return null;
    }
  }

  /** Opens a cart route with the signed ticket OR the owner's session; anyone else reads «not found». */
  async function cartAccess(c: Context, cartId: string): Promise<{ beachId: string; userId: string | null }> {
    const beachId = await locateCartBeach(db, cartId);
    if (!beachId) throw new HttpError(404, 'not_found', 'Cart not found');
    const token = /^Bearer ([A-Za-z0-9_-]{20,200})$/.exec(c.req.header('Authorization') ?? '')?.[1];
    if (!token) throw new HttpError(401, 'unauthenticated', 'The cart ticket is required');
    const owner = await cartOwnerId(db, beachId, cartId);
    if (cartTokenIsValid(signingSecret, cartId, token)) return { beachId, userId: owner };
    const user = await currentUser(c.req.header('Authorization'));
    if (owner !== user.userId) throw new HttpError(404, 'not_found', 'Cart not found');
    return { beachId, userId: user.userId };
  }

  route({ method: 'post', path: '/v1/carts', summary: 'Open a cart at one beach club; signed in, the existing cart of the account is handed back', tag: 'Booking', auth: 'none', request: cartCreateSchema, success: 201, errors: [400, 404, 429] }, async (c) => {
    const { beachSlug } = parse(cartCreateSchema, await body(c.req.raw), 'request');
    const beach = await beachBySlug(beachSlug);
    const user = await optionalUser(c.req.header('Authorization'));
    const opened = await createCart(db, beach.id, user?.userId ?? null);
    return c.json({ cartId: opened.cartId, accessToken: cartAccessToken(signingSecret, opened.cartId) }, opened.created ? 201 : 200);
  });

  route({ method: 'get', path: '/v1/carts/:cartId', summary: 'The full cart, availability and prices recomputed now, with the grand total', tag: 'Booking', auth: 'cart-token', success: 200, errors: [400, 401, 404] }, async (c) => {
    const cartId = parse(z.uuid(), c.req.param('cartId'), 'cart');
    const { beachId } = await cartAccess(c, cartId);
    const view = await getCart(db, beachId, cartId);
    return c.json({
      cartId: view.cartId,
      currency: 'EUR',
      // The item's own fields win: `extras` stays the requested quantities,
      // while the quote contributes the money fields and the priced lines in `days`.
      items: view.items.map(({ quote, ...item }) => ({ ...(quote ? purchaseMoney(quote) : {}), ...item })),
      totalCents: view.totalCents,
      allAvailable: view.allAvailable,
    });
  });

  route({ method: 'post', path: '/v1/carts/:cartId/items', summary: 'Add a spot over a dal–al period to the cart, with holder, promotion and extras', tag: 'Booking', auth: 'cart-token', request: cartItemSchema, success: 201, errors: [400, 401, 404, 409, 422] }, async (c) => {
    const cartId = parse(z.uuid(), c.req.param('cartId'), 'cart');
    const { beachId } = await cartAccess(c, cartId);
    const request = parse(cartItemSchema, await body(c.req.raw), 'cart item');
    return c.json(await addItem(db, beachId, cartId, request), 201);
  });

  route({ method: 'put', path: '/v1/carts/:cartId/items/:itemId', summary: 'Change holder, promotion or extras of one cart item', tag: 'Booking', auth: 'cart-token', request: cartItemChangeSchema, success: 204, errors: [400, 401, 404, 422] }, async (c) => {
    const cartId = parse(z.uuid(), c.req.param('cartId'), 'cart');
    const { beachId } = await cartAccess(c, cartId);
    const change = parse(cartItemChangeSchema, await body(c.req.raw), 'change');
    await updateItem(db, beachId, cartId, parse(z.uuid(), c.req.param('itemId'), 'cart item'), change);
    return c.body(null, 204);
  });

  route({ method: 'delete', path: '/v1/carts/:cartId/items/:itemId', summary: 'Take one item out of the cart', tag: 'Booking', auth: 'cart-token', success: 204, errors: [400, 401, 404] }, async (c) => {
    const cartId = parse(z.uuid(), c.req.param('cartId'), 'cart');
    const { beachId } = await cartAccess(c, cartId);
    await removeItem(db, beachId, cartId, parse(z.uuid(), c.req.param('itemId'), 'cart item'));
    return c.body(null, 204);
  });

  route({ method: 'post', path: '/v1/carts/:cartId/claim', summary: "Hand the ticket's cart to the signed-in account, merging the account's previous cart into it", tag: 'Booking', auth: 'session', request: cartClaimSchema, success: 200, errors: [400, 401, 403, 404] }, async (c) => {
    const user = await currentUser(c.req.header('Authorization'));
    const cartId = parse(z.uuid(), c.req.param('cartId'), 'cart');
    const { accessToken } = parse(cartClaimSchema, await body(c.req.raw), 'request');
    const beachId = await locateCartBeach(db, cartId);
    if (!beachId || !cartTokenIsValid(signingSecret, cartId, accessToken)) throw new HttpError(404, 'not_found', 'Cart not found');
    return c.json(await claimCart(db, beachId, cartId, user.userId));
  });

  route({ method: 'post', path: '/v1/carts/:cartId/confirm', summary: '«Conferma e paga»: reserve every item in one transaction, all or nothing, and open the single payment of the order', tag: 'Booking', auth: 'cart-token', request: confirmOrderSchema, success: 201, errors: [400, 401, 404, 409, 422, 429] }, async (c) => {
    const cartId = parse(z.uuid(), c.req.param('cartId'), 'cart');
    const access = await cartAccess(c, cartId);
    const request = parse(confirmOrderSchema, await body(c.req.raw), 'request');
    const order = await confirmOrder(db, access.beachId, { cartId, ...request, userId: access.userId }, signingSecret, holdSeconds);
    return c.json(
      {
        orderId: order.orderId,
        code: order.code,
        currency: 'EUR',
        totalCents: order.totalCents,
        accessToken: order.accessToken,
        payment: { ...order.payment, currency: 'EUR' },
        items: order.items,
      },
      201,
    );
  });

  route({ method: 'get', path: '/v1/beaches/:slug/orders/:orderId', summary: "The orderer's own order summary: every item with code, state and pass, the total and the payment", tag: 'Booking', auth: 'order-token', success: 200, errors: [400, 401, 404] }, async (c) => {
    const beach = await beachBySlug(parse(slugSchema, c.req.param('slug'), 'beach club'));
    const token = /^Bearer ([A-Za-z0-9_-]{20,200})$/.exec(c.req.header('Authorization') ?? '')?.[1];
    if (!token) throw new HttpError(401, 'unauthenticated', 'The order token is required');
    const view = await getOrder(db, beach.id, parse(z.uuid(), c.req.param('orderId'), 'order'), token, signingSecret);
    return c.json({ ...view, currency: 'EUR', beach: publicBeach(beach) });
  });

  route({ method: 'get', path: '/v1/account/carts', summary: "The person's carts across beach clubs: the cart is found again from the account", tag: 'Account', auth: 'session', success: 200, errors: [401, 403] }, async (c) => {
    const user = await currentUser(c.req.header('Authorization'));
    const carts = await listMyCarts(db, user.userId);
    return c.json({ carts: carts.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() })) });
  });

  route({ method: 'post', path: '/v1/account/bookings/:groupId/extras', summary: 'Add extra services to an own confirmed booking; the balance becomes a payment request payable at /paga', tag: 'Account', auth: 'session', request: ownerExtrasSchema, success: 201, errors: [400, 401, 403, 404, 409, 422] }, async (c) => {
    const user = await currentUser(c.req.header('Authorization'));
    const groupId = parse(z.uuid(), c.req.param('groupId'), 'booking group');
    const { extras } = parse(ownerExtrasSchema, await body(c.req.raw), 'extras');
    const result = await addExtrasAsOwner(db, user.userId, { groupId, extras }, signingSecret, composeRequestMessage);
    return c.json(
      {
        currency: 'EUR',
        addedCents: result.addedCents,
        totalCents: result.totalCents,
        paidCents: result.paidCents,
        remainingCents: result.remainingCents,
        paymentState: result.paymentState,
        paymentRequest: result.paymentRequest
          ? {
              requestId: result.paymentRequest.requestId,
              amountCents: result.paymentRequest.amountCents,
              expiresAt: result.paymentRequest.expiresAt.toISOString(),
              payUrl: `${siteUrl}${payPath(result.paymentRequest.locale, result.paymentRequest.token)}`,
            }
          : null,
      },
      201,
    );
  });

  // ---- Sign-in with an external identity (D48) ----
  const hmacHex = (secret: string, text: string) => createHmac('sha256', secret).update(text).digest('hex');
  const sameSignature = (left: string, right: string) => left.length === right.length && timingSafeEqual(Buffer.from(left), Buffer.from(right));

  /** Anti-forgery state: HMAC over timestamp and nonce, fresh for ten minutes. */
  function mintState(): string {
    const payload = `${Date.now().toString(36)}.${randomBytes(16).toString('base64url')}`;
    return `${payload}.${hmacHex(signingSecret, `oidc-state:${payload}`)}`;
  }

  function stateIsValid(state: string): boolean {
    const parts = state.split('.');
    if (parts.length !== 3) return false;
    const payload = `${parts[0]}.${parts[1]}`;
    if (!sameSignature(hmacHex(signingSecret, `oidc-state:${payload}`), parts[2]!)) return false;
    const age = Date.now() - parseInt(parts[0]!, 36);
    return Number.isFinite(age) && age > -60_000 && age <= 10 * 60 * 1000;
  }

  /** The «code» of the test provider: a signed payload the consent page carries back. */
  function mintTestCode(email: string, name: string, secret: string): string {
    const payload = Buffer.from(JSON.stringify({ email, name, exp: Date.now() + 10 * 60 * 1000 }), 'utf8').toString('base64url');
    return `${payload}.${hmacHex(secret, `oidc-code:${payload}`)}`;
  }

  function readTestCode(code: string, secret: string): { email: string; name: string } | null {
    const parts = code.split('.');
    if (parts.length !== 2 || !sameSignature(hmacHex(secret, `oidc-code:${parts[0]}`), parts[1]!)) return null;
    try {
      const data = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString('utf8')) as { email?: unknown; name?: unknown; exp?: unknown };
      if (typeof data.email !== 'string' || typeof data.name !== 'string' || typeof data.exp !== 'number' || data.exp < Date.now()) return null;
      return { email: data.email, name: data.name };
    } catch {
      return null;
    }
  }

  /**
   * Exchanges the code with Google and reads the identity from the id_token. The
   * token arrives straight from Google over TLS, so the JWT signature is not
   * re-checked against the JWKS; iss, aud, exp and email_verified are.
   */
  async function googleIdentity(code: string, google: { clientId: string; clientSecret: string; redirectUrl: string }): Promise<{ subject: string; email: string; name: string }> {
    const refused = () => new HttpError(401, 'invalid_code', 'The identity provider refused the code');
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: google.clientId, client_secret: google.clientSecret, redirect_uri: google.redirectUrl, grant_type: 'authorization_code' }).toString(),
    });
    if (!response.ok) throw refused();
    const data = (await response.json()) as { id_token?: string };
    const segments = (data.id_token ?? '').split('.');
    if (segments.length !== 3) throw refused();
    let claims: { iss?: unknown; aud?: unknown; exp?: unknown; email?: unknown; email_verified?: unknown; sub?: unknown; name?: unknown };
    try {
      claims = JSON.parse(Buffer.from(segments[1]!, 'base64url').toString('utf8')) as typeof claims;
    } catch {
      throw refused();
    }
    if (claims.iss !== 'https://accounts.google.com' && claims.iss !== 'accounts.google.com') throw refused();
    if (claims.aud !== google.clientId) throw refused();
    if (typeof claims.exp !== 'number' || claims.exp * 1000 < Date.now()) throw refused();
    if (claims.email_verified !== true || typeof claims.email !== 'string' || typeof claims.sub !== 'string') throw refused();
    return { subject: claims.sub, email: claims.email, name: typeof claims.name === 'string' && claims.name.trim() ? claims.name : claims.email };
  }

  route({ method: 'get', path: '/v1/auth/oidc/providers', summary: 'The configured identity provider, with the state and address the sign-in link needs', tag: 'Sign-in', auth: 'none', success: 200, errors: [] }, async (c) => {
    const oidc = options.oidc;
    if (!oidc) return c.json({ provider: null });
    const state = mintState();
    if (oidc.provider === 'test') return c.json({ provider: 'test', state });
    const authorizeUrl = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
      client_id: oidc.clientId,
      redirect_uri: oidc.redirectUrl,
      response_type: 'code',
      scope: 'openid email profile',
      state,
    }).toString()}`;
    return c.json({ provider: 'google', state, authorizeUrl });
  });

  const testCodeSchema = z.object({ email: z.email().max(200), name: z.string().trim().min(1).max(120) });
  route({ method: 'post', path: '/v1/auth/oidc/test-code', summary: 'Test provider only: mints the signed code the local consent page carries back', tag: 'Sign-in', auth: 'none', request: testCodeSchema, success: 201, errors: [400, 503] }, async (c) => {
    const oidc = options.oidc;
    if (oidc?.provider !== 'test') throw new HttpError(503, 'integration_unavailable', 'The test identity provider is not configured');
    const consent = parse(testCodeSchema, await body(c.req.raw), 'consent');
    return c.json({ code: mintTestCode(consent.email, consent.name, oidc.testSecret) }, 201);
  });

  const oidcCallbackSchema = z.object({ code: z.string().min(1).max(4096), state: z.string().min(1).max(300) });
  route({ method: 'post', path: '/v1/auth/oidc/callback', summary: 'Closes the sign-in with the external identity: verifies state and code, opens the session', tag: 'Sign-in', auth: 'none', request: oidcCallbackSchema, success: 200, errors: [400, 401, 503] }, async (c) => {
    const oidc = options.oidc;
    if (!oidc) throw new HttpError(503, 'integration_unavailable', 'No identity provider is configured');
    const request = parse(oidcCallbackSchema, await body(c.req.raw), 'callback');
    if (!stateIsValid(request.state)) throw new HttpError(401, 'invalid_state', 'The state is not valid or has expired');
    let identity: { subject: string; email: string; name: string };
    if (oidc.provider === 'test') {
      const read = readTestCode(request.code, oidc.testSecret);
      if (!read) throw new HttpError(401, 'invalid_code', 'The code is not valid or has expired');
      // The test provider has no subject of its own: the email, lowered, is the subject.
      identity = { subject: read.email.toLowerCase(), email: read.email, name: read.name };
    } else {
      identity = await googleIdentity(request.code, oidc);
    }
    const session = await identityLogin(db, { provider: oidc.provider, ...identity }, sessionSeconds);
    // Orphan stays with this email join the account, like at a password sign-in (D47).
    await relinkBookings(db, session.user.userId, identity.email);
    const { email, name, platformRole, twoFactor, mustChangePassword } = session.user;
    return c.json({ token: session.token, expiresAt: session.expiresAt.toISOString(), user: { email, name, platformRole, twoFactor, mustChangePassword } });
  });

  route({ method: 'get', path: '/v1/manage/beaches/:slug/inventory', summary: 'Every spot of a day with its state and price', tag: 'Beach club', auth: 'session', query: { day: 'YYYY-MM-DD' }, success: 200, errors: [400, 401, 403] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'inventory.read');
    const day = parse(daySchema, c.req.query('day'), 'day');
    return c.json({ day, currency: 'EUR', spots: await listInventory(db, actor, day) });
  });

  route({ method: 'post', path: '/v1/manage/beaches/:slug/inventory/publish', summary: 'Put a day on sale', tag: 'Beach club', auth: 'session', request: publishSchema, success: 200, errors: [400, 401, 403, 404] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'inventory.publish');
    return c.json(await publishDay(db, actor, parse(publishSchema, await body(c.req.raw), 'request')));
  });

  route({ method: 'post', path: '/v1/manage/beaches/:slug/inventory/block', summary: 'Block or unblock a spot on a day', tag: 'Beach club', auth: 'session', request: blockSchema, success: 204, errors: [400, 401, 403, 404, 409] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'inventory.block');
    await setBlocked(db, actor, parse(blockSchema, await body(c.req.raw), 'request'));
    return c.body(null, 204);
  });

  route({ method: 'post', path: '/v1/manage/beaches/:slug/inventory/bulk-block', summary: 'Block or unblock many spots of one day, with an aggregated outcome', tag: 'Beach club', auth: 'session', request: bulkBlockSchema, success: 200, errors: [400, 401, 403] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'inventory.block');
    const request = parse(bulkBlockSchema, await body(c.req.raw), 'request');
    return c.json({ day: request.day, blocked: request.blocked, ...(await setBlockedBulk(db, actor, request)) });
  });

  route({ method: 'get', path: '/v1/manage/beaches/:slug/operations', summary: 'Operational state of every spot of a day, with the day summary', tag: 'Beach club', auth: 'session', query: { day: 'YYYY-MM-DD' }, success: 200, errors: [400, 401, 403] }, async (c) => {
    // Seeing the console needs inventory.read; guest surnames and the takings are
    // nulled inside unless the role also has bookings.read and reports.read.
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'inventory.read');
    const day = parse(daySchema, c.req.query('day'), 'day');
    return c.json({ currency: 'EUR', ...(await listDayOperations(db, actor, day)) });
  });

  route({ method: 'get', path: '/v1/manage/beaches/:slug/operations/spot', summary: 'Card of one spot on a day: state with its reason, the price of the day, and the booking with the dal–al period and the balance of its group', tag: 'Beach club', auth: 'session', query: { day: 'YYYY-MM-DD', code: 'Spot code' }, success: 200, errors: [400, 401, 403, 404] }, async (c) => {
    // The card needs what the console needs; the booking inside is nulled without bookings.read.
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'inventory.read');
    const day = parse(daySchema, c.req.query('day'), 'day');
    const code = parse(spotCodeSchema, c.req.query('code'), 'spot code');
    return c.json({ currency: 'EUR', ...(await spotCard(db, actor, { day, code })) });
  });

  route(
    {
      method: 'get',
      path: '/v1/manage/beaches/:slug/planner',
      summary: 'Spot-by-day grid of a window: not published, free, blocked, withdrawn or booked, at most 31 days',
      tag: 'Beach club',
      auth: 'session',
      query: { from: 'YYYY-MM-DD', to: `YYYY-MM-DD, at most ${plannerMaxDays - 1} days after from` },
      optionalQuery: { zone: 'riva, ombrelloni or monte' },
      success: 200,
      errors: [400, 401, 403, 409],
    },
    async (c) => {
      // Whoever sees the console sees the planner (D33); guest names need bookings.read inside.
      const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'inventory.read');
      const from = parse(daySchema, c.req.query('from'), 'start day');
      const to = parse(daySchema, c.req.query('to'), 'end day');
      const zoneGiven = c.req.query('zone');
      const zone = zoneGiven === undefined ? undefined : parse(zoneSchema, zoneGiven, 'zone');
      if (Date.parse(`${to}T00:00:00Z`) < Date.parse(`${from}T00:00:00Z`)) throw new HttpError(400, 'invalid_request', 'The end day must not come before the start day');
      return c.json(await plannerGrid(db, actor, { from, to, zone }));
    },
  );

  route({ method: 'put', path: '/v1/manage/beaches/:slug/inventory/price', summary: 'Change the price of a spot on a day', tag: 'Beach club', auth: 'session', request: spotPriceSchema, success: 204, errors: [400, 401, 403, 404] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'inventory.price');
    await setPrice(db, actor, parse(spotPriceSchema, await body(c.req.raw), 'request'));
    return c.body(null, 204);
  });

  route({ method: 'post', path: '/v1/checkouts', summary: 'Turn an active hold into a booking under review and open its payment', tag: 'Booking', auth: 'none', request: checkoutSchema, success: 201, errors: [400, 404, 409, 429] }, async (c) => {
    const request = parse(checkoutSchema, await body(c.req.raw), 'request');
    const beach = await beachBySlug(request.beachSlug);
    const started = await startCheckout(db, beach.id, request, signingSecret);
    return c.json(
      {
        bookingId: started.bookingId,
        accessToken: started.accessToken,
        status: started.status,
        payment: { ...started.payment, currency: 'EUR' },
      },
      started.replayed ? 200 : 201,
    );
  });

  // Test payment provider. The signature covers the exact bytes received.
  route({ method: 'post', path: '/v1/payment-webhooks/sandbox', summary: 'Notification from the test payment provider', tag: 'System', auth: 'provider-signature', request: noticeSchema, headers: { 'X-Ombre-Signature': 'HMAC-SHA256 of the body, in hexadecimal' }, success: 200, errors: [400, 401, 503] }, async (c) => {
    if (!sandboxWebhookSecret) throw new HttpError(503, 'integration_unavailable', 'The test payment provider is not configured');
    const raw = await c.req.text();
    const expected = createHmac('sha256', sandboxWebhookSecret).update(raw).digest('hex');
    const given = c.req.header('X-Ombre-Signature') ?? '';
    if (given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
      throw new HttpError(401, 'invalid_signature', 'Signature not valid');
    }
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new HttpError(400, 'invalid_request', 'The body must be JSON');
    }
    const notice = parse(noticeSchema, payload, 'notification');
    return c.json({ result: await applyPaymentOutcome(db, { provider: 'sandbox', ...notice }) });
  });

  route({ method: 'get', path: '/v1/beaches/:slug/bookings/:bookingId', summary: "The guest's own booking, with the pass once confirmed", tag: 'Booking', auth: 'booking-token', success: 200, errors: [400, 401, 404] }, async (c) => {
    const beach = await beachBySlug(parse(slugSchema, c.req.param('slug'), 'beach club'));
    const token = /^Bearer ([A-Za-z0-9_-]{20,200})$/.exec(c.req.header('Authorization') ?? '')?.[1];
    if (!token) throw new HttpError(401, 'unauthenticated', 'The booking token is required');
    const view = await getBooking(db, beach.id, parse(z.uuid(), c.req.param('bookingId'), 'booking'), token, signingSecret);
    const { quote, ...rest } = view;
    return c.json({ ...rest, beach: publicBeach(beach), ...purchaseMoney(quote) });
  });

  route({ method: 'post', path: '/v1/manage/beaches/:slug/access-events', summary: 'Register an entry or an exit from a pass', tag: 'Beach club', auth: 'session', request: accessSchema, success: 201, errors: [400, 401, 403, 409, 422] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'access.check');
    return c.json(await checkAccess(db, actor, parse(accessSchema, await body(c.req.raw), 'request'), signingSecret), 201);
  });

  route({ method: 'post', path: '/v1/manage/beaches/:slug/desk-bookings', summary: 'Book a spot at the front desk for a day or a dal–al period, paid there or «da incassare», optionally under a hotel convention and with extra services', tag: 'Beach club', auth: 'session', request: deskSchema, success: 201, errors: [400, 401, 403, 404, 409, 422] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'bookings.create');
    return c.json(await deskBooking(db, actor, parse(deskSchema, await body(c.req.raw), 'request'), signingSecret), 201);
  });

  // «Sposta» stays per day (D38): a group of several days names the day to move.
  const moveSchema = z.object({ spotId: z.uuid(), day: daySchema.optional() });
  route({ method: 'post', path: '/v1/manage/beaches/:slug/bookings/:code/move', summary: 'Move one day of a confirmed booking to another spot of the same day', tag: 'Beach club', auth: 'session', request: moveSchema, success: 204, errors: [400, 401, 403, 404, 409] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'bookings.move');
    const { spotId, day } = parse(moveSchema, await body(c.req.raw), 'request');
    await moveBooking(db, actor, { code: parse(bookingCodeSchema, c.req.param('code'), 'booking code'), spotId, day });
    return c.body(null, 204);
  });

  route({ method: 'post', path: '/v1/manage/beaches/:slug/bookings/:code/cancel', summary: 'Cancel the whole period of a confirmed booking and record its refund', tag: 'Beach club', auth: 'session', request: z.object({ reason: z.string().trim().min(3).max(200) }), success: 204, errors: [400, 401, 403, 404, 409] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'bookings.cancel');
    const { reason } = parse(z.object({ reason: z.string().trim().min(3).max(200) }), await body(c.req.raw), 'request');
    await cancelByBeachClub(db, actor, { code: parse(bookingCodeSchema, c.req.param('code'), 'booking code'), reason });
    return c.body(null, 204);
  });

  route({ method: 'get', path: '/v1/manage/beaches/:slug/bookings', summary: 'Bookings of a day for the front desk, each row with the dal–al period and the totals of its group', tag: 'Beach club', auth: 'session', query: { day: 'YYYY-MM-DD' }, success: 200, errors: [400, 401, 403] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'bookings.read');
    const day = parse(daySchema, c.req.query('day'), 'day');
    return c.json({ day, currency: 'EUR', bookings: await listBookings(db, actor, day) });
  });

  // ---- B3 (spec §4.3, D31): deferred collection, payment requests, communications ----
  // Creating, collecting and cancelling are desk work: bookings.create, like the desk
  // booking itself. Reading lists is bookings.read, like the day list — the desk also
  // copies the texts by hand, so the communications page needs no manager-only right.
  route({ method: 'post', path: '/v1/manage/beaches/:slug/bookings/:code/collect', summary: 'Collect all or part of the outstanding balance at the front desk', tag: 'Beach club', auth: 'session', request: collectSchema, success: 200, errors: [400, 401, 403, 404, 409] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'bookings.create');
    const { amountCents } = parse(collectSchema, await body(c.req.raw), 'request');
    return c.json({ currency: 'EUR', ...(await collectAtDesk(db, actor, { code: parse(bookingCodeSchema, c.req.param('code'), 'booking code'), amountCents })) });
  });

  route({ method: 'post', path: '/v1/manage/beaches/:slug/bookings/:code/extras', summary: 'Add extra services to a sale already made; collected at the desk or left in the balance', tag: 'Beach club', auth: 'session', request: addExtrasSchema, success: 200, errors: [400, 401, 403, 404, 409, 422] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'bookings.create');
    const request = parse(addExtrasSchema, await body(c.req.raw), 'request');
    return c.json({ currency: 'EUR', ...(await addExtrasToBooking(db, actor, { code: parse(bookingCodeSchema, c.req.param('code'), 'booking code'), ...request })) });
  });

  route({ method: 'post', path: '/v1/manage/beaches/:slug/bookings/:code/payment-requests', summary: 'Ask the guest for a deposit or the balance, with a temporary public payment link', tag: 'Beach club', auth: 'session', request: paymentRequestSchema, success: 201, errors: [400, 401, 403, 404, 409] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'bookings.create');
    const request = parse(paymentRequestSchema, await body(c.req.raw), 'request');
    const created = await createPaymentRequest(db, actor, { code: parse(bookingCodeSchema, c.req.param('code'), 'booking code'), ...request }, signingSecret, composeRequestMessage);
    return c.json(
      {
        currency: 'EUR',
        request: { requestId: created.requestId, amountCents: created.amountCents, status: created.status, expiresAt: created.expiresAt.toISOString(), note: created.note },
        payUrl: `${siteUrl}${payPath(created.locale, created.token)}`,
        message: created.message,
        notified: created.notified,
      },
      201,
    );
  });

  route({ method: 'get', path: '/v1/manage/beaches/:slug/bookings/:code/payment-requests', summary: 'Payment requests of one booking, with the balance and the texts to copy', tag: 'Beach club', auth: 'session', success: 200, errors: [400, 401, 403, 404] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'bookings.read');
    const detail = await listPaymentRequests(db, actor, parse(bookingCodeSchema, c.req.param('code'), 'booking code'), signingSecret);
    const describe = (entry: PaymentRequestRow) => ({
      requestId: entry.requestId,
      amountCents: entry.amountCents,
      status: entry.status,
      expiresAt: entry.expiresAt.toISOString(),
      note: entry.note,
      createdAt: entry.createdAt.toISOString(),
      closedAt: entry.closedAt?.toISOString() ?? null,
      payUrl: `${siteUrl}${payPath(detail.locale, entry.token)}`,
      // The text stays readable here even without an email on the booking (spec §4.3).
      message: composeRequestMessage({
        locale: detail.locale,
        guestName: detail.guestName,
        beachName: detail.beachName,
        day: detail.day,
        to: detail.to,
        timezone: detail.timezone,
        spotCode: detail.spotCode,
        bookingCode: detail.bookingCode,
        amountCents: entry.amountCents,
        token: entry.token,
        expiresAt: entry.expiresAt,
      }),
    });
    const { requests, ...booking } = detail;
    return c.json({ currency: 'EUR', booking: { ...booking }, requests: requests.map(describe) });
  });

  route({ method: 'post', path: '/v1/manage/beaches/:slug/payment-requests/:requestId/cancel', summary: 'Cancel a pending payment request; its link stops answering', tag: 'Beach club', auth: 'session', success: 204, errors: [400, 401, 403, 404, 409] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'bookings.create');
    await cancelPaymentRequest(db, actor, parse(z.uuid(), c.req.param('requestId'), 'payment request'));
    return c.body(null, 204);
  });

  route({ method: 'get', path: '/v1/manage/beaches/:slug/notifications', summary: 'Every notification with its text: the «Comunicazioni» page', tag: 'Beach club', auth: 'session', success: 200, errors: [401, 403] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'bookings.read');
    const rows = await listNotifications(db, actor);
    return c.json({ notifications: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })) });
  });

  // The public payment page. Any unusable token — malformed, unknown, expired,
  // cancelled or already paid — answers the SAME polite refusal (spec §4.3).
  route({ method: 'get', path: '/v1/pay-requests/:token', summary: 'The essential summary behind a /paga/{token} link, with the dal–al period of the group', tag: 'Booking', auth: 'none', success: 200, errors: [404, 429] }, async (c) => {
    const summary = await readPayRequest(db, parse(payTokenSchema, c.req.param('token'), 'token'), signingSecret);
    return c.json({ currency: 'EUR', ...summary, expiresAt: summary.expiresAt.toISOString() });
  });

  route({ method: 'post', path: '/v1/pay-requests/:token/payments', summary: 'Open the payment of a request with the test provider', tag: 'Booking', auth: 'none', success: 201, errors: [404, 409, 429] }, async (c) => {
    const payment = await startPayRequestPayment(db, parse(payTokenSchema, c.req.param('token'), 'token'), signingSecret);
    return c.json({ payment: { ...payment, currency: 'EUR' } }, 201);
  });

  // ---- Season holders: their own passes, proposals and statement ----
  route({ method: 'get', path: '/v1/season/contracts', summary: 'Season passes of the signed-in person', tag: 'Season holder', auth: 'session', success: 200, errors: [401] }, async (c) => {
    const user = await currentUser(c.req.header('Authorization'));
    const contracts = await listMyContracts(db, user.userId);
    return c.json({
      contracts: contracts.map(({ contractId, beachSlug, beachName, spotCode, validFrom, validTo, status, sharingMode }) => ({
        contractId,
        beachSlug,
        beachName,
        spotCode,
        validFrom,
        validTo,
        status,
        sharingMode,
      })),
    });
  });

  route({ method: 'post', path: '/v1/season/contracts/:contractId/proposals', summary: 'Offer days, singly or as a recurrence', tag: 'Season holder', auth: 'session', request: proposeSchema, success: 200, errors: [400, 401, 404, 409] }, async (c) => {
    const user = await currentUser(c.req.header('Authorization'));
    const contractId = parse(z.uuid(), c.req.param('contractId'), 'season pass');
    const request = parse(proposeSchema, await body(c.req.raw), 'request');
    let days: string[];
    try {
      days = request.days ?? expandRecurrence(request.recurrence!);
    } catch {
      throw new HttpError(400, 'invalid_request', 'Invalid recurrence');
    }
    return c.json(await proposeDays(db, user.userId, contractId, days));
  });

  route({ method: 'post', path: '/v1/season/contracts/:contractId/withdrawals', summary: 'Take back a day that is still free', tag: 'Season holder', auth: 'session', success: 204, errors: [400, 401, 404, 409] }, async (c) => {
    const user = await currentUser(c.req.header('Authorization'));
    const contractId = parse(z.uuid(), c.req.param('contractId'), 'season pass');
    const { day } = parse(z.object({ day: daySchema }), await body(c.req.raw), 'request');
    await withdrawDay(db, user.userId, contractId, day);
    return c.body(null, 204);
  });

  route({ method: 'get', path: '/v1/season/contracts/:contractId/statement', summary: "Days offered and the holder's share, without guest data", tag: 'Season holder', auth: 'session', success: 200, errors: [401, 404] }, async (c) => {
    const user = await currentUser(c.req.header('Authorization'));
    const contractId = parse(z.uuid(), c.req.param('contractId'), 'season pass');
    return c.json({ currency: 'EUR', days: await holderStatement(db, user.userId, contractId) });
  });

  // ---- Beach club: season passes, proposals, reports ----
  route({ method: 'post', path: '/v1/manage/beaches/:slug/contracts', summary: 'Register a season pass', tag: 'Beach club', auth: 'session', request: contractSchema, success: 201, errors: [400, 401, 403, 404, 409] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'sharing.manage');
    return c.json(await createContract(db, actor, parse(contractSchema, await body(c.req.raw), 'request')), 201);
  });

  route({ method: 'post', path: '/v1/manage/beaches/:slug/contracts/:contractId/status', summary: 'Suspend or resume a season pass', tag: 'Beach club', auth: 'session', success: 204, errors: [400, 401, 403, 404] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'sharing.manage');
    const { status } = parse(z.object({ status: z.enum(['active', 'suspended']) }), await body(c.req.raw), 'request');
    await setContractStatus(db, actor, parse(z.uuid(), c.req.param('contractId'), 'season pass'), status);
    return c.body(null, 204);
  });

  route({ method: 'get', path: '/v1/manage/beaches/:slug/contracts', summary: 'Season passes of the beach club', tag: 'Beach club', auth: 'session', success: 200, errors: [401, 403] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'sharing.manage');
    return c.json({ contracts: await listContracts(db, actor) });
  });

  route({ method: 'get', path: '/v1/manage/beaches/:slug/sharing-settings', summary: 'Daily cap and price of shared days', tag: 'Beach club', auth: 'session', success: 200, errors: [401, 403] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'sharing.manage');
    return c.json({ currency: 'EUR', ...(await getSharingSettings(db, actor)) });
  });

  route({ method: 'put', path: '/v1/manage/beaches/:slug/sharing-settings', summary: 'Set daily cap and price of shared days', tag: 'Beach club', auth: 'session', request: sharingSettingsSchema, success: 204, errors: [400, 401, 403] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'sharing.manage');
    await setSharingSettings(db, actor, parse(sharingSettingsSchema, await body(c.req.raw), 'request'));
    return c.body(null, 204);
  });

  route({ method: 'get', path: '/v1/manage/beaches/:slug/proposals', summary: 'Proposals of season holders', tag: 'Beach club', auth: 'session', success: 200, errors: [400, 401, 403] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'sharing.manage');
    const status = parse(z.enum(['proposed', 'approved', 'rejected', 'withdrawn']).optional(), c.req.query('status'), 'status');
    return c.json({ proposals: await listProposals(db, actor, status) });
  });

  route({ method: 'post', path: '/v1/manage/beaches/:slug/proposals/:proposalId/decision', summary: 'Approve or reject a proposal', tag: 'Beach club', auth: 'session', request: decisionSchema, success: 204, errors: [400, 401, 403, 404, 409] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'sharing.manage');
    const decision = parse(decisionSchema, await body(c.req.raw), 'request');
    await decideProposal(db, actor, parse(z.uuid(), c.req.param('proposalId'), 'proposal'), decision);
    return c.body(null, 204);
  });

  // ---- Hotel conventions (spec §4.1): management, desk list and statement ----
  route({ method: 'get', path: '/v1/manage/beaches/:slug/conventions', summary: 'Hotel conventions of the beach club', tag: 'Beach club', auth: 'session', success: 200, errors: [401, 403] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'promotions.manage');
    return c.json({ currency: 'EUR', conventions: await listConventions(db, actor) });
  });

  route({ method: 'post', path: '/v1/manage/beaches/:slug/conventions', summary: 'Register a hotel convention: percent discount or fixed price per day', tag: 'Beach club', auth: 'session', request: conventionSchema, success: 201, errors: [400, 401, 403, 409] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'promotions.manage');
    return c.json({ currency: 'EUR', convention: await createConvention(db, actor, parse(conventionSchema, await body(c.req.raw), 'convention')) }, 201);
  });

  route({ method: 'put', path: '/v1/manage/beaches/:slug/conventions/:conventionId', summary: 'Rewrite a hotel convention; bookings keep the price they were given', tag: 'Beach club', auth: 'session', request: conventionSchema, success: 200, errors: [400, 401, 403, 404, 409] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'promotions.manage');
    const conventionId = parse(z.uuid(), c.req.param('conventionId'), 'convention');
    return c.json({ currency: 'EUR', convention: await updateConvention(db, actor, conventionId, parse(conventionSchema, await body(c.req.raw), 'convention')) });
  });

  route({ method: 'post', path: '/v1/manage/beaches/:slug/conventions/:conventionId/status', summary: 'Suspend or resume a hotel convention', tag: 'Beach club', auth: 'session', request: conventionStatusSchema, success: 204, errors: [400, 401, 403, 404] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'promotions.manage');
    const { active } = parse(conventionStatusSchema, await body(c.req.raw), 'request');
    await setConventionStatus(db, actor, parse(z.uuid(), c.req.param('conventionId'), 'convention'), active);
    return c.body(null, 204);
  });

  route({ method: 'delete', path: '/v1/manage/beaches/:slug/conventions/:conventionId', summary: 'Delete a hotel convention that was never used', tag: 'Beach club', auth: 'session', success: 204, errors: [400, 401, 403, 404, 409] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'promotions.manage');
    await deleteConvention(db, actor, parse(z.uuid(), c.req.param('conventionId'), 'convention'));
    return c.body(null, 204);
  });

  // ---- Extra services (spec §4.2): management CRUD and the public list of the booking flow ----
  // Same permission as the other commercial codes (promotions.manage, like the hotel
  // conventions): who shapes the commercial offer also shapes the extras.
  route({ method: 'get', path: '/v1/manage/beaches/:slug/extras', summary: 'Extra services of the beach club, retired ones included', tag: 'Beach club', auth: 'session', success: 200, errors: [401, 403] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'promotions.manage');
    return c.json({ currency: 'EUR', extras: await listExtraServices(db, actor) });
  });

  route({ method: 'post', path: '/v1/manage/beaches/:slug/extras', summary: 'Register an extra service sold with the spot', tag: 'Beach club', auth: 'session', request: extraServiceSchema, success: 201, errors: [400, 401, 403] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'promotions.manage');
    return c.json({ currency: 'EUR', extra: await createExtraService(db, actor, parse(extraServiceSchema, await body(c.req.raw), 'extra service')) }, 201);
  });

  route({ method: 'put', path: '/v1/manage/beaches/:slug/extras/:serviceId', summary: 'Rewrite an extra service; reservations keep the prices they froze', tag: 'Beach club', auth: 'session', request: extraServiceSchema, success: 200, errors: [400, 401, 403, 404] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'promotions.manage');
    const serviceId = parse(z.uuid(), c.req.param('serviceId'), 'extra service');
    return c.json({ currency: 'EUR', extra: await updateExtraService(db, actor, serviceId, parse(extraServiceSchema, await body(c.req.raw), 'extra service')) });
  });

  route({ method: 'post', path: '/v1/manage/beaches/:slug/extras/:serviceId/status', summary: 'Retire an extra service from sale, or put it back', tag: 'Beach club', auth: 'session', request: extraStatusSchema, success: 204, errors: [400, 401, 403, 404] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'promotions.manage');
    const { active } = parse(extraStatusSchema, await body(c.req.raw), 'request');
    await setExtraServiceStatus(db, actor, parse(z.uuid(), c.req.param('serviceId'), 'extra service'), active);
    return c.body(null, 204);
  });

  route({ method: 'delete', path: '/v1/manage/beaches/:slug/extras/:serviceId', summary: 'Delete an extra service that was never used', tag: 'Beach club', auth: 'session', success: 204, errors: [400, 401, 403, 404, 409] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'promotions.manage');
    await deleteExtraService(db, actor, parse(z.uuid(), c.req.param('serviceId'), 'extra service'));
    return c.body(null, 204);
  });

  route(
    {
      method: 'get',
      path: '/v1/manage/beaches/:slug/desk-conventions',
      summary: 'Conventions the front desk can pick for a booked day',
      tag: 'Beach club',
      auth: 'session',
      query: { day: 'YYYY-MM-DD, the booked day the validity window is checked against' },
      success: 200,
      errors: [400, 401, 403],
    },
    async (c) => {
      const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'bookings.create');
      const day = parse(daySchema, c.req.query('day'), 'day');
      return c.json({ day, currency: 'EUR', conventions: await listDeskConventions(db, actor, day) });
    },
  );

  route(
    {
      method: 'get',
      path: '/v1/manage/beaches/:slug/conventions/:conventionId/statement',
      summary: 'Bookings and totals of one convention over a period of booked days',
      tag: 'Beach club',
      auth: 'session',
      query: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' },
      success: 200,
      errors: [400, 401, 403, 404],
    },
    async (c) => {
      const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'reports.read');
      const conventionId = parse(z.uuid(), c.req.param('conventionId'), 'convention');
      const from = parse(daySchema, c.req.query('from'), 'start day');
      const to = parse(daySchema, c.req.query('to'), 'end day');
      return c.json({ currency: 'EUR', ...(await conventionStatement(db, actor, conventionId, from, to)) });
    },
  );

  route({ method: 'get', path: '/v1/manage/beaches/:slug/reports/summary', summary: 'Financial summary of a period', tag: 'Beach club', auth: 'session', query: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }, success: 200, errors: [400, 401, 403] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'reports.read');
    const from = parse(daySchema, c.req.query('from'), 'start day');
    const to = parse(daySchema, c.req.query('to'), 'end day');
    return c.json({ currency: 'EUR', ...(await reportSummary(db, actor, from, to)) });
  });

  route(
    {
      method: 'get',
      path: '/v1/manage/beaches/:slug/reports/statistics',
      summary: 'Aggregated statistics of a period: sales, occupancy, channels, arrivals, per type and per spot',
      tag: 'Beach club',
      auth: 'session',
      query: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD, at most 366 days after from' },
      success: 200,
      errors: [400, 401, 403],
    },
    async (c) => {
      const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'reports.read');
      const from = parse(daySchema, c.req.query('from'), 'start day');
      const to = parse(daySchema, c.req.query('to'), 'end day');
      // The period is a closed range of calendar days; its boundaries are meant in the
      // beach club's time zone, which the answer carries back for the caller.
      const spanDays = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 + 1;
      if (spanDays < 1) throw new HttpError(400, 'invalid_request', 'The end day must not come before the start day');
      if (spanDays > 366) throw new HttpError(400, 'invalid_request', 'The period must not exceed 366 days');
      return c.json({ currency: 'EUR', ...(await statisticsReport(db, actor, from, to)) });
    },
  );

  // ---- Beach club website: draft, publish, restore ----
  route({ method: 'get', path: '/v1/manage/beaches/:slug/site', summary: 'Draft, published revision and history of the website', tag: 'Beach club', auth: 'session', success: 200, errors: [401, 403] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'site.read');
    return c.json(await getSiteState(db, actor));
  });

  route({ method: 'put', path: '/v1/manage/beaches/:slug/site/draft', summary: 'Save the website draft', tag: 'Beach club', auth: 'session', request: siteDraftSchema, success: 200, errors: [400, 401, 403, 409] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'site.edit');
    const draft = parse(siteDraftSchema, await body(c.req.raw), 'website content');
    return c.json(await saveDraft(db, actor, draft.expectedVersion, { template: draft.template, content: draft.content }));
  });

  route({ method: 'post', path: '/v1/manage/beaches/:slug/site/publish', summary: 'Publish the website draft', tag: 'Beach club', auth: 'session', success: 200, errors: [400, 401, 403, 404, 409] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'site.edit');
    const { expectedVersion } = parse(z.object({ expectedVersion: z.number().int().min(1) }), await body(c.req.raw), 'request');
    return c.json(await publishDraft(db, actor, expectedVersion));
  });

  route({ method: 'post', path: '/v1/manage/beaches/:slug/site/restore', summary: 'Bring an old revision back as the draft', tag: 'Beach club', auth: 'session', success: 200, errors: [400, 401, 403, 404, 409] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'site.edit');
    const { revisionId } = parse(z.object({ revisionId: z.uuid() }), await body(c.req.raw), 'request');
    return c.json(await restoreRevision(db, actor, revisionId));
  });

  // ---- Beach club: position on the map and layout of the beach ----
  route({ method: 'put', path: '/v1/manage/beaches/:slug/position', summary: 'Set or clear the coordinates of the beach club', tag: 'Beach club', auth: 'session', request: positionSchema, success: 204, errors: [400, 401, 403] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'layout.edit');
    await setBeachPosition(db, actor, parse(positionSchema, await body(c.req.raw), 'position'));
    return c.body(null, 204);
  });

  route({ method: 'get', path: '/v1/manage/beaches/:slug/layout', summary: 'Zone distances and every spot with its annotations and season contract', tag: 'Beach club', auth: 'session', success: 200, errors: [401, 403] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'inventory.read');
    return c.json(await getLayout(db, actor));
  });

  route({ method: 'put', path: '/v1/manage/beaches/:slug/layout/gaps', summary: 'Set the empty rows between the shore, the umbrellas and the land side', tag: 'Beach club', auth: 'session', request: gapsSchema, success: 204, errors: [400, 401, 403] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'layout.gaps');
    await setGapRows(db, actor, parse(gapsSchema, await body(c.req.raw), 'distances'));
    return c.body(null, 204);
  });

  route({ method: 'post', path: '/v1/manage/beaches/:slug/layout/rows', summary: 'Add a row of spots to a zone', tag: 'Beach club', auth: 'session', request: addRowSchema, success: 201, errors: [400, 401, 403, 409] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'layout.edit');
    return c.json(await addRow(db, actor, parse(addRowSchema, await body(c.req.raw), 'row')), 201);
  });

  route({ method: 'post', path: '/v1/manage/beaches/:slug/layout/rows/bulk', summary: 'Add several rows of spots in one transaction, numbered with one prefix across the rows', tag: 'Beach club', auth: 'session', request: addRowsSchema, success: 201, errors: [400, 401, 403, 409] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'layout.edit');
    return c.json(await addRows(db, actor, parse(addRowsSchema, await body(c.req.raw), 'rows')), 201);
  });

  route({ method: 'put', path: '/v1/manage/beaches/:slug/layout/rows/rental', summary: 'Apply one rental label and notes to a whole row', tag: 'Beach club', auth: 'session', request: rowRentalSchema, success: 200, errors: [400, 401, 403, 404] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'layout.edit');
    return c.json(await setRowRental(db, actor, parse(rowRentalSchema, await body(c.req.raw), 'rental')));
  });

  route({ method: 'post', path: '/v1/manage/beaches/:slug/layout/spots', summary: 'Add a single spot, such as a shore sunbed', tag: 'Beach club', auth: 'session', request: addSpotSchema, success: 201, errors: [400, 401, 403, 409] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'layout.edit');
    return c.json(await addSpot(db, actor, parse(addSpotSchema, await body(c.req.raw), 'spot')), 201);
  });

  route({ method: 'put', path: '/v1/manage/beaches/:slug/layout/spots/:spotId', summary: 'Change equipment, capacity or rental annotations of a spot', tag: 'Beach club', auth: 'session', request: updateSpotSchema, success: 204, errors: [400, 401, 403, 404] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'layout.edit');
    await updateSpot(db, actor, { spotId: parse(z.uuid(), c.req.param('spotId'), 'spot'), ...parse(updateSpotSchema, await body(c.req.raw), 'change') });
    return c.body(null, 204);
  });

  route({ method: 'put', path: '/v1/manage/beaches/:slug/layout/spots/:spotId/retired', summary: 'Retire a spot from sale, or put it back on sale', tag: 'Beach club', auth: 'session', request: retiredSchema, success: 204, errors: [400, 401, 403, 404] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'layout.edit');
    const { retired } = parse(retiredSchema, await body(c.req.raw), 'request');
    await setRetired(db, actor, { spotId: parse(z.uuid(), c.req.param('spotId'), 'spot'), retired });
    return c.body(null, 204);
  });

  route({ method: 'delete', path: '/v1/manage/beaches/:slug/layout/spots/:spotId', summary: 'Delete a spot that was never used', tag: 'Beach club', auth: 'session', success: 204, errors: [400, 401, 403, 404, 409] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'layout.edit');
    await deleteSpot(db, actor, { spotId: parse(z.uuid(), c.req.param('spotId'), 'spot') });
    return c.body(null, 204);
  });

  // ---- The drawing of the beach: sea side and elements ----
  route({ method: 'put', path: '/v1/manage/beaches/:slug/layout/sea-side', summary: 'Choose on which side the sea is drawn', tag: 'Beach club', auth: 'session', request: seaSideSchema, success: 204, errors: [400, 401, 403] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'layout.edit');
    const { seaSide } = parse(seaSideSchema, await body(c.req.raw), 'sea side');
    await setSeaSide(db, actor, seaSide);
    return c.body(null, 204);
  });

  route({ method: 'post', path: '/v1/manage/beaches/:slug/layout/elements', summary: 'Draw a walkway, a structure, a cabin block or a decoration on the grid', tag: 'Beach club', auth: 'session', request: elementSchema, success: 201, errors: [400, 401, 403, 409] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'layout.edit');
    return c.json(await addElement(db, actor, parse(elementSchema, await body(c.req.raw), 'element')), 201);
  });

  route({ method: 'delete', path: '/v1/manage/beaches/:slug/layout/elements/:elementId', summary: 'Erase an element; cabins of an erased block stay, no longer drawn', tag: 'Beach club', auth: 'session', success: 200, errors: [400, 401, 403, 404] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'layout.edit');
    return c.json(await removeElement(db, actor, { elementId: parse(z.uuid(), c.req.param('elementId'), 'element') }));
  });

  route({ method: 'put', path: '/v1/manage/beaches/:slug/layout/spots/:spotId/type', summary: 'Change the type of a spot without touching its equipment', tag: 'Beach club', auth: 'session', request: spotTypeRefSchema, success: 204, errors: [400, 401, 403, 404] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'layout.edit');
    const { typeId } = parse(spotTypeRefSchema, await body(c.req.raw), 'type');
    await setSpotType(db, actor, { spotId: parse(z.uuid(), c.req.param('spotId'), 'spot'), typeId });
    return c.body(null, 204);
  });

  // ---- Spot types ----
  route({ method: 'get', path: '/v1/manage/beaches/:slug/types', summary: 'Spot types of the beach club, builtins first', tag: 'Beach club', auth: 'session', success: 200, errors: [401, 403] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'layout.edit');
    return c.json({ currency: 'EUR', types: await listSpotTypes(db, actor) });
  });

  route({ method: 'post', path: '/v1/manage/beaches/:slug/types', summary: 'Create a custom spot type', tag: 'Beach club', auth: 'session', request: spotTypeSchema, success: 201, errors: [400, 401, 403, 409] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'layout.edit');
    return c.json(await createSpotType(db, actor, parse(spotTypeSchema, await body(c.req.raw), 'type')), 201);
  });

  route({ method: 'put', path: '/v1/manage/beaches/:slug/types/:typeId', summary: 'Edit a spot type; existing spots are never touched', tag: 'Beach club', auth: 'session', request: spotTypeUpdateSchema, success: 204, errors: [400, 401, 403, 404, 409] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'layout.edit');
    await updateSpotType(db, actor, { typeId: parse(z.uuid(), c.req.param('typeId'), 'type'), ...parse(spotTypeUpdateSchema, await body(c.req.raw), 'change') });
    return c.body(null, 204);
  });

  route({ method: 'delete', path: '/v1/manage/beaches/:slug/types/:typeId', summary: 'Delete a custom spot type that no spot uses', tag: 'Beach club', auth: 'session', success: 204, errors: [400, 401, 403, 404, 409] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'layout.edit');
    await deleteSpotType(db, actor, { typeId: parse(z.uuid(), c.req.param('typeId'), 'type') });
    return c.body(null, 204);
  });

  // ---- Cabins: register, assignments and sublets ----
  route({ method: 'get', path: '/v1/manage/beaches/:slug/cabins/today', summary: "Today's occupant of every cabin, for the front desk", tag: 'Beach club', auth: 'session', success: 200, errors: [401, 403] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'bookings.read');
    return c.json({ cabins: await cabinsToday(db, actor) });
  });

  route({ method: 'get', path: '/v1/manage/beaches/:slug/cabins', summary: 'Every cabin with its position, current assignment and occupant of today', tag: 'Beach club', auth: 'session', success: 200, errors: [401, 403] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'cabins.manage');
    return c.json({ cabins: await listCabins(db, actor) });
  });

  route({ method: 'post', path: '/v1/manage/beaches/:slug/cabins', summary: 'Register a sea cabin, optionally inside a drawn cabin block', tag: 'Beach club', auth: 'session', request: cabinSchema, success: 201, errors: [400, 401, 403, 404, 409] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'cabins.manage');
    return c.json(await createCabin(db, actor, parse(cabinSchema, await body(c.req.raw), 'cabin')), 201);
  });

  route({ method: 'get', path: '/v1/manage/beaches/:slug/cabins/:cabinId', summary: 'The seasonal trace of one cabin: every assignment with its sublets', tag: 'Beach club', auth: 'session', success: 200, errors: [400, 401, 403, 404] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'cabins.manage');
    return c.json(await cabinHistory(db, actor, parse(z.uuid(), c.req.param('cabinId'), 'cabin')));
  });

  route({ method: 'put', path: '/v1/manage/beaches/:slug/cabins/:cabinId', summary: 'Change code, block or notes of a cabin', tag: 'Beach club', auth: 'session', request: cabinUpdateSchema, success: 204, errors: [400, 401, 403, 404, 409] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'cabins.manage');
    await updateCabin(db, actor, { cabinId: parse(z.uuid(), c.req.param('cabinId'), 'cabin'), ...parse(cabinUpdateSchema, await body(c.req.raw), 'change') });
    return c.body(null, 204);
  });

  route({ method: 'delete', path: '/v1/manage/beaches/:slug/cabins/:cabinId', summary: 'Delete a cabin that was never assigned', tag: 'Beach club', auth: 'session', success: 204, errors: [400, 401, 403, 404, 409] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'cabins.manage');
    await deleteCabin(db, actor, { cabinId: parse(z.uuid(), c.req.param('cabinId'), 'cabin') });
    return c.body(null, 204);
  });

  route({ method: 'post', path: '/v1/manage/beaches/:slug/cabins/:cabinId/assignments', summary: 'Assign a cabin to a holder for a period, with or without an account', tag: 'Beach club', auth: 'session', request: assignmentSchema, success: 201, errors: [400, 401, 403, 404, 409] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'cabins.manage');
    const assignment = parse(assignmentSchema, await body(c.req.raw), 'assignment');
    return c.json(await assignCabin(db, actor, { cabinId: parse(z.uuid(), c.req.param('cabinId'), 'cabin'), ...assignment }), 201);
  });

  route({ method: 'post', path: '/v1/manage/beaches/:slug/cabin-assignments/:assignmentId/end', summary: 'End an assignment, early or not; sublets beyond the new end are truncated or closed', tag: 'Beach club', auth: 'session', request: endAssignmentSchema, success: 200, errors: [400, 401, 403, 404, 409] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'cabins.manage');
    const { endOn } = parse(endAssignmentSchema, await body(c.req.raw), 'request');
    return c.json(await endAssignment(db, actor, { assignmentId: parse(z.uuid(), c.req.param('assignmentId'), 'assignment'), endOn }));
  });

  route({ method: 'get', path: '/v1/manage/beaches/:slug/cabin-sublets', summary: 'Sublet proposals waiting for a decision', tag: 'Beach club', auth: 'session', success: 200, errors: [401, 403] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'cabins.manage');
    return c.json({ sublets: await listPendingSublets(db, actor) });
  });

  route({ method: 'post', path: '/v1/manage/beaches/:slug/cabin-sublets/:subletId/decision', summary: 'Approve or reject a sublet proposal', tag: 'Beach club', auth: 'session', request: subletDecisionSchema, success: 204, errors: [400, 401, 403, 404, 409] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'cabins.manage');
    await decideSublet(db, actor, parse(z.uuid(), c.req.param('subletId'), 'sublet'), parse(subletDecisionSchema, await body(c.req.raw), 'decision'));
    return c.body(null, 204);
  });

  // ---- Cabin holders: their own cabins and proposals ----
  route({ method: 'get', path: '/v1/my/cabins', summary: 'Cabins assigned to the signed-in holder, with their sublets', tag: 'Cabin holder', auth: 'session', success: 200, errors: [401] }, async (c) => {
    const user = await currentUser(c.req.header('Authorization'));
    return c.json({ assignments: await listMyCabins(db, user.userId) });
  });

  route({ method: 'post', path: '/v1/my/assignments/:assignmentId/sublets', summary: 'Propose a sublet inside an own assignment period', tag: 'Cabin holder', auth: 'session', request: subletProposalSchema, success: 201, errors: [400, 401, 404, 409] }, async (c) => {
    const user = await currentUser(c.req.header('Authorization'));
    const proposal = parse(subletProposalSchema, await body(c.req.raw), 'proposal');
    return c.json(await proposeSublet(db, user.userId, { assignmentId: parse(z.uuid(), c.req.param('assignmentId'), 'assignment'), ...proposal }), 201);
  });

  route({ method: 'get', path: '/v1/health', summary: 'Liveness check', tag: 'System', auth: 'none', success: 200, errors: [] }, async (c) => {
    await db.execute(sql`select 1`);
    return c.json({ status: 'ok' });
  });

  route(
    {
      method: 'get',
      path: '/v1/beaches',
      summary: 'Active beach clubs; with a day or a dal–al period, the spots free every day and the lowest total of each',
      tag: 'Public',
      auth: 'none',
      optionalQuery: {
        day: 'YYYY-MM-DD. Adds freeSpots and priceFromCents to every beach club',
        to: 'YYYY-MM-DD, last day of the period. Needs day; equal to day when left out, at most 31 days',
        guests: 'People who must fit under one spot, 1 to 20. Needs day; 1 when left out',
        locality: 'Text contained in the locality or in the name',
        sharedOnly: 'true to count only shared days. Needs day',
      },
      success: 200,
      errors: [400, 409],
    },
    async (c) => {
      const search = parse(beachSearchSchema, c.req.query(), 'search');
      if (!search.day) return c.json({ beaches: await Promise.all((await listActiveBeaches(db, search.locality)).map(listedBeach)) });
      const guests = search.guests ?? 1;
      const sharedOnly = search.sharedOnly === 'true';
      const to = search.to ?? search.day;
      const offers = await searchBeaches(db, { day: search.day, to, guests, sharedOnly, place: search.locality });
      return c.json({
        day: search.day,
        to,
        guests,
        sharedOnly,
        currency: 'EUR',
        beaches: await Promise.all(offers.map(async (offer) => ({ ...(await listedBeach(offer)), freeSpots: offer.freeSpots, priceFromCents: offer.priceFromCents }))),
      });
    },
  );

  route({ method: 'get', path: '/v1/beaches/:slug', summary: 'A beach club, its next free day and its published website', tag: 'Public', auth: 'none', success: 200, errors: [400, 404] }, async (c) => {
    const beach = await beachBySlug(parse(slugSchema, c.req.param('slug'), 'beach club'));
    return c.json({ beach: publicBeach(beach), nextAvailableDay: await nextAvailableDay(db, beach), site: await getPublishedSite(db, beach.id) });
  });

  // The dedicated route keeps the availability answer untouched; the unit prices of
  // the extras are public only here, inside the booking flow of the beach club
  // (spec §4.2): no list of beach clubs or availability map ever carries them.
  route({ method: 'get', path: '/v1/beaches/:slug/extras', summary: 'Active extra services a guest can add while booking at this beach club', tag: 'Booking', auth: 'none', success: 200, errors: [400, 404] }, async (c) => {
    const beach = await beachBySlug(parse(slugSchema, c.req.param('slug'), 'beach club'));
    return c.json({ beach: publicBeach(beach), currency: 'EUR', extras: await listActiveExtras(db, beach.id) });
  });

  route({ method: 'get', path: '/v1/beaches/:slug/holds/:holdId', summary: 'A hold, by its identifier', tag: 'Booking', auth: 'none', success: 200, errors: [400, 404] }, async (c) => {
    const beach = await beachBySlug(parse(slugSchema, c.req.param('slug'), 'beach club'));
    const held = await getHold(db, beach.id, parse(z.uuid(), c.req.param('holdId'), 'hold'));
    return c.json({
      holdId: held.holdId,
      status: held.live ? 'active' : held.status === 'active' ? 'expired' : held.status,
      expiresAt: held.expiresAt.toISOString(),
      beach: publicBeach(beach),
      day: held.day,
      from: held.from,
      to: held.to,
      spot: { code: held.spotCode, rowNumber: held.rowNumber, umbrellas: held.umbrellas, sunbeds: held.sunbeds },
      ...purchaseMoney(held.quote),
    });
  });

  route(
    {
      method: 'get',
      path: '/v1/beaches/:slug/availability',
      summary: 'Spots free on every day of a dal–al period with total prices, every spot with its cell and type for the map, and the drawing of the beach',
      tag: 'Public',
      auth: 'none',
      query: { day: 'YYYY-MM-DD, first day of the period' },
      optionalQuery: {
        to: 'YYYY-MM-DD, last day of the period; equal to day when left out, at most 31 days',
        guests: 'People who must fit under one spot, 1 to 20. Adds suggestedSpotId to the answer',
      },
      success: 200,
      errors: [400, 404, 409],
    },
    async (c) => {
      const slug = parse(slugSchema, c.req.param('slug'), 'beach club');
      const day = parse(daySchema, c.req.query('day'), 'day');
      const toGiven = c.req.query('to');
      const to = toGiven === undefined ? day : parse(daySchema, toGiven, 'end day');
      const guests = parse(guestsQuerySchema, c.req.query('guests'), 'guests');
      const beach = await beachBySlug(slug);
      // One reading for both lists, so that they can never disagree.
      const layout = await listDayMap(db, beach.id, day, to);
      const { seaSide, elements, ...gaps } = await getPublicCanvas(db, beach.id);
      // The suggestion (spec §3.3) only exists when the party size is known, and it is
      // the sole management-flavoured addition the public ever receives: an identifier.
      const sellable = layout.flatMap(({ priceCents, ...place }) => (priceCents === null ? [] : [{ ...place, priceCents }]));
      return c.json({
        beach: publicBeach(beach),
        day,
        to,
        currency: 'EUR',
        // The drawing: side of the sea, corridor rows between the zones, walkways and other elements.
        seaSide,
        gaps,
        elements,
        spots: sellable.map(({ status, ...spot }) => ({ ...spot, shared: status === 'shared' })),
        layout,
        ...(guests === undefined ? {} : { guests, suggestedSpotId: suggestSpot(sellable, guests)?.spotId ?? null }),
      });
    },
  );

  route({ method: 'post', path: '/v1/quotes', summary: 'Price of a day or of a dal–al period, with the chosen extras per line, as the server computes it', tag: 'Booking', auth: 'none', request: dayRequestSchema, success: 200, errors: [400, 404, 409, 422, 429] }, async (c) => {
    const request = parse(dayRequestSchema, await body(c.req.raw), 'request');
    const beach = await beachBySlug(request.beachSlug);
    const quote = await quoteSpot(db, beach.id, request);
    return c.json({ beachSlug: beach.slug, spotId: request.spotId, day: request.day, to: request.to ?? request.day, ...purchaseMoney(quote) });
  });

  route({ method: 'post', path: '/v1/holds', summary: 'Hold a spot for a limited time, for a day or a whole dal–al period, all or nothing', tag: 'Booking', auth: 'none', request: dayRequestSchema, headers: { 'Idempotency-Key': 'Chosen by the client: the same key returns the same hold' }, success: 201, errors: [400, 404, 409, 422, 429] }, async (c) => {
    const header = c.req.header('Idempotency-Key');
    if (!header) throw new HttpError(400, 'idempotency_key_required', 'The Idempotency-Key header is required');
    const idempotencyKey = parse(idempotencyKeySchema, header, 'Idempotency-Key header');
    const request = parse(dayRequestSchema, await body(c.req.raw), 'request');
    const beach = await beachBySlug(request.beachSlug);
    const held = await acquireHold(db, beach.id, { ...request, idempotencyKey, ttlSeconds: holdSeconds });
    return c.json(
      {
        holdId: held.holdId,
        status: held.status,
        expiresAt: held.expiresAt.toISOString(),
        beachSlug: beach.slug,
        spotId: request.spotId,
        day: request.day,
        from: held.from,
        to: held.to,
        ...purchaseMoney(held.quote),
      },
      held.replayed ? 200 : 201,
    );
  });

  // The document lists exactly the routes registered above.
  app.get('/v1/openapi.json', (c) => c.json(buildOpenApi(operations, { title: 'Ombrè API', version: '1' })));

  app.notFound((c) => c.json({ error: { code: 'not_found', message: 'Not found' } }, 404));

  app.onError((error, c) => {
    if (error instanceof HttpError) return c.json({ error: { code: error.code, message: error.message } }, error.status);
    if (error instanceof DomainError) {
      return c.json({ error: { code: error.code, message: error.message } }, domainStatus[error.code]);
    }
    // Internal details stay in the server log.
    log('Unhandled error', error);
    return c.json({ error: { code: 'internal_error', message: 'Something went wrong' } }, 500);
  });

  return app;
}
