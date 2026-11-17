import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { upsertUser } from '@ombre/db';
import { createTestDatabase, insertBeach, testAdminUrl, type TestBeach, type TestDatabase } from '@ombre/db/testing';
import { createApp } from '../src/app';

const password = 'password-di-prova-123';
const signingSecret = 'segreto-di-prova-lungo-almeno-32-caratteri';

interface Harness {
  database: TestDatabase;
  app: ReturnType<typeof createApp>;
  beach: TestBeach;
  today: string;
  json: (method: string, path: string, payload?: unknown, headers?: Record<string, string>) => Promise<{ status: number; body: unknown }>;
  bearer: (role: string) => Record<string, string>;
}

/** A migrated database, a published beach club, the staff accounts and a seasonal one, the app. */
async function start(slug: string, spots: number): Promise<Harness> {
  const database = await createTestDatabase(testAdminUrl!);
  const dates = await database.admin.query<{ today: string }>("SELECT (now() AT TIME ZONE 'Europe/Rome')::date::text AS today");
  const { today } = dates.rows[0]!;
  const beach = await insertBeach(database.admin, slug, { spots, day: today });
  for (const role of ['manager', 'reception', 'accounting', 'cabin_holder'] as const) {
    await upsertUser(database.adminUrl, { email: `${role}@${slug}.example`, name: role, password }, [{ beachId: beach.beachId, role }]);
  }
  const app = createApp({ db: database.app.db, rateLimiter: { hit: () => 0 }, holdSeconds: 600, signingSecret, log: () => undefined });

  const json: Harness['json'] = async (method, path, payload, headers = {}) => {
    const response = await app.request(path, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });
    const text = await response.text();
    return { status: response.status, body: text ? (JSON.parse(text) as unknown) : null };
  };
  const tokens: Record<string, string> = {};
  for (const role of ['manager', 'reception', 'accounting', 'cabin_holder']) {
    const response = await json('POST', '/v1/auth/login', { email: `${role}@${slug}.example`, password });
    tokens[role] = (response.body as { token: string }).token;
  }
  const bearer = (role: string) => ({ Authorization: `Bearer ${tokens[role]}` });
  return { database, app, beach, today, json, bearer };
}

interface Card {
  code: string;
  zone: string;
  rowNumber: number;
  col: number;
  typeName: string;
  typeMark: string;
  umbrellas: number;
  sunbeds: number;
  maxGuests: number;
  state: string;
  notForSale: string | null;
  blockedReason: string | null;
  shared: boolean;
  priceCents: number | null;
  booking: { code: string; guestName: string; source: string; presence: string; totalCents: number; paidCents: number; remainingCents: number; paymentState: string } | null;
}

