import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { withBeach, withUser, type Database, type Transaction } from './client';
import { DomainError, normalizePromo, periodDays, priceExtras, quoteSpotWithin, type ExtraRequest, type PurchaseQuote } from './inventory';
import { beach, beachZone, cart, cartItem, cartItemExtra, spot, spotType } from './schema';

// The cart (D46): it lives on the server, belongs to ONE beach club and
// reserves nothing. Without an account the browser carries only a signed
// ticket (id + HMAC, the same road as passes); prices and availability are
// recomputed at every read, and the all-or-nothing confirmation lives in
// bookings.ts (confirmOrder).

/** At most ten items per cart (D46); enforced here, not by the database. */
export const maxCartItems = 10;

function sign(secret: string, id: string): string {
  return createHmac('sha256', secret).update(`cart:${id}`).digest('base64url');
}

export const cartAccessToken = (secret: string, cartId: string): string => sign(secret, cartId);

/** Constant-time check of a presented cart ticket. */
export function cartTokenIsValid(secret: string, cartId: string, token: string): boolean {
  const expected = Buffer.from(cartAccessToken(secret, cartId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Finds the beach club of a cart from the ticket alone, like payment_request_beach. */
export async function locateCartBeach(db: Database, cartId: string): Promise<string | null> {
  const located = await db.execute<{ beach_id: string | null }>(sql`select cart_beach(${cartId}::uuid) as beach_id`);
  return located.rows[0]?.beach_id ?? null;
}

export interface CreatedCart {
  cartId: string;
  /** False when the signed-in person already had a cart at this beach club. */
  created: boolean;
}

/** Opens a cart, or hands back the account's existing cart for this beach club. */
export function createCart(db: Database, beachId: string, userId: string | null): Promise<CreatedCart> {
  return withBeach(db, beachId, async (tx) => {
    if (userId) {
      const [existing] = await tx.select({ id: cart.id }).from(cart).where(and(eq(cart.userId, userId), eq(cart.beachId, beachId)));
      if (existing) return { cartId: existing.id, created: false };
    }
    const [created] = await tx.insert(cart).values({ beachId, userId }).returning({ id: cart.id });
    if (!created) throw new Error('cart was not created');
    return { cartId: created.id, created: true };
  });
}

async function cartOrRefuse(tx: Transaction, cartId: string): Promise<typeof cart.$inferSelect> {
  const [found] = await tx.select().from(cart).where(eq(cart.id, cartId));
  if (!found) throw new DomainError('not_found', 'Cart not found');
  return found;
}

const touch = (tx: Transaction, cartId: string) => tx.update(cart).set({ updatedAt: sql`now()` }).where(eq(cart.id, cartId));

/** The account that claimed a cart, for the session-owner access of the API. */
export function cartOwnerId(db: Database, beachId: string, cartId: string): Promise<string | null> {
  return withBeach(db, beachId, async (tx) => (await cartOrRefuse(tx, cartId)).userId);
}

export interface CartItemInput {
  spotId: string;
  day: string;
  /** Last day of the period; the single day when left out (D39). */
  to?: string | null;
  guestName?: string | null;
  promoCode?: string | null;
  extras?: ExtraRequest[];
}

/**
 * Adds one item: a spot of THIS beach club over a dal–al period, with its
 * holder, promotion and extras. Nothing is reserved. The same spot and period
 * twice is refused; so is the eleventh item.
 */
export function addItem(db: Database, beachId: string, cartId: string, input: CartItemInput): Promise<{ itemId: string }> {
  return withBeach(db, beachId, async (tx) => {
    await cartOrRefuse(tx, cartId);
    // Row level security scopes spots to the beach club: a foreign spot is unreachable.
    const [place] = await tx.select({ id: spot.id }).from(spot).where(eq(spot.id, input.spotId));
    if (!place) throw new DomainError('cart_mixed_beach', 'This spot does not belong to this beach club');
    const days = periodDays(input.day, input.to ?? input.day);
    const dayTo = days[days.length - 1]!;

    const existing = await tx.select({ id: cartItem.id, spotId: cartItem.spotId, dayFrom: cartItem.dayFrom, dayTo: cartItem.dayTo }).from(cartItem).where(eq(cartItem.cartId, cartId));
    if (existing.length >= maxCartItems) throw new DomainError('cart_full', `A cart holds at most ${maxCartItems} items`);
    if (existing.some((row) => row.spotId === input.spotId && row.dayFrom === input.day && row.dayTo === dayTo)) {
      throw new DomainError('cart_item_duplicate', 'This spot and period is already in the cart');
    }

    // Quantities and services are validated now; prices stay live until the confirmation.
    const extras = input.extras ?? [];
    await priceExtras(tx, extras);
    const [created] = await tx
      .insert(cartItem)
      .values({ cartId, spotId: input.spotId, dayFrom: input.day, dayTo, guestName: input.guestName?.trim() ?? '', promoCode: normalizePromo(input.promoCode) })
      .returning({ id: cartItem.id });
    if (!created) throw new Error('cart item was not created');
    if (extras.length > 0) {
      await tx.insert(cartItemExtra).values(extras.map((entry) => ({ cartItemId: created.id, serviceId: entry.serviceId, quantity: entry.quantity })));
    }
    await touch(tx, cartId);
    return { itemId: created.id };
  });
}

export interface CartItemChange {
  guestName?: string | null;
  promoCode?: string | null;
  extras?: ExtraRequest[];
}

/** Rewrites holder, promotion or the whole extras set of one item. */
export function updateItem(db: Database, beachId: string, cartId: string, itemId: string, change: CartItemChange): Promise<void> {
  return withBeach(db, beachId, async (tx) => {
    const [found] = await tx.select().from(cartItem).where(and(eq(cartItem.id, itemId), eq(cartItem.cartId, cartId)));
    if (!found) throw new DomainError('not_found', 'Cart item not found');
    const fields: Partial<{ guestName: string; promoCode: string | null }> = {};
    if (change.guestName !== undefined) fields.guestName = change.guestName?.trim() ?? '';
    if (change.promoCode !== undefined) fields.promoCode = normalizePromo(change.promoCode);
    if (Object.keys(fields).length > 0) await tx.update(cartItem).set(fields).where(eq(cartItem.id, itemId));
    if (change.extras !== undefined) {
      await priceExtras(tx, change.extras);
      await tx.delete(cartItemExtra).where(eq(cartItemExtra.cartItemId, itemId));
      if (change.extras.length > 0) {
        await tx.insert(cartItemExtra).values(change.extras.map((entry) => ({ cartItemId: itemId, serviceId: entry.serviceId, quantity: entry.quantity })));
      }
    }
    await touch(tx, cartId);
  });
}

export function removeItem(db: Database, beachId: string, cartId: string, itemId: string): Promise<void> {
  return withBeach(db, beachId, async (tx) => {
    const removed = await tx.delete(cartItem).where(and(eq(cartItem.id, itemId), eq(cartItem.cartId, cartId))).returning({ id: cartItem.id });
    if (removed.length === 0) throw new DomainError('not_found', 'Cart item not found');
    await touch(tx, cartId);
  });
}

/**
 * Moves the items of one cart into another: duplicates by spot and period are
 * dropped, the ten-item ceiling holds (oldest first), the source disappears.
 */
async function mergeInto(tx: Transaction, fromCartId: string, intoCartId: string): Promise<void> {
  const kept = await tx.select({ spotId: cartItem.spotId, dayFrom: cartItem.dayFrom, dayTo: cartItem.dayTo }).from(cartItem).where(eq(cartItem.cartId, intoCartId));
  const seen = new Set(kept.map((row) => `${row.spotId}|${row.dayFrom}|${row.dayTo}`));
  let count = kept.length;
  const moving = await tx.select().from(cartItem).where(eq(cartItem.cartId, fromCartId)).orderBy(asc(cartItem.createdAt), asc(cartItem.id));
  for (const item of moving) {
    const key = `${item.spotId}|${item.dayFrom}|${item.dayTo}`;
    if (count >= maxCartItems || seen.has(key)) continue;
    await tx.update(cartItem).set({ cartId: intoCartId }).where(eq(cartItem.id, item.id));
    seen.add(key);
    count += 1;
  }
  // What was not moved dies with the source cart (ON DELETE CASCADE).
  await tx.delete(cart).where(eq(cart.id, fromCartId));
}

/** Moves every item of `fromCartId` into `intoCartId`, both of this beach club, and deletes the source. */
export function mergeCarts(db: Database, beachId: string, fromCartId: string, intoCartId: string): Promise<void> {
  return withBeach(db, beachId, async (tx) => {
    await cartOrRefuse(tx, fromCartId);
    await cartOrRefuse(tx, intoCartId);
    await mergeInto(tx, fromCartId, intoCartId);
    await touch(tx, intoCartId);
  });
}

/**
 * Hands the ticket's cart to the account (D46): the account's previous cart at
 * this beach club, if any, merges into the claimed one, which survives.
 */
export function claimCart(db: Database, beachId: string, cartId: string, userId: string): Promise<{ cartId: string }> {
  return withBeach(db, beachId, async (tx) => {
    const found = await cartOrRefuse(tx, cartId);
    if (found.userId === userId) return { cartId };
    if (found.userId !== null) throw new DomainError('not_found', 'Cart not found');
    const [previous] = await tx.select({ id: cart.id }).from(cart).where(and(eq(cart.userId, userId), eq(cart.beachId, beachId)));
    if (previous) await mergeInto(tx, previous.id, cartId);
    await tx.update(cart).set({ userId, updatedAt: sql`now()` }).where(eq(cart.id, cartId));
    return { cartId };
  });
}

export interface CartItemView {
  itemId: string;
  spotId: string;
  spot: { code: string; zoneName: string | null; rowNumber: number; zone: string; typeName: string; typeMark: string; umbrellas: number; sunbeds: number };
  from: string;
  to: string;
  guestName: string;
  promoCode: string | null;
  /** The chosen quantities, independent of the live catalogue prices. */
  extras: ExtraRequest[];
  /** False when the item can no longer be confirmed as it stands; `reason` says why. */
  ok: boolean;
  reason: string | null;
  /** Live quote over the period, extras per line; null when the item is not ok. */
  quote: PurchaseQuote | null;
}

export interface CartView {
  cartId: string;
  beachId: string;
  userId: string | null;
  items: CartItemView[];
  /** Sum of the quotable items: what «Conferma e paga» would charge today. */
  totalCents: number;
  /** True only when every item can be confirmed as it stands. */
  allAvailable: boolean;
}

/**
 * The full cart: every item with its spot, holder and extras, availability and
 * prices recomputed NOW through the same quote machinery as the purchase (D46).
 * An item that lost a day, its promotion or an extra service is marked, never
 * dropped: the guest removes or changes it.
 */
export function getCart(db: Database, beachId: string, cartId: string): Promise<CartView> {
  return withBeach(db, beachId, async (tx) => {
    const found = await cartOrRefuse(tx, cartId);
    const rows = await tx
      .select({ item: cartItem, spot, typeName: spotType.name, typeMark: spotType.mark, zoneName: beachZone.name })
      .from(cartItem)
      .innerJoin(spot, eq(spot.id, cartItem.spotId))
      .innerJoin(spotType, eq(spotType.id, spot.typeId))
      .leftJoin(beachZone, eq(beachZone.id, spot.namedZoneId))
      .where(eq(cartItem.cartId, cartId))
      .orderBy(asc(cartItem.createdAt), asc(cartItem.id));
    const extrasRows = rows.length > 0
      ? await tx.select().from(cartItemExtra).where(sql`${cartItemExtra.cartItemId} in (select id from cart_item where cart_id = ${cartId})`)
      : [];
    const extrasOf = new Map<string, ExtraRequest[]>();
    for (const row of extrasRows) {
      const list = extrasOf.get(row.cartItemId) ?? [];
      list.push({ serviceId: row.serviceId, quantity: row.quantity });
      extrasOf.set(row.cartItemId, list);
    }

    const items: CartItemView[] = [];
    for (const row of rows) {
      const extras = extrasOf.get(row.item.id) ?? [];
      let quote: PurchaseQuote | null = null;
      let reason: string | null = null;
      try {
        quote = await quoteSpotWithin(tx, { spotId: row.item.spotId, day: row.item.dayFrom, to: row.item.dayTo, promoCode: row.item.promoCode, extras });
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        reason = error.code;
      }
      items.push({
        itemId: row.item.id,
        spotId: row.item.spotId,
        spot: { code: row.spot.code, zoneName: row.zoneName, rowNumber: row.spot.rowNumber, zone: row.spot.zone, typeName: row.typeName, typeMark: row.typeMark, umbrellas: row.spot.umbrellas, sunbeds: row.spot.sunbeds },
        from: row.item.dayFrom,
        to: row.item.dayTo,
        guestName: row.item.guestName,
        promoCode: row.item.promoCode,
        extras,
        ok: quote !== null,
        reason,
        quote,
      });
    }
    return {
      cartId: found.id,
      beachId: found.beachId,
      userId: found.userId,
      items,
      totalCents: items.reduce((sum, item) => sum + (item.quote?.total ?? 0), 0),
      allAvailable: items.length > 0 && items.every((item) => item.ok),
    };
  });
}

export interface MyCartRow {
  cartId: string;
  beachSlug: string;
  beachName: string;
  items: number;
  updatedAt: Date;
}

/** The account's carts across beach clubs, freshest first: «il carrello si ritrova nel conto». */
export function listMyCarts(db: Database, userId: string): Promise<MyCartRow[]> {
  return withUser(db, userId, async (tx) => {
    const rows = await tx
      .select({
        cartId: cart.id,
        beachSlug: beach.slug,
        beachName: beach.name,
        items: sql<number>`(select count(*) from cart_item i where i.cart_id = ${cart.id})::int`,
        updatedAt: cart.updatedAt,
      })
      .from(cart)
      .innerJoin(beach, eq(beach.id, cart.beachId))
      .where(eq(cart.userId, userId))
      .orderBy(desc(cart.updatedAt));
    return rows;
  });
}
