import { createHmac, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setSplitRule, upsertUser } from '@ombre/db';
import { createTestDatabase, insertBeach, testAdminUrl, type TestBeach, type TestDatabase } from '@ombre/db/testing';
import { createApp } from '../src/app';

// B3: pagamenti multipli, incasso rinviato, acconti e comunicazioni
// (spec §4.3, decisione D31, criteri di accettazione 6 e 7).

const password = 'password-di-prova-123';
const signingSecret = 'segreto-di-prova-lungo-almeno-32-caratteri';
const sandboxWebhookSecret = 'segreto-del-fornitore-di-prova';
const siteUrl = 'https://ombre.example';
const slug = 'acconti';
let day = '';

describe.skipIf(!testAdminUrl)('multiple payments, deferred collection and payment requests', () => {
  let database: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let beach: TestBeach;
  const tokens: Record<string, string> = {};
  let towelId = '';
  let nextSpot = 0;

  beforeAll(async () => {
    database = await createTestDatabase(testAdminUrl!);
    const dates = await database.admin.query<{ today: string }>("SELECT (now() AT TIME ZONE 'Europe/Rome')::date::text AS today");
    day = dates.rows[0]!.today;
    beach = await insertBeach(database.admin, slug, { spots: 14, day });
    await setSplitRule(database.adminUrl, beach.beachId, { seasonHolder: 5000, beachClub: 4000, platform: 1000 });
    const towel = await database.admin.query<{ id: string }>(
      "INSERT INTO extra_service (beach_id, name_it, name_en, unit_price_cents) VALUES ($1, 'Telo mare', 'Beach towel', 500) RETURNING id",
      [beach.beachId],
    );
    towelId = towel.rows[0]!.id;
    for (const role of ['manager', 'reception', 'accounting'] as const) {
      await upsertUser(database.adminUrl, { email: `${role}@acconti.example`, name: role, password }, [{ beachId: beach.beachId, role }]);
    }
    app = createApp({ db: database.app.db, rateLimiter: { hit: () => 0 }, holdSeconds: 600, signingSecret, sandboxWebhookSecret, siteUrl, log: () => undefined });
    for (const role of ['manager', 'reception', 'accounting']) {
      tokens[role] = ((await call('POST', '/v1/auth/login', { email: `${role}@acconti.example`, password })).body as { token: string }).token;
    }
  });

  afterAll(async () => {
    await database?.drop();
  });

  async function call(method: string, path: string, payload?: unknown, as?: string, headers: Record<string, string> = {}) {
    const response = await app.request(path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(as ? { Authorization: `Bearer ${tokens[as]}` } : {}), ...headers },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    const text = await response.text();
    return { status: response.status, body: text ? (JSON.parse(text) as unknown) : null };
  }
  const manage = `/v1/manage/beaches/${slug}`;
  const errorCode = (result: { body: unknown }) => (result.body as { error?: { code?: string } }).error?.code;

  async function notify(reference: string, outcome: 'succeeded' | 'failed') {
    const raw = JSON.stringify({ eventId: `evt_${randomUUID()}`, reference, outcome });
    const response = await app.request('/v1/payment-webhooks/sandbox', {
      method: 'POST',
      headers: { 'X-Ombre-Signature': createHmac('sha256', sandboxWebhookSecret).update(raw).digest('hex') },
      body: raw,
    });
    return { status: response.status, result: ((await response.json()) as { result?: string }).result };
  }

  interface DeskInput {
    guestEmail?: string | null;
    guestPhone?: string | null;
    collect?: 'now' | 'later';
    extras?: { serviceId: string; quantity: number }[];
  }
  async function desk(input: DeskInput = {}, as = 'reception'): Promise<string> {
    const spotId = beach.spotIds[nextSpot++]!;
    const response = await call('POST', `${manage}/desk-bookings`, { spotId, day, guestName: 'Rino Prova', ...input }, as);
    expect(response.status).toBe(201);
    return (response.body as { code: string }).code;
  }

  interface Row {
    code: string;
    status: string;
    paymentState: string;
    paidCents: number;
    remainingCents: number;
    totalCents: number;
  }
  async function rowOf(code: string): Promise<Row> {
    const listed = await call('GET', `${manage}/bookings?day=${day}`, undefined, 'manager');
    const found = (listed.body as { bookings: Row[] }).bookings.find((entry) => entry.code === code);
    expect(found).toBeDefined();
    return found!;
  }

  interface CreatedRequest {
    request: { requestId: string; amountCents: number; status: string; expiresAt: string; note: string | null };
    payUrl: string;
    message: string;
    notified: boolean;
  }
  const createRequest = (code: string, amountCents: number, extra: Record<string, unknown> = {}, as = 'reception') =>
    call('POST', `${manage}/bookings/${code}/payment-requests`, { amountCents, ...extra }, as);
  const tokenOf = (created: CreatedRequest) => created.payUrl.split('/').pop()!;
  async function openPayment(token: string): Promise<string> {
    const started = await call('POST', `/v1/pay-requests/${token}/payments`);
    expect(started.status).toBe(201);
    return (started.body as { payment: { reference: string } }).payment.reference;
  }

  const admin = <T extends Record<string, unknown>>(text: string, values: unknown[] = []) => database.admin.query<T>(text, values);

  it('confirms a desk booking «da incassare»: pass issued, no payment row, residual equals the total', async () => {
    const code = await desk({ collect: 'later', guestPhone: '+39 333 1234567' });
    const row = await rowOf(code);
    expect(row).toMatchObject({ status: 'confirmed', paymentState: 'to_collect', paidCents: 0, remainingCents: 3000, totalCents: 3000 });
    // The day list stays free of guest contacts; the phone is stored on the booking.
    expect(JSON.stringify(row)).not.toContain('1234567');
    const phone = await admin<{ guest_phone: string }>('SELECT guest_phone FROM booking WHERE code = $1', [code]);
    expect(phone.rows[0]).toEqual({ guest_phone: '+39 333 1234567' });

    const booked = await admin<{ id: string; status: string }>('SELECT id, status FROM booking WHERE code = $1', [code]);
    const bookingId = booked.rows[0]!.id as string;
    const pass = await admin("SELECT 1 FROM pass WHERE booking_id = $1 AND revoked = 'false'", [bookingId]);
    expect(pass.rowCount).toBe(1);
    const payments = await admin('SELECT 1 FROM payment WHERE booking_id = $1', [bookingId]);
    expect(payments.rowCount).toBe(0);
    // The sale is recorded at confirmation, exactly as a paid one (maturazione invariata).
    const sale = await admin<{ amount_cents: number }>("SELECT amount_cents FROM ledger_entry WHERE booking_id = $1 AND kind = 'payment_received'", [bookingId]);
    expect(sale.rows.map((entry) => Number(entry.amount_cents))).toEqual([3000]);

    // The whole balance collected at the desk: a desk payment, state «saldata».
    const collected = await call('POST', `${manage}/bookings/${code}/collect`, { amountCents: 3000 }, 'reception');
    expect(collected.status).toBe(200);
    expect(collected.body).toMatchObject({ paidCents: 3000, remainingCents: 0, paymentState: 'paid' });
    const kinds = await admin<{ purpose: string; status: string }>('SELECT purpose, status FROM payment WHERE booking_id = $1', [bookingId]);
    expect(kinds.rows).toEqual([{ purpose: 'desk', status: 'succeeded' }]);
    expect(errorCode(await call('POST', `${manage}/bookings/${code}/collect`, { amountCents: 1 }, 'reception'))).toBe('invalid_state');
  });

  it('walks a booking from «da incassare» to «parziale» to «saldata» through payment requests, queueing the message', async () => {
    const code = await desk({ collect: 'later', guestEmail: 'rino@example.org' });

    const first = await createRequest(code, 1000, { note: 'Acconto' });
    expect(first.status).toBe(201);
    const created = first.body as CreatedRequest;
    expect(created.notified).toBe(true);
    expect(created.payUrl.startsWith(`${siteUrl}/paga/`)).toBe(true);
    expect(created.message).toContain(created.payUrl);
    expect(created.message).toContain('10,00');

    // With an email, the notification is queued with the full text and the link.
    const queued = await admin<{ status: string; provider: string; recipient: string; body: string }>(
      "SELECT status, provider, recipient, body FROM notification WHERE template = 'payment_request' AND recipient = 'rino@example.org'",
    );
    expect(queued.rows).toHaveLength(1);
    expect(queued.rows[0]).toMatchObject({ status: 'queued', provider: 'none' });
    expect(queued.rows[0]!.body).toContain(created.payUrl);

    // The «Comunicazioni» page lists it, body included; accounting has no access.
    const comms = await call('GET', `${manage}/notifications`, undefined, 'reception');
    expect(comms.status).toBe(200);
    const rows = (comms.body as { notifications: { template: string; status: string; body: string | null; bookingCode: string | null }[] }).notifications;
    expect(rows.some((entry) => entry.template === 'payment_request' && entry.status === 'queued' && entry.bookingCode === code && entry.body?.includes('/paga/'))).toBe(true);
    expect((await call('GET', `${manage}/notifications`, undefined, 'accounting')).status).toBe(403);

    // The public page shows the essential summary and nothing managerial.
    const token = tokenOf(created);
    const shown = await call('GET', `/v1/pay-requests/${token}`);
    expect(shown.status).toBe(200);
    expect(shown.body).toMatchObject({ status: 'pending', day, from: day, to: day, amountCents: 1000, beach: { slug, name: `Bagno ${slug}` } });
    // `from` and `to` carry the dal–al period of the group (D38): still nothing personal.
    expect(Object.keys(shown.body as object).sort()).toEqual(['amountCents', 'beach', 'currency', 'day', 'expiresAt', 'from', 'spotCode', 'status', 'to']);

    // Paid with the test provider: the webhook collects, the residual falls.
    expect((await notify(await openPayment(token), 'succeeded')).result).toBe('collected');
    expect(await rowOf(code)).toMatchObject({ paymentState: 'partial', paidCents: 1000, remainingCents: 2000 });

    // A second request for more than the residual is refused at creation.
    expect(errorCode(await createRequest(code, 2500))).toBe('invalid_state');

    // The balance with a second request: the state becomes «saldata».
    const second = (await createRequest(code, 2000)).body as CreatedRequest;
    expect((await notify(await openPayment(tokenOf(second)), 'succeeded')).result).toBe('collected');
    expect(await rowOf(code)).toMatchObject({ paymentState: 'paid', paidCents: 3000, remainingCents: 0 });

    // The paid link now answers the same neutral refusal as any unusable token.
    expect(errorCode(await call('GET', `/v1/pay-requests/${token}`))).toBe('request_unavailable');
  });

  it('never collects more than the residual: the late second of two pending requests is refunded in full', async () => {
    const code = await desk({ collect: 'later' });
    const first = (await createRequest(code, 2000)).body as CreatedRequest;
    const second = (await createRequest(code, 2000)).body as CreatedRequest;
    const firstRef = await openPayment(tokenOf(first));
    const secondRef = await openPayment(tokenOf(second));

    expect((await notify(firstRef, 'succeeded')).result).toBe('collected');
    // The second outcome arrives when the residual (1000) is below its amount: no
    // collection, the whole payment is recorded as a refund to execute.
    expect((await notify(secondRef, 'succeeded')).result).toBe('refund_due');
    expect(await rowOf(code)).toMatchObject({ paymentState: 'partial', paidCents: 2000, remainingCents: 1000 });

    const refund = await admin<{ amount_cents: number; reason: string }>(
      'SELECT r.amount_cents, r.reason FROM refund r JOIN payment p ON p.id = r.payment_id JOIN booking b ON b.id = p.booking_id WHERE b.code = $1',
      [code],
    );
    expect(refund.rows).toEqual([{ amount_cents: 2000, reason: 'over_collection' }]);
    const closed = await admin<{ status: string }>('SELECT status FROM payment_request WHERE id = $1', [second.request.requestId]);
    expect(closed.rows[0]).toEqual({ status: 'cancelled' });
  });

  it('refunds and never collects an outcome that arrives after the booking was cancelled', async () => {
    const code = await desk({ collect: 'later' });
    const request = (await createRequest(code, 1500)).body as CreatedRequest;
    const reference = await openPayment(tokenOf(request));

    const cancelled = await call('POST', `${manage}/bookings/${code}/cancel`, { reason: 'maltempo' }, 'manager');
    expect(cancelled.status).toBe(204);
    // Cancelling closed the pending request: its link answers the neutral refusal.
    expect(errorCode(await call('GET', `/v1/pay-requests/${tokenOf(request)}`))).toBe('request_unavailable');

    expect((await notify(reference, 'succeeded')).result).toBe('refund_due');
    const refund = await admin<{ amount_cents: number; reason: string }>(
      'SELECT r.amount_cents, r.reason FROM refund r JOIN payment p ON p.id = r.payment_id JOIN booking b ON b.id = p.booking_id WHERE b.code = $1',
      [code],
    );
    expect(refund.rows).toEqual([{ amount_cents: 1500, reason: 'booking_cancelled' }]);
    // Nothing had been collected, so the cancellation itself refunded nothing.
    const reversal = await admin<{ amount_cents: number }>(
      "SELECT amount_cents FROM ledger_entry e JOIN booking b ON b.id = e.booking_id WHERE b.code = $1 AND e.kind = 'refund_due' ORDER BY e.amount_cents",
      [code],
    );
    // One pair from the late outcome: −1500 (refund due) besides +1500 (inflow recorded apart).
    expect(reversal.rows.map((entry) => Number(entry.amount_cents))).toEqual([-1500]);
  });

  it('truncates the expiry to the end of the booked day and treats expired, cancelled and invalid tokens alike', async () => {
    const code = await desk({ collect: 'later' });
    const created = (await createRequest(code, 1000, { expiresInHours: 240 })).body as CreatedRequest;
    const cap = await admin<{ cap: string; fits: boolean }>("SELECT ((($1::date) + 1)::timestamp AT TIME ZONE 'Europe/Rome') AS cap, $2::timestamptz <= ((($1::date) + 1)::timestamp AT TIME ZONE 'Europe/Rome') AS fits", [day, created.request.expiresAt]);
    expect(cap.rows[0]!.fits).toBe(true);

    // The neutral refusal is byte-identical for every unusable token.
    const invalid = await call('GET', `/v1/pay-requests/${randomUUID()}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`);
    expect(invalid.status).toBe(404);
    expect(errorCode(invalid)).toBe('request_unavailable');

    // Expired: a pending request past its deadline flips lazily and answers the same.
    await admin("UPDATE payment_request SET expires_at = now() - interval '1 hour' WHERE id = $1", [created.request.requestId]);
    const expired = await call('GET', `/v1/pay-requests/${tokenOf(created)}`);
    expect({ status: expired.status, body: expired.body }).toEqual({ status: invalid.status, body: invalid.body });
    const flipped = await admin<{ status: string }>('SELECT status FROM payment_request WHERE id = $1', [created.request.requestId]);
    expect(flipped.rows[0]).toEqual({ status: 'expired' });

    // Cancelled: same answer again; the management list tells the states apart.
    const again = (await createRequest(code, 1000)).body as CreatedRequest;
    expect((await call('POST', `${manage}/payment-requests/${again.request.requestId}/cancel`, undefined, 'reception')).status).toBe(204);
    const cancelled = await call('GET', `/v1/pay-requests/${tokenOf(again)}`);
    expect({ status: cancelled.status, body: cancelled.body }).toEqual({ status: invalid.status, body: invalid.body });
    expect((await call('POST', `/v1/pay-requests/${tokenOf(again)}/payments`)).status).toBe(404);

    const listed = await call('GET', `${manage}/bookings/${code}/payment-requests`, undefined, 'reception');
    expect(listed.status).toBe(200);
    const detail = listed.body as { booking: { paymentState: string; remainingCents: number }; requests: { status: string; message: string; payUrl: string }[] };
    expect(detail.booking).toMatchObject({ paymentState: 'to_collect', remainingCents: 3000 });
    expect(detail.requests.map((entry) => entry.status).sort()).toEqual(['cancelled', 'expired']);
    // Without an email nothing was queued, but the text to copy stays readable here.
    expect(detail.requests[0]!.message).toContain(detail.requests[0]!.payUrl);
    const queued = await admin<{ n: string }>("SELECT count(*) AS n FROM notification WHERE booking_id IN (SELECT id FROM booking WHERE code = $1)", [code]);
    expect(Number(queued.rows[0]!.n)).toBe(0);
  });

  it('keeps the online checkout exactly as before: one payment with purpose checkout', async () => {
    const spotId = beach.spotIds[nextSpot++]!;
    const held = await call('POST', '/v1/holds', { beachSlug: slug, spotId, day }, undefined, { 'Idempotency-Key': `test-${randomUUID()}` });
    expect(held.status).toBe(201);
    const booked = await call('POST', '/v1/checkouts', { beachSlug: slug, holdId: (held.body as { holdId: string }).holdId, guestName: 'Ada Prova', guestEmail: 'ada@example.org' });
    expect(booked.status).toBe(201);
    const checkout = booked.body as { bookingId: string; accessToken: string; payment: { reference: string } };
    expect((await notify(checkout.payment.reference, 'succeeded')).result).toBe('confirmed');

    const payments = await admin<{ purpose: string; status: string; amount_cents: number }>('SELECT purpose, status, amount_cents FROM payment WHERE booking_id = $1', [checkout.bookingId]);
    expect(payments.rows).toEqual([{ purpose: 'checkout', status: 'succeeded', amount_cents: 3000 }]);

    const view = await call('GET', `/v1/beaches/${slug}/bookings/${checkout.bookingId}`, undefined, undefined, { Authorization: `Bearer ${checkout.accessToken}` });
    expect(view.status).toBe(200);
    expect(view.body).toMatchObject({ status: 'confirmed', paymentStatus: 'succeeded', paymentProvider: 'sandbox', paidCents: 3000, remainingCents: 0, paymentState: 'paid' });
  });

  it('adds extras to a sale already made: snapshot, ledger movement and collection now or in the balance', async () => {
    const code = await desk({ collect: 'now' });
    expect(await rowOf(code)).toMatchObject({ paymentState: 'paid', paidCents: 3000 });

    // Collected at the desk at once: the total and the paid amount grow together.
    const atDesk = await call('POST', `${manage}/bookings/${code}/extras`, { extras: [{ serviceId: towelId, quantity: 2 }], collect: 'desk' }, 'reception');
    expect(atDesk.status).toBe(200);
    expect(atDesk.body).toMatchObject({ addedCents: 1000, totalCents: 4000, paidCents: 4000, remainingCents: 0, paymentState: 'paid' });

    // Left in the balance: the state falls back to «parziale» until collected.
    const inBalance = await call('POST', `${manage}/bookings/${code}/extras`, { extras: [{ serviceId: towelId, quantity: 1 }], collect: 'later' }, 'reception');
    expect(inBalance.status).toBe(200);
    expect(inBalance.body).toMatchObject({ addedCents: 500, totalCents: 4500, paidCents: 4000, remainingCents: 500, paymentState: 'partial' });

    const movements = await admin<{ kind: string; amount_cents: number }>(
      "SELECT e.kind, e.amount_cents FROM ledger_entry e JOIN booking b ON b.id = e.booking_id WHERE b.code = $1 AND e.kind = 'extras_revenue' ORDER BY e.amount_cents",
      [code],
    );
    expect(movements.rows.map((entry) => Number(entry.amount_cents))).toEqual([500, 1000]);
    const total = await admin<{ total_cents: number; extras_cents: number }>('SELECT total_cents, extras_cents FROM booking WHERE code = $1', [code]);
    expect(total.rows[0]).toEqual({ total_cents: 4500, extras_cents: 1500 });
  });

  it('refunds the sum of what was really paid when the beach club cancels, deposit included', async () => {
    const code = await desk({ collect: 'later' });
    expect((await call('POST', `${manage}/bookings/${code}/collect`, { amountCents: 1000 }, 'reception')).status).toBe(200);
    const request = (await createRequest(code, 500)).body as CreatedRequest;
    expect((await notify(await openPayment(tokenOf(request)), 'succeeded')).result).toBe('collected');
    expect(await rowOf(code)).toMatchObject({ paidCents: 1500, remainingCents: 1500, paymentState: 'partial' });

    expect((await call('POST', `${manage}/bookings/${code}/cancel`, { reason: 'chiusura' }, 'manager')).status).toBe(204);
    const refunds = await admin<{ amount_cents: number }>(
      'SELECT r.amount_cents FROM refund r JOIN payment p ON p.id = r.payment_id JOIN booking b ON b.id = p.booking_id WHERE b.code = $1 ORDER BY r.amount_cents',
      [code],
    );
    expect(refunds.rows.map((entry) => Number(entry.amount_cents))).toEqual([500, 1000]);
    const due = await admin<{ amount_cents: number }>(
      "SELECT e.amount_cents FROM ledger_entry e JOIN booking b ON b.id = e.booking_id WHERE b.code = $1 AND e.kind = 'refund_due'",
      [code],
    );
    expect(due.rows.map((entry) => Number(entry.amount_cents))).toEqual([-1500]);
  });

  it('shows the derived payment state in the statistics, on the residual of the sold bookings', async () => {
    const report = await call('GET', `${manage}/reports/statistics?from=${day}&to=${day}`, undefined, 'manager');
    expect(report.status).toBe(200);
    const { byPaymentStatus } = report.body as { byPaymentStatus: { status: string; bookings: number }[] };
    const states = new Map(byPaymentStatus.map((entry) => [entry.status, entry.bookings]));
    for (const status of states.keys()) expect(['paid', 'partial', 'to_collect']).toContain(status);
    expect((states.get('paid') ?? 0) + (states.get('partial') ?? 0) + (states.get('to_collect') ?? 0)).toBeGreaterThan(0);
  });

  it('keeps management data out of the public routes and desk rights with the desk', async () => {
    // Creating, collecting and cancelling requests is desk work (bookings.create).
    const code = await desk({ collect: 'later' });
    expect((await createRequest(code, 100, {}, 'accounting')).status).toBe(403);
    expect((await call('POST', `${manage}/bookings/${code}/collect`, { amountCents: 100 }, 'accounting')).status).toBe(403);
    expect((await call('GET', `${manage}/bookings/${code}/payment-requests`, undefined, 'accounting')).status).toBe(403);
    // The public availability answer carries no payment aggregate of any booking.
    const open = await call('GET', `/v1/beaches/${slug}/availability?day=${day}`);
    expect(JSON.stringify(open.body)).not.toContain('paymentState');
    expect(JSON.stringify(open.body)).not.toContain('remainingCents');
  });
});