describe.skipIf(!testAdminUrl)('the card of one spot on one day', () => {
  let h: Harness;
  let bookingCode: string;

  const card = (code: string, role = 'manager') => h.json('GET', `/v1/manage/beaches/scheda/operations/spot?day=${h.today}&code=${code}`, undefined, h.bearer(role));

  beforeAll(async () => {
    h = await start('scheda', 5);
    const [, a02, a03, a04] = h.beach.spotIds;
    // A02 blocked with a reason, A03 withdrawn from sale, A04 sold «da incassare» and then partly collected.
    expect((await h.json('POST', '/v1/manage/beaches/scheda/inventory/block', { spotId: a02, day: h.today, blocked: true, reason: 'Manutenzione' }, h.bearer('reception'))).status).toBe(204);
    await h.database.admin.query("UPDATE inventory_day SET state = 'unpublishable' WHERE spot_id = $1 AND day = $2", [a03, h.today]);
    const sold = await h.json('POST', '/v1/manage/beaches/scheda/desk-bookings', { spotId: a04, day: h.today, guestName: 'Riservato Parziale', collect: 'later' }, h.bearer('reception'));
    expect(sold.status).toBe(201);
    bookingCode = (sold.body as { code: string }).code;
    const collected = await h.json('POST', `/v1/manage/beaches/scheda/bookings/${bookingCode}/collect`, { amountCents: 1000 }, h.bearer('reception'));
    expect(collected.status).toBe(200);
    // A spot in the drawing whose day was never published.
    await h.database.admin.query("INSERT INTO spot (beach_id, code, row_number) VALUES ($1, 'X01', 2)", [h.beach.beachId]);
  });

  afterAll(async () => {
    await h?.database.drop();
  });

  it('describes a free spot with its type, equipment and price of the day', async () => {
    const response = await card('A01');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      currency: 'EUR',
      day: h.today,
      code: 'A01',
      zone: 'ombrelloni',
      rowNumber: 1,
      col: 1,
      typeName: 'Ombrellone',
      typeMark: 'umbrella',
      umbrellas: 1,
      sunbeds: 2,
      maxGuests: 2,
      state: 'free',
      notForSale: null,
      blockedReason: null,
      shared: false,
      priceCents: 3000,
      booking: null,
    });
  });

  it('carries the block reason from the audit trail, and the withdrawal as the console tells it', async () => {
    const blocked = (await card('A02')).body as Card;
    expect(blocked).toMatchObject({ state: 'blocked', blockedReason: 'Manutenzione', booking: null });
    const withdrawn = (await card('A03')).body as Card;
    expect(withdrawn).toMatchObject({ state: 'not_for_sale', notForSale: 'withdrawn', blockedReason: null });
  });

  it('shows the booking of a sold day with total, collected and outstanding amounts (D31)', async () => {
    const sold = (await card('A04', 'reception')).body as Card;
    expect(sold.state).toBe('expected');
    expect(sold.booking).toEqual({
      code: bookingCode,
      guestName: 'Riservato Parziale',
      source: 'desk',
      presence: 'expected',
      totalCents: 3000,
      paidCents: 1000,
      remainingCents: 2000,
      paymentState: 'partial',
    });
  });

  it('refuses an unknown code and a day never published, with the usual not found', async () => {
    expect((await card('Z99')).status).toBe(404);
    expect((await card('X01')).status).toBe(404);
    const otherDay = await h.json('GET', '/v1/manage/beaches/scheda/operations/spot?day=2031-01-01&code=A01', undefined, h.bearer('manager'));
    expect(otherDay.status).toBe(404);
    expect((await h.json('GET', '/v1/manage/beaches/scheda/operations/spot?day=oggi&code=A01', undefined, h.bearer('manager'))).status).toBe(400);
    expect((await h.json('GET', `/v1/manage/beaches/scheda/operations/spot?day=${h.today}&code=a01`, undefined, h.bearer('manager'))).status).toBe(400);
  });

  it('opens for whoever sees the console and for nobody else', async () => {
    expect((await card('A01', 'reception')).status).toBe(200);
    expect((await card('A01', 'accounting')).status).toBe(403);
    expect((await card('A01', 'cabin_holder')).status).toBe(403);
    expect((await h.json('GET', `/v1/manage/beaches/scheda/operations/spot?day=${h.today}&code=A01`)).status).toBe(401);
  });

  it('keeps each beach club to its own spots', async () => {
    // A second club in the same database, with the same codes.
    const other = await insertBeach(h.database.admin, 'scheda-altro', { spots: 2, day: h.today });
    await upsertUser(h.database.adminUrl, { email: 'manager@scheda-altro.example', name: 'altro', password }, [{ beachId: other.beachId, role: 'manager' }]);
    const signedIn = await h.json('POST', '/v1/auth/login', { email: 'manager@scheda-altro.example', password });
    const bearer = { Authorization: `Bearer ${(signedIn.body as { token: string }).token}` };

    // A04 is sold on the first club: on the second it does not even exist.
    expect((await h.json('GET', `/v1/manage/beaches/scheda-altro/operations/spot?day=${h.today}&code=A04`, undefined, bearer)).status).toBe(404);
    // The shared code answers with the second club's own, free, card.
    const own = (await h.json('GET', `/v1/manage/beaches/scheda-altro/operations/spot?day=${h.today}&code=A01`, undefined, bearer)).body as Card;
    expect(own).toMatchObject({ state: 'free', booking: null });
    // A member of one club never reads the other one's card.
    expect((await h.json('GET', `/v1/manage/beaches/scheda/operations/spot?day=${h.today}&code=A01`, undefined, bearer)).status).toBe(403);
    expect((await h.json('GET', `/v1/manage/beaches/scheda-altro/operations/spot?day=${h.today}&code=A01`, undefined, h.bearer('manager'))).status).toBe(403);
  });
});
