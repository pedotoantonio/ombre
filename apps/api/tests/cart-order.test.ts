import { createHmac, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { acquireHold, applyPaymentOutcome, setSplitRule, startCheckout } from '@ombre/db';
import { createTestDatabase, insertBeach, testAdminUrl, type TestBeach, type TestDatabase } from '@ombre/db/testing';
import { createApp } from '../src/app';

// Il carrello, l'ordine e «Aggiungi servizi» dal conto (D46, D47, spec §3 e §5).

const signingSecret = 'segreto-di-prova-lungo-almeno-32-caratteri';
const sandboxWebhookSecret = 'segreto-del-fornitore-di-prova';
const siteUrl = 'https://ombre.example';
const slug = 'carrello';
const d1 = '2099-07-01';
const d2 = '2099-07-02';
const d3 = '2099-07-03';

describe.skipIf(!testAdminUrl)('cart, order and owner services', () => {
  let database: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let beach: TestBeach;
  let otherSpotId = '';
  let towelId = '';

  beforeAll(async () => {
    database = await createTestDatabase(testAdminUrl!);
    beach = await insertBeach(database.admin, slug, { spots: 14, day: d1 });
    for (const day of [d2, d3]) {
      for (const spotId of beach.spotIds) {
        await database.admin.query("INSERT INTO inventory_day (beach_id, spot_id, day, state, price_cents) VALUES ($1, $2, $3, 'available', 3000)", [beach.beachId, spotId, day]);
      }
    }
    await setSplitRule(database.adminUrl, beach.beachId, { seasonHolder: 5000, beachClub: 4000, platform: 1000 });
    const towel = await database.admin.query<{ id: string }>(
      "INSERT INTO extra_service (beach_id, name_it, name_en, unit_price_cents) VALUES ($1, 'Telo mare', 'Beach towel', 500) RETURNING id",
      [beach.beachId],
    );
    towelId = towel.rows[0]!.id;
    const other = await insertBeach(database.admin, 'altrolido', { spots: 1, day: d1 });
    otherSpotId = other.spotIds[0]!;
    app = createApp({ db: database.app.db, rateLimiter: { hit: () => 0 }, holdSeconds: 600, signingSecret, sandboxWebhookSecret, siteUrl, log: () => undefined });
  });

  afterAll(async () => {
    await database?.drop();
  });

  const db = () => database.app.db;

  async function call(method: string, path: string, payload?: unknown, bearer?: string) {
    const response = await app.request(path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    const text = await response.text();
    return { status: response.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : {} };
  }
  const errorCode = (result: { body: Record<string, unknown> }) => (result.body.error as { code?: string; message?: string } | undefined)?.code;
  const errorMessage = (result: { body: Record<string, unknown> }) => (result.body.error as { message?: string } | undefined)?.message ?? '';

  async function notify(reference: string, outcome: 'succeeded' | 'failed') {
    const raw = JSON.stringify({ eventId: `evt_${randomUUID()}`, reference, outcome });
    const response = await app.request('/v1/payment-webhooks/sandbox', {
      method: 'POST',
      headers: { 'X-Ombre-Signature': createHmac('sha256', sandboxWebhookSecret).update(raw).digest('hex') },
      body: raw,
    });
    return ((await response.json()) as { result?: string }).result;
  }

  /** A stranger books one day of a spot through the ordinary quick path. */
  async function occupy(spotId: string, onDay: string): Promise<void> {
    const held = await acquireHold(db(), beach.beachId, { spotId, day: onDay, idempotencyKey: `blocco-${randomUUID()}`, ttlSeconds: 600 });
    const booked = await startCheckout(db(), beach.beachId, { holdId: held.holdId, guestName: 'Blocco', guestEmail: 'blocco@example.org' }, signingSecret);
    expect(await applyPaymentOutcome(db(), { provider: 'sandbox', eventId: randomUUID(), reference: booked.payment.reference, outcome: 'succeeded' })).toBe('confirmed');
  }

  async function openCart(bearer?: string): Promise<{ cartId: string; accessToken: string; status: number }> {
    const opened = await call('POST', '/v1/carts', { beachSlug: slug }, bearer);
    expect([200, 201]).toContain(opened.status);
    return { ...(opened.body as { cartId: string; accessToken: string }), status: opened.status };
  }

  const stateOf = async (spotId: string, day: string) =>
    (await database.admin.query<{ state: string }>('SELECT state FROM inventory_day WHERE spot_id = $1 AND day = $2', [spotId, day])).rows[0]?.state;
  const orderScopedHolds = async (cartId: string) =>
    (await database.admin.query<{ n: string }>("SELECT count(*) AS n FROM hold WHERE idempotency_key LIKE 'order-' || $1 || '-%'", [cartId])).rows[0]!.n;

  interface CartItemBody {
    itemId: string;
    guestName: string;
    ok: boolean;
    reason: string | null;
    totalCents?: number;
    extrasCents?: number;
    spot: { code: string };
    extras: { serviceId: string; quantity: number }[];
  }
  interface CartBody {
    items: CartItemBody[];
    totalCents: number;
    allAvailable: boolean;
  }

  it('opens a cart, recomputes it at every read and guards its boundaries', async () => {
    const { cartId, accessToken, status } = await openCart();
    expect(status).toBe(201);

    // A made-up bearer is neither the ticket nor a session.
    expect((await call('GET', `/v1/carts/${cartId}`, undefined, 'a'.repeat(43))).status).toBe(401);
    expect((await call('GET', `/v1/carts/${cartId}`)).status).toBe(401);

    const added = await call('POST', `/v1/carts/${cartId}/items`, { spotId: beach.spotIds[0], day: d1, to: d3, guestName: 'Zia Pina', extras: [{ serviceId: towelId, quantity: 2 }] }, accessToken);
    expect(added.status).toBe(201);
    const itemId = String(added.body.itemId);

    const duplicate = await call('POST', `/v1/carts/${cartId}/items`, { spotId: beach.spotIds[0], day: d1, to: d3 }, accessToken);
    expect(duplicate.status).toBe(409);
    expect(errorCode(duplicate)).toBe('cart_item_duplicate');

    const foreign = await call('POST', `/v1/carts/${cartId}/items`, { spotId: otherSpotId, day: d1 }, accessToken);
    expect(foreign.status).toBe(422);
    expect(errorCode(foreign)).toBe('cart_mixed_beach');

    const tooLong = await call('POST', `/v1/carts/${cartId}/items`, { spotId: beach.spotIds[1], day: d1, to: '2099-08-15' }, accessToken);
    expect(tooLong.status).toBe(409);
    expect(errorCode(tooLong)).toBe('cap_reached');

    let view = (await call('GET', `/v1/carts/${cartId}`, undefined, accessToken)).body as unknown as CartBody;
    expect(view.items).toHaveLength(1);
    expect(view.items[0]).toMatchObject({ guestName: 'Zia Pina', ok: true, reason: null, totalCents: 10_000, extrasCents: 1000, spot: { code: 'A01' } });
    expect(view.items[0]!.extras).toEqual([{ serviceId: towelId, quantity: 2 }]);
    expect(view).toMatchObject({ totalCents: 10_000, allAvailable: true });

    // The holder and the extras can be rewritten; the quote follows.
    expect((await call('PUT', `/v1/carts/${cartId}/items/${itemId}`, { guestName: 'Nonna Ada', extras: [] }, accessToken)).status).toBe(204);
    view = (await call('GET', `/v1/carts/${cartId}`, undefined, accessToken)).body as unknown as CartBody;
    expect(view.items[0]).toMatchObject({ guestName: 'Nonna Ada', totalCents: 9000 });

    // The ceiling: ten items, not one more.
    for (let index = 1; index <= 9; index += 1) {
      expect((await call('POST', `/v1/carts/${cartId}/items`, { spotId: beach.spotIds[index], day: d1 }, accessToken)).status).toBe(201);
    }
    const eleventh = await call('POST', `/v1/carts/${cartId}/items`, { spotId: beach.spotIds[10], day: d1 }, accessToken);
    expect(eleventh.status).toBe(409);
    expect(errorCode(eleventh)).toBe('cart_full');

    view = (await call('GET', `/v1/carts/${cartId}`, undefined, accessToken)).body as unknown as CartBody;
    const last = view.items[view.items.length - 1]!;
    expect((await call('DELETE', `/v1/carts/${cartId}/items/${last.itemId}`, undefined, accessToken)).status).toBe(204);
    view = (await call('GET', `/v1/carts/${cartId}`, undefined, accessToken)).body as unknown as CartBody;
    expect(view.items).toHaveLength(9);
  });

  it('marks an item unavailable after someone else takes a day, and refuses the confirmation', async () => {
    const { cartId, accessToken } = await openCart();
    expect((await call('POST', `/v1/carts/${cartId}/items`, { spotId: beach.spotIds[10], day: d1, to: d2 }, accessToken)).status).toBe(201);
    await occupy(beach.spotIds[10]!, d2);

    const view = (await call('GET', `/v1/carts/${cartId}`, undefined, accessToken)).body as unknown as CartBody;
    expect(view.items[0]).toMatchObject({ ok: false, reason: 'inventory_conflict' });
    expect(view).toMatchObject({ totalCents: 0, allAvailable: false });

    const refused = await call('POST', `/v1/carts/${cartId}/confirm`, { guestName: 'Caia Prova', guestEmail: 'caia@example.org' }, accessToken);
    expect(refused.status).toBe(409);
    expect(errorCode(refused)).toBe('order_item_unavailable');
    expect(errorMessage(refused)).toContain('A11');
    // NOTHING was held: the transaction rolled back whole.
    expect(await orderScopedHolds(cartId)).toBe('0');
    expect(await stateOf(beach.spotIds[10]!, d1)).toBe('available');
  });

  let accountToken = '';
  let accountCartId = '';

  async function registerAndSignIn(email: string, name: string): Promise<string> {
    expect((await call('POST', '/v1/account/register', { name, email, locale: 'it' })).status).toBe(201);
    const queued = await database.admin.query<{ payload: { password: string } }>(
      "SELECT payload FROM outbox WHERE kind = 'account.created' AND payload->>'email' = $1",
      [email],
    );
    const generated = queued.rows[0]!.payload.password;
    const signedIn = await call('POST', '/v1/auth/login', { email, password: generated });
    expect(signedIn.status).toBe(200);
    const token = String(signedIn.body.token);
    expect((await call('POST', '/v1/account/password', { current: generated, next: 'parola-lunga-di-prova' }, token)).status).toBe(204);
    return token;
  }

  it('claims the ticket cart into the account, dropping duplicates, and finds it again from the account', async () => {
    accountToken = await registerAndSignIn('cli@example.org', 'Clelia');

    // The account's own cart, with one item.
    const mine = await openCart(accountToken);
    expect(mine.status).toBe(201);
    expect((await call('POST', `/v1/carts/${mine.cartId}/items`, { spotId: beach.spotIds[11], day: d1 }, mine.accessToken)).status).toBe(201);

    // The anonymous ticket cart: one duplicate of the account's item, one new.
    const ticket = await openCart();
    expect((await call('POST', `/v1/carts/${ticket.cartId}/items`, { spotId: beach.spotIds[11], day: d1 }, ticket.accessToken)).status).toBe(201);
    expect((await call('POST', `/v1/carts/${ticket.cartId}/items`, { spotId: beach.spotIds[12], day: d1 }, ticket.accessToken)).status).toBe(201);

    const claimed = await call('POST', `/v1/carts/${ticket.cartId}/claim`, { accessToken: ticket.accessToken }, accountToken);
    expect(claimed.status).toBe(200);
    expect(claimed.body.cartId).toBe(ticket.cartId);
    accountCartId = ticket.cartId;

    // The account cart merged in and disappeared; the duplicate was dropped.
    const carts = (await call('GET', '/v1/account/carts', undefined, accountToken)).body.carts as { cartId: string; beachSlug: string; items: number }[];
    expect(carts).toHaveLength(1);
    expect(carts[0]).toMatchObject({ cartId: accountCartId, beachSlug: slug, items: 2 });

    // Opening a cart while signed in hands the surviving cart back.
    const again = await openCart(accountToken);
    expect(again.status).toBe(200);
    expect(again.cartId).toBe(accountCartId);

    // The owner's session opens the cart without the ticket.
    const view = (await call('GET', `/v1/carts/${accountCartId}`, undefined, accountToken)).body as unknown as CartBody;
    expect(view.items.map((item) => item.spot.code).sort()).toEqual(['A12', 'A13']);
  });

  let orderId = '';
  let orderToken = '';
  let orderCode = '';
  let orderReference = '';

  it('confirms all or nothing, names the offending item, then settles the whole order', async () => {
    const { cartId, accessToken } = await openCart();
    const first = await call('POST', `/v1/carts/${cartId}/items`, { spotId: beach.spotIds[13], day: d1, to: d3, guestName: 'Zio Mario', extras: [{ serviceId: towelId, quantity: 1 }] }, accessToken);
    expect(first.status).toBe(201);
    expect((await call('POST', `/v1/carts/${cartId}/items`, { spotId: beach.spotIds[12], day: d2 }, accessToken)).status).toBe(201);

    // The middle day of the first item goes to someone else: nothing is held.
    await occupy(beach.spotIds[13]!, d2);
    const refused = await call('POST', `/v1/carts/${cartId}/confirm`, { guestName: 'Rina Prova', guestEmail: 'Rina@Example.org' }, accessToken);
    expect(refused.status).toBe(409);
    expect(errorCode(refused)).toBe('order_item_unavailable');
    expect(errorMessage(refused)).toContain('A14');
    expect(errorMessage(refused)).toContain(`${d1}–${d3}`);
    expect(await orderScopedHolds(cartId)).toBe('0');
    expect(await stateOf(beach.spotIds[13]!, d1)).toBe('available');
    expect(await stateOf(beach.spotIds[13]!, d3)).toBe('available');
    expect(await stateOf(beach.spotIds[12]!, d2)).toBe('available');

    // The guest shortens the item and confirms: one group per item, one payment.
    const view = (await call('GET', `/v1/carts/${cartId}`, undefined, accessToken)).body as unknown as CartBody;
    const broken = view.items.find((item) => !item.ok)!;
    expect((await call('DELETE', `/v1/carts/${cartId}/items/${broken.itemId}`, undefined, accessToken)).status).toBe(204);
    expect((await call('POST', `/v1/carts/${cartId}/items`, { spotId: beach.spotIds[13], day: d1, guestName: 'Zio Mario', extras: [{ serviceId: towelId, quantity: 2 }] }, accessToken)).status).toBe(201);

    const confirmed = await call('POST', `/v1/carts/${cartId}/confirm`, { guestName: 'Rina Prova', guestEmail: 'Rina@Example.org' }, accessToken);
    expect(confirmed.status).toBe(201);
    const order = confirmed.body as unknown as {
      orderId: string;
      code: string;
      totalCents: number;
      accessToken: string;
      payment: { provider: string; reference: string; amountCents: number };
      items: { code: string; spotCode: string; from: string; to: string }[];
    };
    orderId = order.orderId;
    orderToken = order.accessToken;
    orderCode = order.code;
    orderReference = order.payment.reference;
    expect(order.code).toMatch(/^ORD-\d{6}-001$/);
    expect(order.totalCents).toBe(7000);
    expect(order.payment).toMatchObject({ provider: 'sandbox', amountCents: 7000 });
    expect(order.items).toHaveLength(2);
    expect(new Set(order.items.map((item) => item.code)).size).toBe(2);
    for (const item of order.items) expect(item.code).toMatch(/^OM-\d{6}-\d{3}$/);

    // The cart is gone; the single payment names the order and nothing else.
    expect((await call('GET', `/v1/carts/${cartId}`, undefined, accessToken)).status).toBe(404);
    const payments = await database.admin.query<{ order_id: string | null; group_id: string | null; booking_id: string | null; purpose: string }>(
      'SELECT order_id, group_id, booking_id, purpose FROM payment WHERE provider_ref = $1',
      [orderReference],
    );
    expect(payments.rows).toEqual([{ order_id: orderId, group_id: null, booking_id: null, purpose: 'checkout' }]);
    // The orderer's email, lowered, rides every group; one shared expiry holds them all.
    const groups = await database.admin.query<{ n: string }>('SELECT count(DISTINCT g.id) AS n FROM booking_group g WHERE g.order_id = $1', [orderId]);
    expect(groups.rows[0]!.n).toBe('2');
    const emails = await database.admin.query<{ guest_email: string }>(
      'SELECT DISTINCT b.guest_email FROM booking b JOIN booking_group g ON g.id = b.group_id WHERE g.order_id = $1',
      [orderId],
    );
    expect(emails.rows).toEqual([{ guest_email: 'rina@example.org' }]);
    const expiries = await database.admin.query<{ n: string }>(
      'SELECT count(DISTINCT h.expires_at) AS n FROM hold h JOIN booking b ON b.hold_id = h.id JOIN booking_group g ON g.id = b.group_id WHERE g.order_id = $1',
      [orderId],
    );
    expect(expiries.rows[0]!.n).toBe('1');

    // The summary answers the right token only, like the booking page.
    expect((await call('GET', `/v1/beaches/${slug}/orders/${orderId}`)).status).toBe(401);
    expect((await call('GET', `/v1/beaches/${slug}/orders/${orderId}`, undefined, 'b'.repeat(43))).status).toBe(404);
    interface OrderBody {
      code: string;
      paymentState: string;
      paidCents: number;
      items: { code: string; status: string; passCredential: string | null; guestName: string; totalCents: number }[];
    }
    let summary = (await call('GET', `/v1/beaches/${slug}/orders/${orderId}`, undefined, orderToken)).body as unknown as OrderBody;
    expect(summary).toMatchObject({ code: orderCode, paymentState: 'to_collect', paidCents: 0 });
    expect(summary.items.every((item) => item.status === 'under_review' && item.passCredential === null)).toBe(true);

    // The payment succeeds: every group confirms, each with its own pass.
    expect(await notify(orderReference, 'succeeded')).toBe('confirmed');
    summary = (await call('GET', `/v1/beaches/${slug}/orders/${orderId}`, undefined, orderToken)).body as unknown as OrderBody;
    expect(summary).toMatchObject({ paymentState: 'paid', paidCents: 7000 });
    expect(summary.items.map((item) => item.guestName).sort()).toEqual(['Rina Prova', 'Zio Mario']);
    for (const item of summary.items) {
      expect(item.status).toBe('confirmed');
      expect(item.passCredential).toMatch(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{32}$/);
    }
    expect(await stateOf(beach.spotIds[13]!, d1)).toBe('occupied');
    expect(await stateOf(beach.spotIds[12]!, d2)).toBe('occupied');

    // One pass, one confirmation mail and the full sale per group, extras included.
    const passes = await database.admin.query<{ n: string }>('SELECT count(*) AS n FROM pass p JOIN booking_group g ON g.id = p.group_id WHERE g.order_id = $1', [orderId]);
    expect(passes.rows[0]!.n).toBe('2');
    const confirmations = await database.admin.query<{ n: string }>(
      "SELECT count(*) AS n FROM outbox o WHERE o.kind = 'booking.confirmed' AND o.payload->>'bookingId' IN (SELECT b.id::text FROM booking b JOIN booking_group g ON g.id = b.group_id WHERE g.order_id = $1)",
      [orderId],
    );
    expect(confirmations.rows[0]!.n).toBe('2');
    const sales = await database.admin.query<{ amount_cents: number }>(
      "SELECT e.amount_cents FROM ledger_entry e JOIN booking b ON b.id = e.booking_id JOIN booking_group g ON g.id = b.group_id WHERE g.order_id = $1 AND e.kind = 'payment_received' ORDER BY e.amount_cents",
      [orderId],
    );
    expect(sales.rows.map((row) => Number(row.amount_cents))).toEqual([3000, 4000]);
    const extras = await database.admin.query<{ amount_cents: number }>(
      "SELECT e.amount_cents FROM ledger_entry e JOIN booking b ON b.id = e.booking_id JOIN booking_group g ON g.id = b.group_id WHERE g.order_id = $1 AND e.kind = 'extras_revenue'",
      [orderId],
    );
    expect(extras.rows.map((row) => Number(row.amount_cents))).toEqual([1000]);
  });

  it('cancels every group of the order when the payment fails', async () => {
    const { cartId, accessToken } = await openCart();
    expect((await call('POST', `/v1/carts/${cartId}/items`, { spotId: beach.spotIds[11], day: d2 }, accessToken)).status).toBe(201);
    expect((await call('POST', `/v1/carts/${cartId}/items`, { spotId: beach.spotIds[12], day: d3 }, accessToken)).status).toBe(201);
    const confirmed = await call('POST', `/v1/carts/${cartId}/confirm`, { guestName: 'Lea Prova', guestEmail: 'lea@example.org' }, accessToken);
    expect(confirmed.status).toBe(201);
    const order = confirmed.body as unknown as { orderId: string; payment: { reference: string } };

    expect(await notify(order.payment.reference, 'failed')).toBe('cancelled');
    const statuses = await database.admin.query<{ status: string }>(
      'SELECT DISTINCT b.status::text AS status FROM booking b JOIN booking_group g ON g.id = b.group_id WHERE g.order_id = $1',
      [order.orderId],
    );
    expect(statuses.rows).toEqual([{ status: 'cancelled' }]);
    expect(await stateOf(beach.spotIds[11]!, d2)).toBe('available');
    expect(await stateOf(beach.spotIds[12]!, d3)).toBe('available');
    const cancellations = await database.admin.query<{ n: string }>(
      "SELECT count(*) AS n FROM outbox o WHERE o.kind = 'booking.cancelled' AND o.payload->>'bookingId' IN (SELECT b.id::text FROM booking b JOIN booking_group g ON g.id = b.group_id WHERE g.order_id = $1)",
      [order.orderId],
    );
    expect(cancellations.rows[0]!.n).toBe('2');
  });

  it('cancels the whole order and records the refund when a day is lost before the webhook', async () => {
    const { cartId, accessToken } = await openCart();
    expect((await call('POST', `/v1/carts/${cartId}/items`, { spotId: beach.spotIds[11], day: d3 }, accessToken)).status).toBe(201);
    expect((await call('POST', `/v1/carts/${cartId}/items`, { spotId: beach.spotIds[12], day: d3 }, accessToken)).status).toBe(201);
    const confirmed = await call('POST', `/v1/carts/${cartId}/confirm`, { guestName: 'Ugo Prova', guestEmail: 'ugo-ordine@example.org' }, accessToken);
    expect(confirmed.status).toBe(201);
    const order = confirmed.body as unknown as { orderId: string; payment: { reference: string } };

    // One day's reserve runs out and a stranger holds it while the payment is in flight.
    await database.admin.query(
      "UPDATE hold SET expires_at = now() - interval '1 minute' WHERE id = (SELECT active_hold_id FROM inventory_day WHERE spot_id = $1 AND day = $2)",
      [beach.spotIds[12], d3],
    );
    await acquireHold(db(), beach.beachId, { spotId: beach.spotIds[12]!, day: d3, idempotencyKey: `blocco-${randomUUID()}`, ttlSeconds: 600 });

    expect(await notify(order.payment.reference, 'succeeded')).toBe('refund_due');
    const statuses = await database.admin.query<{ status: string }>(
      'SELECT DISTINCT b.status::text AS status FROM booking b JOIN booking_group g ON g.id = b.group_id WHERE g.order_id = $1',
      [order.orderId],
    );
    expect(statuses.rows).toEqual([{ status: 'cancelled' }]);
    expect(await stateOf(beach.spotIds[11]!, d3)).toBe('available');
    const refunds = await database.admin.query<{ amount_cents: number; reason: string }>(
      'SELECT r.amount_cents, r.reason FROM refund r JOIN payment p ON p.id = r.payment_id WHERE p.order_id = $1',
      [order.orderId],
    );
    expect(refunds.rows).toEqual([{ amount_cents: 6000, reason: 'inventory_unavailable' }]);
    const owed = await database.admin.query<{ n: string }>(
      "SELECT count(*) AS n FROM outbox o WHERE o.kind = 'refund.due' AND o.payload->>'bookingId' IN (SELECT b.id::text FROM booking b JOIN booking_group g ON g.id = b.group_id WHERE g.order_id = $1)",
      [order.orderId],
    );
    expect(owed.rows[0]!.n).toBe('1');
  });

  interface MyBooking {
    groupId: string;
    code: string;
    status: string;
    totalCents: number;
    paidCents: number;
    paymentState: string;
    spotCode: string;
  }
  const myBookings = async () => (await call('GET', '/v1/account/bookings', undefined, accountToken)).body as unknown as { upcoming: MyBooking[]; past: MyBooking[] };

  it("confirms the account's cart from the session and lands the order in the history, fully paid", async () => {
    const confirmed = await call('POST', `/v1/carts/${accountCartId}/confirm`, { guestName: 'Clelia Conti', guestEmail: 'cli@example.org' }, accountToken);
    expect(confirmed.status).toBe(201);
    const order = confirmed.body as unknown as { orderId: string; payment: { reference: string } };
    expect(await notify(order.payment.reference, 'succeeded')).toBe('confirmed');

    // The order and its groups belong to the account at once (D47).
    const owner = await database.admin.query<{ user_id: string | null }>('SELECT user_id FROM order_group WHERE id = $1', [order.orderId]);
    expect(owner.rows[0]!.user_id).not.toBeNull();
    const groupOwners = await database.admin.query<{ n: string }>('SELECT count(*) AS n FROM booking_group WHERE order_id = $1 AND user_id = $2', [order.orderId, owner.rows[0]!.user_id]);
    expect(groupOwners.rows[0]!.n).toBe('2');

    // The cart disappeared from the account; the stays are paid in full, the
    // order payment counted through each group's frozen quota.
    expect((await call('GET', '/v1/account/carts', undefined, accountToken)).body.carts).toEqual([]);
    const mine = await myBookings();
    const fromOrder = mine.upcoming.filter((group) => ['A12', 'A13'].includes(group.spotCode));
    expect(fromOrder).toHaveLength(2);
    for (const group of fromOrder) {
      expect(group).toMatchObject({ status: 'confirmed', totalCents: 3000, paidCents: 3000, paymentState: 'paid' });
      expect(group.groupId).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  it('lets the owner add services to an own stay, payable at /paga; strangers and matured stays are refused', async () => {
    const mine = await myBookings();
    const target = mine.upcoming.find((group) => group.spotCode === 'A12')!;
    const matured = mine.upcoming.find((group) => group.spotCode === 'A13')!;

    const added = await call('POST', `/v1/account/bookings/${target.groupId}/extras`, { extras: [{ serviceId: towelId, quantity: 3 }] }, accountToken);
    expect(added.status).toBe(201);
    const outcome = added.body as unknown as {
      addedCents: number;
      totalCents: number;
      remainingCents: number;
      paymentState: string;
      paymentRequest: { requestId: string; amountCents: number; payUrl: string } | null;
    };
    expect(outcome).toMatchObject({ addedCents: 1500, totalCents: 4500, remainingCents: 1500, paymentState: 'partial' });
    expect(outcome.paymentRequest).toMatchObject({ amountCents: 1500 });

    // The request is payable at /paga with the sandbox provider, whoever pays.
    const token = outcome.paymentRequest!.payUrl.split('/').pop()!;
    expect((await call('GET', `/v1/pay-requests/${token}`)).status).toBe(200);
    const opened = await call('POST', `/v1/pay-requests/${token}/payments`);
    expect(opened.status).toBe(201);
    const reference = (opened.body.payment as { reference: string }).reference;
    expect(await notify(reference, 'succeeded')).toBe('collected');
    const after = await myBookings();
    expect(after.upcoming.find((group) => group.groupId === target.groupId)).toMatchObject({ totalCents: 4500, paidCents: 4500, paymentState: 'paid' });

    // A stranger reads «not found», whatever they guess.
    const stranger = await registerAndSignIn('ugo@example.org', 'Ugo');
    const refused = await call('POST', `/v1/account/bookings/${target.groupId}/extras`, { extras: [{ serviceId: towelId, quantity: 1 }] }, stranger);
    expect(refused.status).toBe(404);

    // A stay whose last day is over takes no more services.
    await database.admin.query("UPDATE inventory_day SET day = ((now() AT TIME ZONE 'Europe/Rome')::date - 1) WHERE id = (SELECT b.inventory_day_id FROM booking b WHERE b.group_id = $1)", [matured.groupId]);
    const over = await call('POST', `/v1/account/bookings/${matured.groupId}/extras`, { extras: [{ serviceId: towelId, quantity: 1 }] }, accountToken);
    expect(over.status).toBe(409);
  });
});
