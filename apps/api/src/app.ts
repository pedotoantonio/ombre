import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  acquireHold,
  authorize,
  DomainError,
  findActiveBeach,
  getHold,
  listActiveBeaches,
  listAvailability,
  listInventory,
  listMemberships,
  login,
  logout,
  nextAvailableDay,
  publishDay,
  resolveSession,
  setBlocked,
  setPrice,
  quoteSpot,
  type Database,
  type DomainErrorCode,
  type PublicBeach,
  type SessionUser,
} from '@ombre/db';
import type { Action, DayQuote } from '@ombre/shared';

export interface AppOptions {
  db: Database;
  /** How long a hold keeps a spot, in seconds. */
  holdSeconds: number;
  /** How long a sign-in lasts, in seconds. Twelve hours when not given. */
  sessionSeconds?: number;
  log?: (message: string, error: unknown) => void;
}

class HttpError extends Error {
  readonly status: 400 | 401 | 404;
  readonly code: string;

  constructor(status: 400 | 401 | 404, code: string, message: string) {
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
};

const slugSchema = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(80);
const daySchema = z.iso.date();
const dayRequestSchema = z.object({
  beachSlug: slugSchema,
  spotId: z.uuid(),
  day: daySchema,
  promoCode: z.string().trim().min(1).max(40).optional(),
});
const loginSchema = z.object({ email: z.email().max(200), password: z.string().min(1).max(200) });
const priceSchema = z.number().int().min(0).max(1_000_000);
const publishSchema = z.object({ day: daySchema, priceCents: priceSchema, spotIds: z.array(z.uuid()).min(1).max(500).optional() });
const blockSchema = z.object({ spotId: z.uuid(), day: daySchema, blocked: z.boolean(), reason: z.string().trim().max(200).optional() });
const spotPriceSchema = z.object({ spotId: z.uuid(), day: daySchema, priceCents: priceSchema });
const idempotencyKeySchema = z.string().min(8).max(200).regex(/^[\x21-\x7e]+$/);

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
  return { slug: beach.slug, name: beach.name, locality: beach.locality, timezone: beach.timezone, demo: beach.demo };
}

export function createApp({ db, holdSeconds, sessionSeconds = 12 * 60 * 60, log = console.error }: AppOptions): Hono {
  const app = new Hono();

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
    return authorize(db, user.userId, parse(slugSchema, slug, 'beach club'), action);
  }

  app.post('/v1/auth/login', async (c) => {
    const credentials = parse(loginSchema, await body(c.req.raw), 'credentials');
    const session = await login(db, credentials.email, credentials.password, sessionSeconds);
    return c.json({ token: session.token, expiresAt: session.expiresAt.toISOString() });
  });

  app.post('/v1/auth/logout', async (c) => {
    const user = await currentUser(c.req.header('Authorization'));
    await logout(db, user.token);
    return c.body(null, 204);
  });

  app.get('/v1/me', async (c) => {
    const user = await currentUser(c.req.header('Authorization'));
    const memberships = await listMemberships(db, user.userId);
    return c.json({
      user: { email: user.email, name: user.name, platformRole: user.platformRole },
      memberships: memberships.map(({ beachSlug, beachName, role }) => ({ beachSlug, beachName, role })),
    });
  });

  app.get('/v1/manage/beaches/:slug/inventory', async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'inventory.read');
    const day = parse(daySchema, c.req.query('day'), 'day');
    return c.json({ day, currency: 'EUR', spots: await listInventory(db, actor, day) });
  });

  app.post('/v1/manage/beaches/:slug/inventory/publish', async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'inventory.publish');
    return c.json(await publishDay(db, actor, parse(publishSchema, await body(c.req.raw), 'request')));
  });

  app.post('/v1/manage/beaches/:slug/inventory/block', async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'inventory.block');
    await setBlocked(db, actor, parse(blockSchema, await body(c.req.raw), 'request'));
    return c.body(null, 204);
  });

  app.put('/v1/manage/beaches/:slug/inventory/price', async (c) => {
    const actor = await actorFor(c.req.header('Authorization'), c.req.param('slug'), 'inventory.price');
    await setPrice(db, actor, parse(spotPriceSchema, await body(c.req.raw), 'request'));
    return c.body(null, 204);
  });

  app.get('/v1/health', async (c) => {
    await db.execute(sql`select 1`);
    return c.json({ status: 'ok' });
  });

  app.get('/v1/beaches', async (c) => {
    const beaches = await listActiveBeaches(db);
    return c.json({ beaches: beaches.map(publicBeach) });
  });

  app.get('/v1/beaches/:slug', async (c) => {
    const beach = await beachBySlug(parse(slugSchema, c.req.param('slug'), 'beach club'));
    return c.json({ beach: publicBeach(beach), nextAvailableDay: await nextAvailableDay(db, beach) });
  });

  app.get('/v1/beaches/:slug/holds/:holdId', async (c) => {
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

  app.get('/v1/beaches/:slug/availability', async (c) => {
    const slug = parse(slugSchema, c.req.param('slug'), 'beach club');
    const day = parse(daySchema, c.req.query('day'), 'day');
    const beach = await beachBySlug(slug);
    const spots = await listAvailability(db, beach.id, day);
    return c.json({
      beach: publicBeach(beach),
      day,
      currency: 'EUR',
      spots: spots.map(({ priceCents, ...spot }) => ({ ...spot, priceCents })),
    });
  });

  app.post('/v1/quotes', async (c) => {
    const request = parse(dayRequestSchema, await body(c.req.raw), 'request');
    const beach = await beachBySlug(request.beachSlug);
    const quote = await quoteSpot(db, beach.id, request);
    return c.json({ beachSlug: beach.slug, spotId: request.spotId, day: request.day, ...money(quote) });
  });

  app.post('/v1/holds', async (c) => {
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
