import { createHmac, timingSafeEqual } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  acquireHold,
  addRow,
  addSpot,
  applyPaymentOutcome,
  authorize,
  beginTwoFactor,
  cancelByBeachClub,
  checkAccess,
  confirmTwoFactor,
  createContract,
  decideProposal,
  deleteSpot,
  deskBooking,
  DomainError,
  findActiveBeach,
  getBooking,
  getHold,
  getLayout,
  getPublishedSite,
  getSharingSettings,
  getSiteState,
  getZoneGaps,
  holderStatement,
  listActiveBeaches,
  listDayMap,
  listBookings,
  listContracts,
  listInventory,
  listMyContracts,
  listProposals,
  listMemberships,
  login,
  logout,
  moveBooking,
  nextAvailableDay,
  proposeDays,
  publishDraft,
  publishDay,
  reportSummary,
  resolveSession,
  restoreRevision,
  saveDraft,
  searchBeaches,
  setBeachPosition,
  setBlocked,
  setContractStatus,
  setGapRows,
  setPrice,
  setRetired,
  setRowRental,
  setSharingSettings,
  startCheckout,
  updateSpot,
  withdrawDay,
  quoteSpot,
  type Database,
  type DomainErrorCode,
  type PublicBeach,
  type SessionUser,
} from '@ombre/db';
import { buildOpenApi, type Operation } from './openapi';
import { createRateLimiter, type RateLimiter } from './rate-limit';
import { base32Encode, expandRecurrence, maxGapRows, rentalNotesMaxLength, rentalTypeMaxLength, siteTemplates, siteTextLimits, spotZones, type Action, type DayQuote } from '@ombre/shared';

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
  readonly status: 400 | 401 | 404 | 503;
  readonly code: string;

  constructor(status: 400 | 401 | 404 | 503, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const domainStatus: Record<DomainErrorCode, 401 | 403 | 404 | 409 | 422 | 429> = {
  not_found: 404,
  inventory_conflict: 409,
  promo_not_applicable: 422,
  idempotency_mismatch: 422,
  invalid_credentials: 401,
  account_locked: 429,
  forbidden: 403,
  invalid_state: 409,
  hold_expired: 409,
  pass_invalid: 422,
  wrong_day: 409,
  cap_reached: 409,
  version_conflict: 409,
  totp_required: 401,
  totp_invalid: 422,
  totp_setup_required: 403,
};

const slugSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(80);
const daySchema = z.iso.date();
const dayRequestSchema = z.object({
  beachSlug: slugSchema,
  spotId: z.uuid(),
  day: daySchema,
  promoCode: z.string().trim().min(1).max(40).optional(),
});
const codeSchema = z.string().regex(/^\d{6}$/);
const loginSchema = z.object({ email: z.email().max(200), password: z.string().min(1).max(200), code: codeSchema.optional() });
const priceSchema = z.number().int().min(0).max(1_000_000);
const publishSchema = z.object({ day: daySchema, priceCents: priceSchema, spotIds: z.array(z.uuid()).min(1).max(500).optional() });
const blockSchema = z.object({ spotId: z.uuid(), day: daySchema, blocked: z.boolean(), reason: z.string().trim().max(200).optional() });
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
const deskSchema = z.object({ spotId: z.uuid(), day: daySchema, guestName: z.string().trim().min(1).max(120) });
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
const addRowSchema = z.object({ zone: zoneSchema, prefix: z.string().regex(/^[A-Z]{1,4}$/), count: z.number().int().min(1).max(50), ...equipmentFields });
const addSpotSchema = z.object({
  zone: zoneSchema,
  code: z.string().regex(/^[A-Z0-9][A-Z0-9-]{0,9}$/),
  rowNumber: z.number().int().min(1).max(200).optional(),
  ...equipmentFields,
  rentalType: rentalTypeSchema.nullable().optional(),
  rentalNotes: rentalNotesSchema.nullable().optional(),
});
// Absent leaves a field as it is; an explicit null clears an annotation.
const updateSpotSchema = z
  .object({ ...equipmentFields, rentalType: rentalTypeSchema.nullable().optional(), rentalNotes: rentalNotesSchema.nullable().optional() })
  .refine((change) => Object.values(change).some((value) => value !== undefined));
const rowRentalSchema = z.object({ zone: zoneSchema, rowNumber: z.number().int().min(1).max(200), rentalType: rentalTypeSchema.nullable(), rentalNotes: rentalNotesSchema.nullable() });
const retiredSchema = z.object({ retired: z.boolean() });
// Guests and shared days only mean something on a given day.
const beachSearchSchema = z
  .object({
    day: daySchema.optional(),
    guests: z.string().regex(/^\d{1,2}$/).transform(Number).pipe(z.number().int().min(1).max(20)).optional(),
    locality: z.string().trim().min(1).max(80).optional(),
    sharedOnly: z.enum(['true', 'false']).optional(),
  })
  .refine((search) => search.day !== undefined || (search.guests === undefined && search.sharedOnly === undefined));

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

function publicBeach(beach: PublicBeach) {
  // Coordinates are null until the manager sets them: the club then stays off the map.
  return { slug: beach.slug, name: beach.name, locality: beach.locality, timezone: beach.timezone, demo: beach.demo, latitude: beach.latitude, longitude: beach.longitude };
}

// Requests per minute and per client on the routes most exposed to abuse.
const limits: Record<string, number> = {
  'post /v1/auth/login': 10,
  'post /v1/holds': 30,
  'post /v1/checkouts': 20,
  'post /v1/quotes': 120,
};

export function createApp(options: AppOptions): Hono {
  const { db, holdSeconds, sessionSeconds = 12 * 60 * 60, signingSecret, sandboxWebhookSecret, log = console.error } = options;
  if (signingSecret.length < 32) throw new RangeError('signingSecret must be at least 32 characters long');
  const app = new Hono();

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

  async function currentUser(authorization: string | undefined): Promise<SessionUser & { token: string }> {
    const token = /^Bearer ([A-Za-z0-9_-]{20,200})$/.exec(authorization ?? '')?.[1];
    const user = token ? await resolveSession(db, token) : null;
    if (!token || !user) throw new HttpError(401, 'unauthenticated', 'Sign in to continue');
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
    return c.json({ token: session.token, expiresAt: session.expiresAt.toISOString() });
  });

  route({ method: 'post', path: '/v1/auth/logout', summary: 'End the current session', tag: 'Sign-in', auth: 'session', success: 204, errors: [401] }, async (c) => {
    const user = await currentUser(c.req.header('Authorization'));
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
    const user = await currentUser(c.req.header('Authorization'));
    const memberships = await listMemberships(db, user.userId);
    return c.json({
      user: { email: user.email, name: user.name, platformRole: user.platformRole, twoFactor: user.twoFactor },
      memberships: memberships.map(({ beachSlug, beachName, role }) => ({ beachSlug, beachName, role })),
    });
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
    return c.json({ ...rest, beach: publicBeach(beach), ...money(quote) });
  });

  route({ method: 'post', path: '/v1/manage/beaches/:slug/access-events', summary: 'Register an entry or an exit from a pass', tag: 'Beach club', auth: 'session', request: accessSchema, success: 201, errors: [400, 401, 403, 409, 422] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'access.check');
    return c.json(await checkAccess(db, actor, parse(accessSchema, await body(c.req.raw), 'request'), signingSecret), 201);
  });

  route({ method: 'post', path: '/v1/manage/beaches/:slug/desk-bookings', summary: 'Book a spot at the front desk, paid there', tag: 'Beach club', auth: 'session', request: deskSchema, success: 201, errors: [400, 401, 403, 404, 409] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'bookings.create');
    return c.json(await deskBooking(db, actor, parse(deskSchema, await body(c.req.raw), 'request'), signingSecret), 201);
  });

  route({ method: 'post', path: '/v1/manage/beaches/:slug/bookings/:code/move', summary: 'Move a confirmed booking to another spot of the same day', tag: 'Beach club', auth: 'session', request: z.object({ spotId: z.uuid() }), success: 204, errors: [400, 401, 403, 404, 409] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'bookings.move');
    const { spotId } = parse(z.object({ spotId: z.uuid() }), await body(c.req.raw), 'request');
    await moveBooking(db, actor, { code: parse(bookingCodeSchema, c.req.param('code'), 'booking code'), spotId });
    return c.body(null, 204);
  });

  route({ method: 'post', path: '/v1/manage/beaches/:slug/bookings/:code/cancel', summary: 'Cancel a confirmed booking and record its refund', tag: 'Beach club', auth: 'session', request: z.object({ reason: z.string().trim().min(3).max(200) }), success: 204, errors: [400, 401, 403, 404, 409] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'bookings.cancel');
    const { reason } = parse(z.object({ reason: z.string().trim().min(3).max(200) }), await body(c.req.raw), 'request');
    await cancelByBeachClub(db, actor, { code: parse(bookingCodeSchema, c.req.param('code'), 'booking code'), reason });
    return c.body(null, 204);
  });

  route({ method: 'get', path: '/v1/manage/beaches/:slug/bookings', summary: 'Bookings of a day for the front desk', tag: 'Beach club', auth: 'session', query: { day: 'YYYY-MM-DD' }, success: 200, errors: [400, 401, 403] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'bookings.read');
    const day = parse(daySchema, c.req.query('day'), 'day');
    return c.json({ day, currency: 'EUR', bookings: await listBookings(db, actor, day) });
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

  route({ method: 'get', path: '/v1/manage/beaches/:slug/reports/summary', summary: 'Financial summary of a period', tag: 'Beach club', auth: 'session', query: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }, success: 200, errors: [400, 401, 403] }, async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'reports.read');
    const from = parse(daySchema, c.req.query('from'), 'start day');
    const to = parse(daySchema, c.req.query('to'), 'end day');
    return c.json({ currency: 'EUR', ...(await reportSummary(db, actor, from, to)) });
  });

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

  route({ method: 'get', path: '/v1/health', summary: 'Liveness check', tag: 'System', auth: 'none', success: 200, errors: [] }, async (c) => {
    await db.execute(sql`select 1`);
    return c.json({ status: 'ok' });
  });

  route(
    {
      method: 'get',
      path: '/v1/beaches',
      summary: 'Active beach clubs; with a day, the free spots and the lowest price of each',
      tag: 'Public',
      auth: 'none',
      optionalQuery: {
        day: 'YYYY-MM-DD. Adds freeSpots and priceFromCents to every beach club',
        guests: 'People who must fit under one spot, 1 to 20. Needs day; 1 when left out',
        locality: 'Text contained in the locality or in the name',
        sharedOnly: 'true to count only shared days. Needs day',
      },
      success: 200,
      errors: [400],
    },
    async (c) => {
      const search = parse(beachSearchSchema, c.req.query(), 'search');
      if (!search.day) return c.json({ beaches: await Promise.all((await listActiveBeaches(db, search.locality)).map(listedBeach)) });
      const guests = search.guests ?? 1;
      const sharedOnly = search.sharedOnly === 'true';
      const offers = await searchBeaches(db, { day: search.day, guests, sharedOnly, place: search.locality });
      return c.json({
        day: search.day,
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

  route({ method: 'get', path: '/v1/beaches/:slug/holds/:holdId', summary: 'A hold, by its identifier', tag: 'Booking', auth: 'none', success: 200, errors: [400, 404] }, async (c) => {
    const beach = await beachBySlug(parse(slugSchema, c.req.param('slug'), 'beach club'));
    const held = await getHold(db, beach.id, parse(z.uuid(), c.req.param('holdId'), 'hold'));
    return c.json({
      holdId: held.holdId,
      status: held.live ? 'active' : held.status === 'active' ? 'expired' : held.status,
      expiresAt: held.expiresAt.toISOString(),
      beach: publicBeach(beach),
      day: held.day,
      spot: { code: held.spotCode, rowNumber: held.rowNumber, umbrellas: held.umbrellas, sunbeds: held.sunbeds },
      ...money(held.quote),
    });
  });

  route({ method: 'get', path: '/v1/beaches/:slug/availability', summary: 'Free spots of a day with prices, every spot with its state and zone for the map, and the distances between zones', tag: 'Public', auth: 'none', query: { day: 'YYYY-MM-DD' }, success: 200, errors: [400, 404] }, async (c) => {
    const slug = parse(slugSchema, c.req.param('slug'), 'beach club');
    const day = parse(daySchema, c.req.query('day'), 'day');
    const beach = await beachBySlug(slug);
    // One reading for both lists, so that they can never disagree.
    const layout = await listDayMap(db, beach.id, day);
    return c.json({
      beach: publicBeach(beach),
      day,
      currency: 'EUR',
      // Empty corridor rows between the zones, for drawing the map to scale.
      gaps: await getZoneGaps(db, beach.id),
      spots: layout.flatMap(({ status, priceCents, ...spot }) => (priceCents === null ? [] : [{ ...spot, priceCents, shared: status === 'shared' }])),
      layout,
    });
  });

  route({ method: 'post', path: '/v1/quotes', summary: 'Price of a day as the server computes it', tag: 'Booking', auth: 'none', request: dayRequestSchema, success: 200, errors: [400, 404, 409, 422, 429] }, async (c) => {
    const request = parse(dayRequestSchema, await body(c.req.raw), 'request');
    const beach = await beachBySlug(request.beachSlug);
    const quote = await quoteSpot(db, beach.id, request);
    return c.json({ beachSlug: beach.slug, spotId: request.spotId, day: request.day, ...money(quote) });
  });

  route({ method: 'post', path: '/v1/holds', summary: 'Hold a spot for a limited time', tag: 'Booking', auth: 'none', request: dayRequestSchema, headers: { 'Idempotency-Key': 'Chosen by the client: the same key returns the same hold' }, success: 201, errors: [400, 404, 409, 422, 429] }, async (c) => {
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
        ...money(held.quote),
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
