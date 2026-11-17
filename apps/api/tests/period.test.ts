import { createHmac, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setSplitRule, upsertUser } from '@ombre/db';
import { createTestDatabase, insertBeach, testAdminUrl, type TestBeach, type TestDatabase } from '@ombre/db/testing';
import { createApp } from '../src/app';

// Iterazione «tre ruoli e ricerca per periodo» (D38–D40, specifica §2 e §8.2):
// il gruppo di prenotazione — un codice, un pass, un totale — la ricerca dal–al,
// la riserva tutta o niente, i pagamenti sul gruppo e l'annullamento del periodo.

const password = 'password-di-prova-123';
const signingSecret = 'segreto-di-prova-lungo-almeno-32-caratteri';
const sandboxWebhookSecret = 'segreto-del-fornitore-di-prova';
const siteUrl = 'https://ombre.example';
const slug = 'periodo';

describe.skipIf(!testAdminUrl)('booking groups over a dal–al period', () => {
  let database: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let beach: TestBeach;
  const tokens: Record<string, string> = {};
  let towelId = '';
  /** day[0] = oggi nel fuso dello stabilimento; day[1] e day[2] le due giornate dopo. */
  const day: string[] = [];

  const dayAfter = (from: string, days: number) => new Date(Date.parse(`${from}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

  beforeAll(async () => {
    database = await createTestDatabase(testAdminUrl!);
    const dates = await database.admin.query<{ today: string }>("SELECT (now() AT TIME ZONE 'Europe/Rome')::date::text AS today");
    day.push(dates.rows[0]!.today, dayAfter(dates.rows[0]!.today, 1), dayAfter(dates.rows[0]!.today, 2));
    beach = await insertBeach(database.admin, slug, { spots: 8, day: day[0]! });
    await setSplitRule(database.adminUrl, beach.beachId, { seasonHolder: 5000, beachClub: 4000, platform: 1000 });
    // Le giornate 1 e 2 per le postazioni ordinarie; A07 (indice 6) resta con la
    // sola giornata 0, A08 (indice 7) senza la giornata 1: servono alle condivise.
    for (const [index, spotId] of beach.spotIds.entries()) {
      if (index === 6) continue;
      for (const later of [day[1]!, day[2]!]) {
        if (index === 7 && later === day[1]) continue;
        await database.admin.query("INSERT INTO inventory_day (beach_id, spot_id, day, state, price_cents) VALUES ($1, $2, $3, 'available', 3000)", [beach.beachId, spotId, later]);
      }
    }
    const towel = await database.admin.query<{ id: string }>(
      "INSERT INTO extra_service (beach_id, name_it, name_en, unit_price_cents) VALUES ($1, 'Telo mare', 'Beach towel', 500) RETURNING id",
      [beach.beachId],
    );
    towelId = towel.rows[0]!.id;
    await database.admin.query("INSERT INTO promotion (beach_id, code, percent_bps) VALUES ($1, 'MARE10', 1000)", [beach.beachId]);
    // Una convenzione valida solo per le prime due giornate del periodo.
    await database.admin.query(
      "INSERT INTO hotel_convention (beach_id, partner_name, code, percent_bps, valid_from, valid_to) VALUES ($1, 'Hotel Prova', 'HOTEL20', 2000, $2, $3)",
      [beach.beachId, day[0], day[1]],
    );
    const other = await insertBeach(database.admin, 'periodo-altro', { spots: 2, day: day[0]! });
    for (const role of ['manager', 'reception', 'accounting'] as const) {
      await upsertUser(database.adminUrl, { email: `${role}@periodo.example`, name: role, password }, [{ beachId: beach.beachId, role }]);
    }
    await upsertUser(database.adminUrl, { email: 'manager@periodo-altro.example', name: 'altro', password }, [{ beachId: other.beachId, role: 'manager' }]);
    await upsertUser(database.adminUrl, { email: 'stagionale@periodo.example', name: 'Stagionale', password });
    app = createApp({ db: database.app.db, rateLimiter: { hit: () => 0 }, holdSeconds: 600, signingSecret, sandboxWebhookSecret, siteUrl, log: () => undefined });
    for (const name of ['manager', 'reception', 'accounting', 'stagionale']) {
      tokens[name] = ((await call('POST', '/v1/auth/login', { email: `${name}@periodo.example`, password })).body as { token: string }).token;
    }
    tokens.altro = ((await call('POST', '/v1/auth/login', { email: 'manager@periodo-altro.example', password })).body as { token: string }).token;
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
  const admin = <T extends Record<string, unknown>>(text: string, values: unknown[] = []) => database.admin.query<T>(text, values);

  async function notify(reference: string, outcome: 'succeeded' | 'failed') {
    const raw = JSON.stringify({ eventId: `evt_${randomUUID()}`, reference, outcome });
    const response = await app.request('/v1/payment-webhooks/sandbox', {
      method: 'POST',
      headers: { 'X-Ombre-Signature': createHmac('sha256', sandboxWebhookSecret).update(raw).digest('hex') },
      body: raw,
    });
    return ((await response.json()) as { result?: string }).result;
  }

  interface MapSpot {
    code: string;
    spotId: string;
    status: string;
    priceCents: number | null;
    shared?: boolean;
  }
  async function mapOf(from: string, to?: string): Promise<Map<string, MapSpot>> {
    const seen = await call('GET', `/v1/beaches/${slug}/availability?day=${from}${to ? `&to=${to}` : ''}`);
    expect(seen.status).toBe(200);
    return new Map((seen.body as { layout: MapSpot[] }).layout.map((entry) => [entry.code, entry]));
  }

  interface Row {
    code: string;
    status: string;
    spotCode: string;
    from: string;
    to: string;
    totalCents: number;
    paidCents: number;
    remainingCents: number;
    paymentState: string;
  }
  async function rowOf(code: string, onDay: string): Promise<Row> {
    const listed = await call('GET', `${manage}/bookings?day=${onDay}`, undefined, 'manager');
    const found = (listed.body as { bookings: Row[] }).bookings.find((entry) => entry.code === code);
    expect(found).toBeDefined();
    return found!;
  }

  async function deskPeriod(spotIndex: number, input: Record<string, unknown> = {}): Promise<string> {
    const booked = await call('POST', `${manage}/desk-bookings`, { spotId: beach.spotIds[spotIndex], day: day[0], to: day[2], guestName: 'Pino Periodo', ...input }, 'reception');
    expect(booked.status).toBe(201);
    return (booked.body as { code: string }).code;
  }

  it('cerca per periodo: nei risultati solo le postazioni libere ogni giornata, prezzo = somma', async () => {
    // A01 viene occupata nella giornata di mezzo: sparisce dal periodo, resta nelle altre giornate.
    const single = await call('POST', `${manage}/desk-bookings`, { spotId: beach.spotIds[0], day: day[1], guestName: 'Gina Giorno' }, 'reception');
    expect(single.status).toBe(201);

    const whole = await mapOf(day[0]!, day[2]!);
    expect(whole.get('A01')).toMatchObject({ status: 'unavailable', priceCents: null });
    expect(whole.get('A02')).toMatchObject({ status: 'free', priceCents: 9000 });
    // Senza tutte le giornate pubblicate la postazione non copre il periodo.
    expect(whole.get('A07')).toMatchObject({ status: 'unavailable', priceCents: null });
    // Il caso minimo di un giorno resta identico a oggi.
    const today = await mapOf(day[0]!);
    expect(today.get('A01')).toMatchObject({ status: 'free', priceCents: 3000 });

    const search = await call('GET', `/v1/beaches?day=${day[0]}&to=${day[2]}&locality=Test`);
    expect(search.status).toBe(200);
    const offer = (search.body as { to: string; beaches: { slug: string; freeSpots: number; priceFromCents: number | null }[] }).beaches.find((entry) => entry.slug === slug)!;
    expect((search.body as { to: string }).to).toBe(day[2]);
    expect(offer.priceFromCents).toBe(9000);
    // A02–A06 libere su tutte e tre le giornate; A01 (mezzo occupato), A07 e A08 (giornate mancanti) fuori.
    expect(offer.freeSpots).toBe(5);
  });

  it('rifiuta un periodo oltre le 31 giornate o scritto al rovescio', async () => {
    const over = await call('GET', `/v1/beaches/${slug}/availability?day=${day[0]}&to=${dayAfter(day[0]!, 31)}`);
    expect(over.status).toBe(409);
    expect(errorCode(over)).toBe('cap_reached');
    expect((await call('GET', `/v1/beaches?day=${day[0]}&to=${dayAfter(day[0]!, 31)}`)).status).toBe(409);
    const backwards = await call('POST', '/v1/quotes', { beachSlug: slug, spotId: beach.spotIds[1], day: day[1], to: day[0] });
    expect(backwards.status).toBe(409);
    const held = await call('POST', '/v1/holds', { beachSlug: slug, spotId: beach.spotIds[1], day: day[0], to: dayAfter(day[0]!, 31) }, undefined, { 'Idempotency-Key': `test-${randomUUID()}` });
    expect(errorCode(held)).toBe('cap_reached');
  });

  it('promozioni e convenzioni si applicano per giornata e si sommano; la convenzione deve coprire il periodo', async () => {
    const quoted = await call('POST', '/v1/quotes', { beachSlug: slug, spotId: beach.spotIds[1], day: day[0], to: day[2], promoCode: 'MARE10' });
    expect(quoted.status).toBe(200);
    expect(quoted.body).toMatchObject({ listPriceCents: 9000, discountCents: 900, totalCents: 8100, promoCode: 'MARE10' });
    expect((quoted.body as { days: { discountCents: number }[] }).days.map((entry) => entry.discountCents)).toEqual([300, 300, 300]);

    // HOTEL20 vale fino alla seconda giornata: copre dal–al corto, rifiuta quello lungo.
    const covered = await call('POST', '/v1/quotes', { beachSlug: slug, spotId: beach.spotIds[1], day: day[0], to: day[1], promoCode: 'HOTEL20' });
    expect(covered.body).toMatchObject({ listPriceCents: 6000, discountCents: 1200, totalCents: 4800 });
    const uncovered = await call('POST', '/v1/quotes', { beachSlug: slug, spotId: beach.spotIds[1], day: day[0], to: day[2], promoCode: 'HOTEL20' });
    expect(errorCode(uncovered)).toBe('promo_not_applicable');
  });

  it('un gruppo di tre giornate: un codice, un totale, extra una volta, pass che risolve la giornata', async () => {
    const spotId = beach.spotIds[1]!;
    const quoted = await call('POST', '/v1/quotes', { beachSlug: slug, spotId, day: day[0], to: day[2], extras: [{ serviceId: towelId, quantity: 2 }] });
    expect(quoted.body).toMatchObject({ listPriceCents: 9000, extrasCents: 1000, totalCents: 10000 });

    const key = `test-${randomUUID()}`;
    const held = await call('POST', '/v1/holds', { beachSlug: slug, spotId, day: day[0], to: day[2], extras: [{ serviceId: towelId, quantity: 2 }] }, undefined, { 'Idempotency-Key': key });
    expect(held.status).toBe(201);
    expect(held.body).toMatchObject({ from: day[0], to: day[2], totalCents: 10000, extrasCents: 1000 });
    const holdId = (held.body as { holdId: string }).holdId;
    // La scadenza è unica: ogni fermo della famiglia scade nello stesso istante.
    const expiries = await admin<{ n: string }>('SELECT count(DISTINCT expires_at) AS n FROM hold WHERE id = $1 OR parent_hold_id = $1', [holdId]);
    expect(Number(expiries.rows[0]!.n)).toBe(1);
    // La stessa chiave restituisce lo stesso gruppo di riserva.
    const replay = await call('POST', '/v1/holds', { beachSlug: slug, spotId, day: day[0], to: day[2], extras: [{ serviceId: towelId, quantity: 2 }] }, undefined, { 'Idempotency-Key': key });
    expect(replay.status).toBe(200);
    expect((replay.body as { holdId: string }).holdId).toBe(holdId);

    const booked = await call('POST', '/v1/checkouts', { beachSlug: slug, holdId, guestName: 'Teo Tregiorni', guestEmail: 'teo@example.org' });
    expect(booked.status).toBe(201);
    const checkout = booked.body as { bookingId: string; accessToken: string; payment: { reference: string; amountCents: number } };
    expect(checkout.payment.amountCents).toBe(10000);
    expect(await notify(checkout.payment.reference, 'succeeded')).toBe('confirmed');

    const view = await call('GET', `/v1/beaches/${slug}/bookings/${checkout.bookingId}`, undefined, undefined, { Authorization: `Bearer ${checkout.accessToken}` });
    expect(view.status).toBe(200);
    const summary = view.body as { code: string; status: string; from: string; to: string; days: { day: string; totalCents: number }[]; totalCents: number; paidCents: number; paymentState: string; passCredential: string | null };
    expect(summary).toMatchObject({ status: 'confirmed', from: day[0], to: day[2], totalCents: 10000, paidCents: 10000, paymentState: 'paid' });
    expect(summary.days.map((entry) => entry.totalCents)).toEqual([3000, 3000, 3000]);
    expect(summary.passCredential).toBeTruthy();

    // Nel dato: un gruppo, tre prenotazioni con lo stesso codice, un pass del gruppo, un pagamento del gruppo.
    const grouped = await admin<{ n: string }>('SELECT count(*) AS n FROM booking b JOIN booking_group g ON g.id = b.group_id WHERE g.code = $1', [summary.code]);
    expect(Number(grouped.rows[0]!.n)).toBe(3);
    const passes = await admin<{ n: string }>('SELECT count(*) AS n FROM pass p JOIN booking_group g ON g.id = p.group_id WHERE g.code = $1', [summary.code]);
    expect(Number(passes.rows[0]!.n)).toBe(1);
    const payments = await admin<{ amount_cents: number }>('SELECT p.amount_cents FROM payment p JOIN booking_group g ON g.id = p.group_id WHERE g.code = $1', [summary.code]);
    expect(payments.rows.map((entry) => Number(entry.amount_cents))).toEqual([10000]);

    // L'elenco di ogni giornata mostra la giornata del gruppo col suo codice e il totale del gruppo.
    expect(await rowOf(summary.code, day[1]!)).toMatchObject({ spotCode: 'A02', from: day[0], to: day[2], totalCents: 10000, paymentState: 'paid' });

    // Il pass risolve la giornata corrente: oggi l'ingresso vale, e vale una volta sola.
    const entered = await call('POST', `${manage}/access-events`, { credential: summary.passCredential, kind: 'entry' }, 'reception');
    expect(entered.status).toBe(201);
    expect(entered.body).toMatchObject({ code: summary.code, spotCode: 'A02', presence: 'inside' });
    expect((entered.body as { extras: { quantity: number }[] }).extras).toEqual([{ name: { it: 'Telo mare', en: 'Beach towel' }, quantity: 2 }]);
    expect(errorCode(await call('POST', `${manage}/access-events`, { credential: summary.passCredential, kind: 'entry' }, 'reception'))).toBe('invalid_state');
    // Solo la giornata di oggi risulta «dentro»: le altre restano attese.
    const presences = await admin<{ presence: string; day: string }>(
      'SELECT b.presence, i.day::text AS day FROM booking b JOIN inventory_day i ON i.id = b.inventory_day_id JOIN booking_group g ON g.id = b.group_id WHERE g.code = $1 ORDER BY i.day',
      [summary.code],
    );
    expect(presences.rows.map((entry) => entry.presence)).toEqual(['inside', 'expected', 'expected']);
    // Anche il codice breve risolve il gruppo: l'uscita di oggi.
    expect((await call('POST', `${manage}/access-events`, { credential: summary.code, kind: 'exit' }, 'reception')).status).toBe(201);
  });

  it('una giornata occupata nel mezzo fa fallire la riserva intera: nessun fermo resta', async () => {
    const spotId = beach.spotIds[2]!;
    const middle = await call('POST', `${manage}/desk-bookings`, { spotId, day: day[1], guestName: 'Mezzo Occupato' }, 'reception');
    expect(middle.status).toBe(201);

    const held = await call('POST', '/v1/holds', { beachSlug: slug, spotId, day: day[0], to: day[2] }, undefined, { 'Idempotency-Key': `test-${randomUUID()}` });
    expect(held.status).toBe(409);
    expect(errorCode(held)).toBe('inventory_conflict');
    // Tutta o niente: le giornate ai lati restano in vendita, senza fermi appesi.
    const states = await admin<{ day: string; state: string; active_hold_id: string | null }>(
      'SELECT day::text AS day, state, active_hold_id FROM inventory_day WHERE spot_id = $1 ORDER BY day',
      [spotId],
    );
    expect(states.rows.map((entry) => [entry.day, entry.state, entry.active_hold_id])).toEqual([
      [day[0], 'available', null],
      [day[1], 'occupied', null],
      [day[2], 'available', null],
    ]);
  });

  it('le condivise contano se coprono la giornata; un periodo mescola ordinarie e condivise', async () => {
    // A08: ordinarie le giornate 0 e 2, condivisa la giornata 1 (proposta approvata).
    // A07: resta solo una condivisa nella giornata 0, il periodo non è coperto.
    await admin('DELETE FROM inventory_day WHERE spot_id = $1', [beach.spotIds[6]]);
    expect((await call('PUT', `${manage}/sharing-settings`, { dailySharedCap: 2, sharedPriceCents: 3500 }, 'manager')).status).toBe(204);
    for (const [index, days] of [[7, [day[1]!]], [6, [day[0]!]]] as [number, string[]][]) {
      const contract = await call('POST', `${manage}/contracts`, { holderEmail: 'stagionale@periodo.example', spotId: beach.spotIds[index], validFrom: day[0], validTo: day[2] }, 'manager');
      expect(contract.status).toBe(201);
      const contractId = (contract.body as { contractId: string }).contractId;
      expect((await call('POST', `/v1/season/contracts/${contractId}/proposals`, { days }, 'stagionale')).status).toBe(200);
    }
    const pending = (await call('GET', `${manage}/proposals?status=proposed`, undefined, 'manager')).body as { proposals: { proposalId: string }[] };
    for (const proposal of pending.proposals) {
      expect((await call('POST', `${manage}/proposals/${proposal.proposalId}/decision`, { approve: true }, 'manager')).status).toBe(204);
    }

    const whole = await mapOf(day[0]!, day[2]!);
    // A08 copre il periodo mescolando: 3000 + 3500 (condivisa) + 3000; il distintivo S resta alle sole condivise pure.
    expect(whole.get('A08')).toMatchObject({ status: 'free', priceCents: 9500 });
    // A07 ha solo la condivisa di oggi: fuori dal periodo, dentro la giornata singola col distintivo.
    expect(whole.get('A07')).toMatchObject({ status: 'unavailable', priceCents: null });
    const today = await mapOf(day[0]!);
    expect(today.get('A07')).toMatchObject({ status: 'shared', priceCents: 3500 });

    // La riserva del periodo misto va in porto e l'economia resta per giornata:
    // la quota dello stagionale nasce solo sulla giornata condivisa.
    const held = await call('POST', '/v1/holds', { beachSlug: slug, spotId: beach.spotIds[7], day: day[0], to: day[2] }, undefined, { 'Idempotency-Key': `test-${randomUUID()}` });
    expect(held.status).toBe(201);
    const booked = await call('POST', '/v1/checkouts', { beachSlug: slug, holdId: (held.body as { holdId: string }).holdId, guestName: 'Misto Periodo', guestEmail: 'misto@example.org' });
    const checkout = booked.body as { payment: { reference: string; amountCents: number }; code?: string };
    expect(await notify(checkout.payment.reference, 'succeeded')).toBe('confirmed');
    const shares = await admin<{ day: string }>(
      "SELECT i.day::text AS day FROM allocation a JOIN booking b ON b.id = a.booking_id JOIN inventory_day i ON i.id = b.inventory_day_id WHERE i.spot_id = $1 AND a.party = 'season_holder'",
      [beach.spotIds[7]],
    );
    expect(shares.rows.map((entry) => entry.day)).toEqual([day[1]]);
  });

  it('al banco si prenota dal–al «da incassare»: residuo e richieste /paga sul totale del gruppo', async () => {
    const code = await deskPeriod(3, { collect: 'later', guestEmail: 'pino@example.org' });
    expect(await rowOf(code, day[2]!)).toMatchObject({ from: day[0], to: day[2], totalCents: 9000, paidCents: 0, remainingCents: 9000, paymentState: 'to_collect' });
    // Pass subito anche «da incassare» (D5: pagare non è entrare): il pass è del gruppo.
    const pass = await admin<{ n: string }>('SELECT count(*) AS n FROM pass p JOIN booking_group g ON g.id = p.group_id WHERE g.code = $1', [code]);
    expect(Number(pass.rows[0]!.n)).toBe(1);

    // Acconto parziale al banco: il residuo scende sul totale del gruppo.
    const collected = await call('POST', `${manage}/bookings/${code}/collect`, { amountCents: 2000 }, 'reception');
    expect(collected.body).toMatchObject({ paidCents: 2000, remainingCents: 7000, paymentState: 'partial' });

    // La richiesta del saldo: una sola per il residuo del gruppo, pagata su /paga.
    expect(errorCode(await call('POST', `${manage}/bookings/${code}/payment-requests`, { amountCents: 7500 }, 'reception'))).toBe('invalid_state');
    const request = await call('POST', `${manage}/bookings/${code}/payment-requests`, { amountCents: 7000 }, 'reception');
    expect(request.status).toBe(201);
    const token = (request.body as { payUrl: string }).payUrl.split('/').pop()!;
    expect((await call('GET', `/v1/pay-requests/${token}`)).body).toMatchObject({ status: 'pending', day: day[0], amountCents: 7000 });
    const started = await call('POST', `/v1/pay-requests/${token}/payments`);
    expect(started.status).toBe(201);
    expect(await notify((started.body as { payment: { reference: string } }).payment.reference, 'succeeded')).toBe('collected');
    expect(await rowOf(code, day[0]!)).toMatchObject({ paidCents: 9000, remainingCents: 0, paymentState: 'paid' });

    // «Sposta» resta per giornata: il gruppo lungo chiede la giornata, poi sposta solo quella.
    const vague = await call('POST', `${manage}/bookings/${code}/move`, { spotId: beach.spotIds[4] }, 'manager');
    expect(errorCode(vague)).toBe('invalid_state');
    expect((await call('POST', `${manage}/bookings/${code}/move`, { spotId: beach.spotIds[4], day: day[1] }, 'manager')).status).toBe(204);
    expect(await rowOf(code, day[1]!)).toMatchObject({ spotCode: 'A05' });
    expect(await rowOf(code, day[0]!)).toMatchObject({ spotCode: 'A04' });
  });

  it('annulla il periodo intero: storni per giornata, rimborso degli extra, giornate di nuovo in vendita', async () => {
    const code = await deskPeriod(5, { extras: [{ serviceId: towelId, quantity: 1 }] });
    expect(await rowOf(code, day[0]!)).toMatchObject({ totalCents: 9500, paidCents: 9500, paymentState: 'paid' });

    expect((await call('POST', `${manage}/bookings/${code}/cancel`, { reason: 'maltempo' }, 'manager')).status).toBe(204);
    const statuses = await admin<{ status: string }>('SELECT b.status FROM booking b JOIN booking_group g ON g.id = b.group_id WHERE g.code = $1', [code]);
    expect(statuses.rows.map((entry) => entry.status)).toEqual(['cancelled', 'cancelled', 'cancelled']);
    const revoked = await admin<{ revoked: boolean }>('SELECT p.revoked FROM pass p JOIN booking_group g ON g.id = p.group_id WHERE g.code = $1', [code]);
    expect(revoked.rows[0]).toEqual({ revoked: true });

    // Rimborso di quanto davvero pagato e storni compensativi: le quote di ogni
    // giornata tornano indietro, gli extra pure (nessuna giornata era matura).
    const refunds = await admin<{ amount_cents: number }>(
      'SELECT r.amount_cents FROM refund r JOIN payment p ON p.id = r.payment_id JOIN booking_group g ON g.id = p.group_id WHERE g.code = $1',
      [code],
    );
    expect(refunds.rows.map((entry) => Number(entry.amount_cents))).toEqual([9500]);
    const due = await admin<{ amount_cents: number }>(
      "SELECT e.amount_cents FROM ledger_entry e JOIN booking b ON b.id = e.booking_id JOIN booking_group g ON g.id = b.group_id WHERE g.code = $1 AND e.kind = 'refund_due'",
      [code],
    );
    expect(due.rows.map((entry) => Number(entry.amount_cents))).toEqual([-9500]);
    const adjustments = await admin<{ total: string }>(
      "SELECT coalesce(sum(e.amount_cents), 0) AS total FROM ledger_entry e JOIN booking b ON b.id = e.booking_id JOIN booking_group g ON g.id = b.group_id WHERE g.code = $1 AND e.kind = 'adjustment'",
      [code],
    );
    expect(Number(adjustments.rows[0]!.total)).toBe(-9500);

    // Le tre giornate tornano comprabili per l'intero periodo.
    const whole = await mapOf(day[0]!, day[2]!);
    expect(whole.get('A06')).toMatchObject({ status: 'free', priceCents: 9000 });
  });

  it('scheda della postazione e planner espongono il gruppo: codice, periodo, totale, residuo', async () => {
    // Il gruppo di tre giornate di A02 (creato sopra): la scheda della giornata di
    // mezzo mostra il prezzo della giornata e, del gruppo, periodo e totale.
    const card = await call('GET', `${manage}/operations/spot?day=${day[1]}&code=A02`, undefined, 'manager');
    expect(card.status).toBe(200);
    const sold = (card.body as { booking: { totalCents: number; group: Record<string, unknown> } }).booking;
    expect(sold.totalCents).toBe(3000);
    expect(sold.group).toMatchObject({ from: day[0], to: day[2], days: 3, totalCents: 10000, paidCents: 10000, remainingCents: 0, paymentState: 'paid' });

    const planner = await call('GET', `${manage}/planner?from=${day[0]}&to=${day[2]}`, undefined, 'manager');
    expect(planner.status).toBe(200);
    const grid = (planner.body as { spots: { code: string; cells: { state: string; bookingCode: string | null; period: { from: string; to: string } | null }[] }[] }).spots;
    const row = grid.find((entry) => entry.code === 'A02')!;
    expect(row.cells.map((cell) => cell.state)).toEqual(['booked', 'booked', 'booked']);
    const codes = new Set(row.cells.map((cell) => cell.bookingCode));
    expect(codes.size).toBe(1);
    for (const cell of row.cells) expect(cell.period).toEqual({ from: day[0], to: day[2] });
  });

  it('tiene ogni stabilimento nel suo recinto e i permessi del banco al banco', async () => {
    const found = await admin<{ code: string }>(
      "SELECT g.code FROM booking_group g JOIN booking b ON b.group_id = g.id WHERE g.beach_id = $1 AND b.status = 'confirmed' LIMIT 1",
      [beach.beachId],
    );
    const code = found.rows[0]!.code;
    // Il gestore dell'altro stabilimento non vede né incassa il gruppo altrui.
    expect((await call('POST', `/v1/manage/beaches/periodo-altro/bookings/${code}/collect`, { amountCents: 100 }, 'altro')).status).toBe(404);
    expect((await call('GET', `/v1/manage/beaches/periodo-altro/bookings/${code}/payment-requests`, undefined, 'altro')).status).toBe(404);
    // E non prenota per periodo fuori dal suo recinto; la contabilità mai.
    expect((await call('POST', `${manage}/desk-bookings`, { spotId: beach.spotIds[1], day: day[0], to: day[2], guestName: 'Alieno' }, 'altro')).status).toBe(403);
    expect((await call('POST', `${manage}/desk-bookings`, { spotId: beach.spotIds[1], day: day[0], to: day[2], guestName: 'Conta Bile' }, 'accounting')).status).toBe(403);
  });
});
