import { createHmac, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setSplitRule, upsertUser } from '@ombre/db';
import { createTestDatabase, insertBeach, testAdminUrl, type TestBeach, type TestDatabase } from '@ombre/db/testing';
import { createApp } from '../src/app';

const password = 'password-di-prova-123';
const signingSecret = 'segreto-di-prova-lungo-almeno-32-caratteri';
const sandboxWebhookSecret = 'segreto-del-fornitore-di-prova';
const slug = 'convenzioni';
const day = '2099-07-15';
const otherDay = '2099-07-16';

// Increment B1 (spec §4.1, D30): hotel conventions, acceptance criterion 4.
describe.skipIf(!testAdminUrl)('hotel conventions: pricing, desk, statement and single registry', () => {
  let database: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let beach: TestBeach;
  const tokens: Record<string, string> = {};
  const deals: Record<string, string> = {};

  beforeAll(async () => {
    database = await createTestDatabase(testAdminUrl!);
    beach = await insertBeach(database.admin, slug, { spots: 12, day });
    for (const spotId of beach.spotIds) {
      await database.admin.query("INSERT INTO inventory_day (beach_id, spot_id, day, state, price_cents) VALUES ($1, $2, $3, 'available', 3000)", [beach.beachId, spotId, otherDay]);
    }
    await database.admin.query("INSERT INTO promotion (beach_id, code, percent_bps) VALUES ($1, 'MARE10', 1000)", [beach.beachId]);
    await setSplitRule(database.adminUrl, beach.beachId, { seasonHolder: 5000, beachClub: 4000, platform: 1000 });
    for (const role of ['manager', 'reception', 'accounting'] as const) {
      await upsertUser(database.adminUrl, { email: `${role}@${slug}.example`, name: role, password }, [{ beachId: beach.beachId, role }]);
    }
    // A shared day always belongs to a season pass: the holder's share must come out
    // of the agreed price, not the list price.
    const holder = await database.admin.query<{ id: string }>("INSERT INTO app_user (email, name, password_hash) VALUES ('stagionale@convenzioni.example', 'Stagionale', 'none') RETURNING id");
    const contract = await database.admin.query<{ id: string }>(
      'INSERT INTO season_contract (beach_id, holder_user_id, spot_id, valid_from, valid_to) VALUES ($1, $2, $3, $4, $4) RETURNING id',
      [beach.beachId, holder.rows[0]!.id, beach.spotIds[9], day],
    );
    await database.admin.query('UPDATE inventory_day SET shared = true, contract_id = $3 WHERE spot_id = $1 AND day = $2', [beach.spotIds[9], day, contract.rows[0]!.id]);

    app = createApp({ db: database.app.db, rateLimiter: { hit: () => 0 }, holdSeconds: 600, signingSecret, sandboxWebhookSecret, log: () => undefined });
    for (const role of ['manager', 'reception', 'accounting']) {
      const response = await json('POST', '/v1/auth/login', { email: `${role}@${slug}.example`, password });
      tokens[role] = (response.body as { token: string }).token;
    }
  });

  afterAll(async () => {
    await database?.drop();
  });

  async function json(method: string, path: string, payload?: unknown, headers: Record<string, string> = {}) {
    const response = await app.request(path, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    const text = await response.text();
    return { status: response.status, body: text ? (JSON.parse(text) as unknown) : null };
  }
  const bearer = (role: string) => ({ Authorization: `Bearer ${tokens[role]}` });
  const manage = `/v1/manage/beaches/${slug}`;
  const errorOf = (result: { body: unknown }) => (result.body as { error?: { code?: string; message?: string } }).error;

  const blank = { percentBps: null, fixedPriceCents: null, validFrom: null, validTo: null, notes: null };
  async function createDeal(name: string, payload: Record<string, unknown>, role = 'manager') {
    return json('POST', `${manage}/conventions`, { partnerName: name, ...blank, ...payload }, bearer(role));
  }

  interface Money {
    listPriceCents: number;
    discountCents: number;
    totalCents: number;
    promoCode: string | null;
  }
  const quote = async (spotId: string, promoCode?: string, onDay = day) => json('POST', '/v1/quotes', { beachSlug: slug, spotId, day: onDay, promoCode });

  async function buy(spotId: string, promoCode?: string, onDay = day): Promise<{ bookingId: string; accessToken: string; money: Money; code: string }> {
    const held = await json('POST', '/v1/holds', { beachSlug: slug, spotId, day: onDay, promoCode }, { 'Idempotency-Key': `test-${randomUUID()}` });
    expect(held.status).toBe(201);
    const { holdId, ...heldBody } = held.body as { holdId: string } & Money;
    const booked = (await json('POST', '/v1/checkouts', { beachSlug: slug, holdId, guestName: 'Ospite Inviato', guestEmail: 'ospite@example.org' })).body as {
      bookingId: string;
      accessToken: string;
      payment: { reference: string };
    };
    const raw = JSON.stringify({ eventId: `evt_${randomUUID()}`, reference: booked.payment.reference, outcome: 'succeeded' });
    const notified = await app.request('/v1/payment-webhooks/sandbox', {
      method: 'POST',
      headers: { 'X-Ombre-Signature': createHmac('sha256', sandboxWebhookSecret).update(raw).digest('hex') },
      body: raw,
    });
    expect(((await notified.json()) as { result: string }).result).toBe('confirmed');
    const row = await database.admin.query<{ code: string }>('SELECT code FROM booking WHERE id = $1', [booked.bookingId]);
    return { bookingId: booked.bookingId, accessToken: booked.accessToken, money: heldBody, code: row.rows[0]!.code };
  }

  it('lets only the commercial permission manage conventions, and keeps a code in one registry', async () => {
    expect((await createDeal('Hotel Sole', { code: 'X1', fixedPriceCents: 2000 }, 'reception')).status).toBe(403);
    expect((await createDeal('Hotel Sole', { code: 'X1', fixedPriceCents: 2000 }, 'accounting')).status).toBe(403);

    // The code is normalized like a promotion code: trimmed and upper-cased.
    const sole = await createDeal('Hotel Sole', { code: ' hsole ', fixedPriceCents: 2000 });
    expect(sole.status).toBe(201);
    const created = (sole.body as { convention: { conventionId: string; code: string; percentBps: number | null; fixedPriceCents: number | null; active: boolean } }).convention;
    expect(created).toMatchObject({ code: 'HSOLE', percentBps: null, fixedPriceCents: 2000, active: true });
    deals.sole = created.conventionId;

    deals.pineta = ((await createDeal('Camping Pineta', { code: 'CPINETA', percentBps: 2000 })).body as { convention: { conventionId: string } }).convention.conventionId;
    deals.caro = ((await createDeal('Hotel Caro', { code: 'HCARO', fixedPriceCents: 5000 })).body as { convention: { conventionId: string } }).convention.conventionId;
    deals.scaduto = ((await createDeal('Hotel Scaduto', { code: 'HPAST', fixedPriceCents: 1000, validFrom: '2099-06-01', validTo: '2099-06-30' })).body as { convention: { conventionId: string } }).convention.conventionId;
    deals.sospeso = ((await createDeal('Hotel Sospeso', { code: 'HPAUSA', fixedPriceCents: 1000 })).body as { convention: { conventionId: string } }).convention.conventionId;
    expect((await json('POST', `${manage}/conventions/${deals.sospeso}/status`, { active: false }, bearer('manager'))).status).toBe(204);

    // One pricing out of two, never both or neither; a backwards window is refused.
    expect((await createDeal('Hotel Doppio', { code: 'HDUE', fixedPriceCents: 1000, percentBps: 500 })).status).toBe(400);
    expect((await createDeal('Hotel Vuoto', { code: 'HZERO' })).status).toBe(400);
    expect((await createDeal('Hotel Inverso', { code: 'HINV', fixedPriceCents: 1000, validFrom: '2099-08-01', validTo: '2099-07-01' })).status).toBe(400);

    // Cross uniqueness, both ways: a convention must not take a promotion code...
    const clash = await createDeal('Hotel Furbo', { code: 'mare10', fixedPriceCents: 1000 });
    expect(clash.status).toBe(409);
    expect(errorOf(clash)?.code).toBe('code_taken');
    // ...and a promotion must not take a convention code, whoever writes the row.
    await expect(database.admin.query("INSERT INTO promotion (beach_id, code, percent_bps) VALUES ($1, 'HSOLE', 500)", [beach.beachId])).rejects.toThrow(/already names a convention/);
    // Nor may two conventions share a code.
    expect(errorOf(await createDeal('Hotel Clone', { code: 'HSOLE', fixedPriceCents: 900 }))?.code).toBe('code_taken');

    const listed = await json('GET', `${manage}/conventions`, undefined, bearer('manager'));
    expect(listed.status).toBe(200);
    expect(((listed.body as { conventions: { code: string }[] }).conventions.map((deal) => deal.code)).sort()).toEqual(['CPINETA', 'HCARO', 'HPAST', 'HPAUSA', 'HSOLE']);
    expect((await json('GET', `${manage}/conventions`, undefined, bearer('reception'))).status).toBe(403);

    const audited = await database.admin.query<{ action: string }>("SELECT action FROM audit_event WHERE action LIKE 'convention.%'");
    expect(audited.rows.map((row) => row.action)).toContain('convention.create');
    expect(audited.rows.map((row) => row.action)).toContain('convention.status');
  });

  it('applies the agreed price online through the same code field, never above the list price', async () => {
    // Fixed price below the list: the guest pays the agreed 20.00 on a 30.00 day.
    const fixed = await quote(beach.spotIds[0]!, 'hsole');
    expect(fixed.status).toBe(200);
    expect(fixed.body).toMatchObject({ listPriceCents: 3000, discountCents: 1000, totalCents: 2000, promoCode: 'HSOLE' });
    // The public answer shows the price effect exactly like a promotion: the partner
    // structure and the convention identifier never appear.
    expect(JSON.stringify(fixed.body)).not.toMatch(/Hotel|convention/i);

    // Percent discount: 20% off 30.00.
    expect((await quote(beach.spotIds[1]!, 'CPINETA')).body).toMatchObject({ listPriceCents: 3000, discountCents: 600, totalCents: 2400, promoCode: 'CPINETA' });
    // Fixed price above the list: the list price wins and the discount is never negative.
    expect((await quote(beach.spotIds[2]!, 'HCARO')).body).toMatchObject({ listPriceCents: 3000, discountCents: 0, totalCents: 3000, promoCode: 'HCARO' });

    // A full purchase records the convention on the booking; the channel stays online.
    const bought = await buy(beach.spotIds[0]!, 'HSOLE');
    expect(bought.money).toMatchObject({ listPriceCents: 3000, discountCents: 1000, totalCents: 2000, promoCode: 'HSOLE' });
    const saved = await database.admin.query<{ convention_id: string | null; promotion_id: string | null; promo_code: string | null; source: string; total_cents: number }>(
      'SELECT convention_id, promotion_id, promo_code, source, total_cents FROM booking WHERE id = $1',
      [bought.bookingId],
    );
    expect(saved.rows[0]).toEqual({ convention_id: deals.sole!, promotion_id: null, promo_code: 'HSOLE', source: 'online', total_cents: 2000 });

    // The guest's own view keeps the promotion shape and leaks nothing else.
    const view = await json('GET', `/v1/beaches/${slug}/bookings/${bought.bookingId}`, undefined, { Authorization: `Bearer ${bought.accessToken}` });
    expect(view.status).toBe(200);
    expect(view.body).toMatchObject({ promoCode: 'HSOLE', discountCents: 1000, totalCents: 2000 });
    expect(JSON.stringify(view.body)).not.toMatch(/Hotel Sole|convention/i);
  });

  it('refuses an expired, suspended or unknown code against the booked day, all alike', async () => {
    for (const code of ['HPAST', 'HPAUSA', 'INESISTENTE']) {
      const refused = await quote(beach.spotIds[3]!, code);
      expect(refused.status).toBe(422);
      expect(errorOf(refused)).toEqual({ code: 'promo_not_applicable', message: 'This code cannot be applied' });
      const held = await json('POST', '/v1/holds', { beachSlug: slug, spotId: beach.spotIds[3], day, promoCode: code }, { 'Idempotency-Key': `test-${randomUUID()}` });
      expect(held.status).toBe(422);
      expect(errorOf(held)?.code).toBe('promo_not_applicable');
    }
    // The window is compared with the booked day, not the purchase date: a convention
    // ending before the booked day is refused even though it is active today.
    const beyond = ((await createDeal('Hotel Breve', { code: 'HBREVE', fixedPriceCents: 1000, validFrom: day, validTo: day })).body as { convention: { conventionId: string } }).convention;
    deals.breve = beyond.conventionId;
    expect((await quote(beach.spotIds[3]!, 'HBREVE')).status).toBe(200);
    expect((await quote(beach.spotIds[3]!, 'HBREVE', otherDay)).status).toBe(422);
  });

  it('lets the desk pick a convention from a list, by identifier, with the same refusals', async () => {
    const listed = await json('GET', `${manage}/desk-conventions?day=${day}`, undefined, bearer('reception'));
    expect(listed.status).toBe(200);
    const picks = (listed.body as { conventions: { conventionId: string; partnerName: string; code: string; percentBps: number | null; fixedPriceCents: number | null }[] }).conventions;
    // Only active conventions valid on the booked day: no expired, no suspended one.
    expect(picks.map((deal) => deal.code)).toEqual(['CPINETA', 'HBREVE', 'HCARO', 'HSOLE']);
    expect((await json('GET', `${manage}/desk-conventions?day=${otherDay}`, undefined, bearer('reception'))).body).toMatchObject({
      conventions: [expect.objectContaining({ code: 'CPINETA' }), expect.objectContaining({ code: 'HCARO' }), expect.objectContaining({ code: 'HSOLE' })],
    });
    expect((await json('GET', `${manage}/desk-conventions?day=${day}`, undefined, bearer('accounting'))).status).toBe(403);

    const booked = await json('POST', `${manage}/desk-bookings`, { spotId: beach.spotIds[4], day, guestName: 'Cliente Convenzionato', conventionId: deals.pineta }, bearer('reception'));
    expect(booked.status).toBe(201);
    const saved = await database.admin.query<{ convention_id: string | null; source: string; total_cents: number; list_price_cents: number }>(
      'SELECT convention_id, source, total_cents, list_price_cents FROM booking WHERE code = $1',
      [(booked.body as { code: string }).code],
    );
    expect(saved.rows[0]).toEqual({ convention_id: deals.pineta!, source: 'desk', total_cents: 2400, list_price_cents: 3000 });

    const refused = await json('POST', `${manage}/desk-bookings`, { spotId: beach.spotIds[5], day, guestName: 'Cliente Sospeso', conventionId: deals.sospeso }, bearer('reception'));
    expect(refused.status).toBe(422);
    expect(errorOf(refused)?.code).toBe('promo_not_applicable');
    const expired = await json('POST', `${manage}/desk-bookings`, { spotId: beach.spotIds[5], day, guestName: 'Cliente Tardivo', conventionId: deals.scaduto }, bearer('reception'));
    expect(expired.status).toBe(422);
  });

  it('takes the season holder share out of the agreed price on a shared day', async () => {
    const shared = await buy(beach.spotIds[9]!, 'HSOLE');
    expect(shared.money.totalCents).toBe(2000);
    const shares = await database.admin.query<{ party: string; amount_cents: number }>(
      'SELECT party::text AS party, amount_cents FROM allocation WHERE booking_id = $1 ORDER BY party',
      [shared.bookingId],
    );
    // 50/40/10 of the agreed 20.00, not of the 30.00 list price.
    expect(shares.rows).toEqual([
      { party: 'beach_club', amount_cents: 800 },
      { party: 'platform', amount_cents: 200 },
      { party: 'season_holder', amount_cents: 1000 },
    ]);
  });

  it('counts the statement per structure and the statistics dimension correctly', async () => {
    // A cancelled convention booking must fall out of the statement.
    const cancelled = await buy(beach.spotIds[6]!, 'HSOLE');
    expect((await json('POST', `${manage}/bookings/${cancelled.code}/cancel`, { reason: 'Prova di annullo' }, bearer('manager'))).status).toBe(204);

    const statement = await json('GET', `${manage}/conventions/${deals.sole}/statement?from=${day}&to=${day}`, undefined, bearer('accounting'));
    expect(statement.status).toBe(200);
    const report = statement.body as {
      convention: { partnerName: string; code: string };
      bookings: { code: string; day: string; spotCode: string; guestName: string; totalCents: number }[];
      totals: { bookings: number; grossCents: number; discountCents: number };
    };
    expect(report.convention).toMatchObject({ partnerName: 'Hotel Sole', code: 'HSOLE' });
    expect(report.totals).toEqual({ bookings: 2, grossCents: 4000, discountCents: 2000 });
    expect(report.bookings).toHaveLength(2);
    expect(report.bookings.every((row) => row.day === day && row.totalCents === 2000)).toBe(true);

    expect((await json('GET', `${manage}/conventions/${deals.sole}/statement?from=${day}&to=${day}`, undefined, bearer('reception'))).status).toBe(403);
    expect((await json('GET', `${manage}/conventions/${randomUUID()}/statement?from=${day}&to=${day}`, undefined, bearer('manager'))).status).toBe(404);

    // The statistics gain the convention as a dimension; the channel stays online/desk.
    const statistics = await json('GET', `${manage}/reports/statistics?from=${day}&to=${day}`, undefined, bearer('manager'));
    expect(statistics.status).toBe(200);
    const figures = statistics.body as { byConvention: { partnerName: string; bookings: number; grossCents: number }[]; byChannel: { source: string }[] };
    expect(figures.byConvention).toEqual([
      { conventionId: deals.pineta, partnerName: 'Camping Pineta', bookings: 1, grossCents: 2400 },
      { conventionId: deals.sole, partnerName: 'Hotel Sole', bookings: 2, grossCents: 4000 },
    ]);
    expect(figures.byChannel.map((channel) => channel.source).sort()).toEqual(['desk', 'online']);
  });

  it('never deletes a used convention, and deletes an unused one with its audit trail', async () => {
    const used = await json('DELETE', `${manage}/conventions/${deals.sole}`, undefined, bearer('manager'));
    expect(used.status).toBe(409);
    expect(errorOf(used)?.message).toContain('suspend it instead');

    const updated = await json('PUT', `${manage}/conventions/${deals.breve}`, { partnerName: 'Hotel Breve', code: 'HBREVE', ...blank, fixedPriceCents: 1500, validFrom: day, validTo: day }, bearer('manager'));
    expect(updated.status).toBe(200);
    expect((updated.body as { convention: { fixedPriceCents: number } }).convention.fixedPriceCents).toBe(1500);

    expect((await json('DELETE', `${manage}/conventions/${deals.breve}`, undefined, bearer('manager'))).status).toBe(204);
    expect((await json('DELETE', `${manage}/conventions/${deals.breve}`, undefined, bearer('manager'))).status).toBe(404);
    const audited = await database.admin.query<{ action: string }>("SELECT action FROM audit_event WHERE action IN ('convention.update', 'convention.delete')");
    expect(audited.rows.map((row) => row.action).sort()).toEqual(['convention.delete', 'convention.update']);
  });

  it('adds nothing new to the public answers: the availability keeps its exact shape', async () => {
    const availability = await json('GET', `/v1/beaches/${slug}/availability?day=${day}`);
    expect(availability.status).toBe(200);
    expect(Object.keys(availability.body as Record<string, unknown>).sort()).toEqual(['beach', 'currency', 'day', 'elements', 'gaps', 'layout', 'seaSide', 'spots', 'to']);
    expect(JSON.stringify(availability.body)).not.toMatch(/convention|Hotel/i);
  });
});
