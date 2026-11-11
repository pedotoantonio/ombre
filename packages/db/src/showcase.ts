import pg from 'pg';
import { demoImage, type DemoMediaId, type Locale, type MembershipRole, type SiteContent, type SiteTexts } from '@ombre/shared';
import { applyPaymentOutcome, cancelByBeachClub, checkAccess, deskBooking, startCheckout } from './bookings';
import { connect } from './client';
import { acquireHold } from './inventory';
import { closeDay } from './ledger';
import type { Actor } from './manage';
import { demoAccounts, demoHolderEmail } from './seed';
import { decideProposal, listProposals, proposeDays } from './sharing';

/**
 * "Lido Aurora": a larger fictional beach club for demonstrations, with pictures, prices by
 * row, season passes, proposals waiting for the manager and bookings in every state.
 * Bookings are made through the same functions the product uses, so the money trail and
 * the presences are real results, not rows written by hand.
 */
export const showcaseBeach = { slug: 'lido-aurora', name: 'Lido Aurora', locality: 'Marina Azzurra' } as const;

export const showcaseHolders = [
  { email: 'anna@lidoaurora.example', name: 'Anna Riva' },
  { email: 'bruno@lidoaurora.example', name: 'Bruno Sala' },
] as const;

const rows = [
  { letter: 'A', priceCents: 4500, sunbeds: 2, maxGuests: 2 },
  { letter: 'B', priceCents: 4000, sunbeds: 2, maxGuests: 2 },
  { letter: 'C', priceCents: 3500, sunbeds: 2, maxGuests: 2 },
  { letter: 'D', priceCents: 3000, sunbeds: 3, maxGuests: 3 },
  { letter: 'E', priceCents: 2800, sunbeds: 4, maxGuests: 4 },
] as const;
const spotsPerRow = 8;
const publishedDays = 21;

function addDays(day: string, amount: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function siteTexts(locale: Locale): SiteTexts {
  const gallery: DemoMediaId[] = ['ombrelloni', 'chiosco', 'passerella', 'giochi', 'docce', 'riva', 'tramonto'];
  const images = { cover: demoImage('copertina', locale), gallery: gallery.map((id) => demoImage(id, locale)) };
  if (locale === 'en') {
    return {
      tagline: 'Five rows of umbrellas between the pine wood and the sea',
      description:
        'Lido Aurora is a fictional beach club created to try the system: forty spots in five rows, a bar, a play area and a walkway to the first row. Every name, price and picture here is sample data.',
      services: ['Bar and light lunch', 'Hot showers and cabins', 'Play area', 'Walkway to the first row', 'Free wifi'],
      openingPeriod: 'From 15 May to 20 September',
      openingHours: 'Every day from 8:30 to 19:30',
      address: 'Lungomare delle Onde 12, Marina Azzurra (fictional place)',
      phone: '+39 000 000 0000',
      accessibility: 'Walkway across the sand to the first row, beach wheelchair on request, accessible toilet next to the bar.',
      images,
    };
  }
  return {
    tagline: 'Cinque file di ombrelloni tra la pineta e il mare',
    description:
      'Lido Aurora è uno stabilimento di fantasia creato per provare il sistema: quaranta postazioni in cinque file, un chiosco, un\'area giochi e una passerella fino alla prima fila. Nomi, prezzi e immagini sono dati di esempio.',
    services: ['Bar e pranzi leggeri', 'Docce calde e cabine', 'Area giochi', 'Passerella fino alla prima fila', 'Wifi gratuito'],
    openingPeriod: 'Dal 15 maggio al 20 settembre',
    openingHours: 'Tutti i giorni dalle 8:30 alle 19:30',
    address: 'Lungomare delle Onde 12, Marina Azzurra (località di fantasia)',
    phone: '+39 000 000 0000',
    accessibility: 'Passerella sulla sabbia fino alla prima fila, sedia da mare su richiesta, bagno accessibile accanto al chiosco.',
    images,
  };
}

async function ensureUser(client: pg.Client, email: string, name: string): Promise<string> {
  // A random password nobody knows: sign-in becomes possible only when a demo password is set afterwards.
  const result = await client.query<{ id: string }>(
    `INSERT INTO app_user (email, name, password_hash) VALUES ($1, $2, crypt(gen_random_uuid()::text, gen_salt('bf', 6)))
     ON CONFLICT (email) DO UPDATE SET name = app_user.name RETURNING id`,
    [email, name],
  );
  return result.rows[0]!.id;
}

export async function seedShowcase(adminUrl: string, signingSecret: string): Promise<{ created: boolean; beachId: string }> {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  // The scenario runs as the restricted application role: the same rules as the real product.
  const app = connect(adminUrl, { role: 'ombre_app', max: 4 });
  try {
    const existing = await client.query<{ id: string }>('SELECT id FROM beach WHERE slug = $1', [showcaseBeach.slug]);
    if (existing.rows[0]) return { created: false, beachId: existing.rows[0].id };

    const clock = await client.query<{ today: string }>("SELECT (now() AT TIME ZONE 'Europe/Rome')::date::text AS today");
    const today = clock.rows[0]!.today;
    const day = (offset: number) => addDays(today, offset);

    // ---- Fixed data: beach club, spots, calendar, promotions, people, website ----
    await client.query('BEGIN');
    const beach = await client.query<{ id: string }>(
      `INSERT INTO beach (slug, name, locality, status, demo, daily_shared_cap, shared_price_cents)
       VALUES ($1, $2, $3, 'active', true, 6, 3200) RETURNING id`,
      [showcaseBeach.slug, showcaseBeach.name, showcaseBeach.locality],
    );
    const beachId = beach.rows[0]!.id;

    const spots: Record<string, string> = {};
    const prices: Record<string, number> = {};
    for (const [index, row] of rows.entries()) {
      for (let number = 1; number <= spotsPerRow; number += 1) {
        const code = `${row.letter}${String(number).padStart(2, '0')}`;
        const spot = await client.query<{ id: string }>(
          'INSERT INTO spot (beach_id, code, row_number, umbrellas, sunbeds, max_guests) VALUES ($1, $2, $3, 1, $4, $5) RETURNING id',
          [beachId, code, index + 1, row.sunbeds, row.maxGuests],
        );
        spots[code] = spot.rows[0]!.id;
        prices[code] = row.priceCents;
      }
    }
    const publish = (code: string, onDay: string) =>
      client.query(
        "INSERT INTO inventory_day (beach_id, spot_id, day, state, price_cents) VALUES ($1, $2, $3, 'available', $4) ON CONFLICT (beach_id, spot_id, day) DO NOTHING",
        [beachId, spots[code], onDay, prices[code]],
      );
    for (let offset = 0; offset < publishedDays; offset += 1) {
      for (const code of Object.keys(spots)) await publish(code, day(offset));
    }
    // A spot under maintenance today and tomorrow.
    await client.query("UPDATE inventory_day SET state = 'blocked' WHERE spot_id = $1 AND day = ANY($2::date[])", [spots.A08, [day(0), day(1)]]);

    await client.query(
      `INSERT INTO promotion (beach_id, code, percent_bps, active, max_uses) VALUES
       ($1, 'MARE10', 1000, true, NULL), ($1, 'ESTATE5', 500, true, 20), ($1, 'AUTUNNO15', 1500, false, NULL)`,
      [beachId],
    );
    await client.query('INSERT INTO split_rule (beach_id, season_holder_bps, beach_club_bps, platform_bps) VALUES ($1, 5000, 4000, 1000)', [beachId]);

    const staff: Partial<Record<MembershipRole, string>> = {};
    for (const account of demoAccounts) {
      const userId = await ensureUser(client, account.email, account.name);
      staff[account.role] = userId;
      await client.query('INSERT INTO membership (user_id, beach_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [userId, beachId, account.role]);
    }
    const anna = await ensureUser(client, showcaseHolders[0].email, showcaseHolders[0].name);
    const bruno = await ensureUser(client, showcaseHolders[1].email, showcaseHolders[1].name);
    const carla = await ensureUser(client, demoHolderEmail, 'Stagionale dimostrativo');

    const contracts: Record<string, { id: string; holder: string }> = {};
    for (const [code, holder, mode] of [
      ['B03', anna, 'per_day'],
      ['B04', anna, 'automatic'],
      ['C02', bruno, 'per_day'],
      ['C05', bruno, 'per_day'],
      ['D01', carla, 'per_day'],
      ['D06', carla, 'automatic'],
    ] as const) {
      const contract = await client.query<{ id: string }>(
        'INSERT INTO season_contract (beach_id, holder_user_id, spot_id, valid_from, valid_to, sharing_mode) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [beachId, holder, spots[code], day(-30), day(120), mode],
      );
      contracts[code] = { id: contract.rows[0]!.id, holder };
    }

    const content: SiteContent = { it: siteTexts('it'), en: siteTexts('en') };
    await client.query(
      "INSERT INTO site_revision (beach_id, number, status, template, content, created_by, published_at) VALUES ($1, 1, 'published', 'riviera', $2, $3, now())",
      [beachId, JSON.stringify(content), staff.manager],
    );
    await client.query('COMMIT');

    // ---- Scenario, through the product's own functions ----
    const db = app.db;
    const manager: Actor = { userId: staff.manager!, beachId, role: 'manager' };
    const reception: Actor = { userId: staff.reception!, beachId, role: 'reception' };

    const propose = (code: string, offsets: number[]) => proposeDays(db, contracts[code]!.holder, contracts[code]!.id, offsets.map(day));
    await propose('B03', [1, 2, 3, 8]);
    await propose('B04', [1, 4, 15]);
    await propose('C02', [0, 2, 5]);
    await propose('C05', [6, 7]);
    await propose('D01', [1]);
    await propose('D06', [2, 3]);

    const waiting = await listProposals(db, manager, 'proposed');
    const decide = async (code: string, offset: number, approve: boolean) => {
      const proposal = waiting.find((row) => row.spotCode === code && row.day === day(offset));
      if (proposal) await decideProposal(db, manager, proposal.proposalId, { approve });
    };
    await decide('B03', 1, true);
    await decide('B03', 2, true);
    await decide('B03', 8, false);
    await decide('C02', 0, true);
    await decide('C02', 2, true);
    await decide('D01', 1, true);

    const book = async (code: string, offset: number, guestName: string, options: { promo?: string; locale?: Locale; pay?: boolean } = {}) => {
      const onDay = day(offset);
      const held = await acquireHold(db, beachId, { spotId: spots[code]!, day: onDay, promoCode: options.promo, idempotencyKey: `showcase-${code}-${onDay}`, ttlSeconds: 900 });
      const email = `${guestName.toLowerCase().replace(/[^a-z]+/g, '.')}@example.org`;
      const started = await startCheckout(db, beachId, { holdId: held.holdId, guestName, guestEmail: email, locale: options.locale ?? 'it' }, signingSecret);
      if (options.pay !== false) {
        await applyPaymentOutcome(db, { provider: 'sandbox', eventId: `showcase-${started.bookingId}`, reference: started.payment.reference, outcome: 'succeeded' });
      }
      return started;
    };
    const scan = (code: string, kind: 'entry' | 'exit') => checkAccess(db, reception, { credential: code, kind }, signingSecret);

    // Today: guests already on the beach, one who stepped out, one booked at the desk.
    const giulia = await book('A01', 0, 'Giulia Bianchi', { promo: 'MARE10' });
    const marco = await book('A02', 0, 'Marco Verdi');
    await book('C02', 0, 'Elena Neri');
    await book('B01', 0, 'Paul Smith', { locale: 'en' });
    const desk = await deskBooking(db, reception, { spotId: spots.D03!, day: day(0), guestName: 'Famiglia Costa' }, signingSecret);
    await scan(giulia.code, 'entry');
    await scan(marco.code, 'entry');
    await scan(marco.code, 'exit');
    await scan(desk.code, 'entry');

    // Next days: ordinary and shared sales, one cancelled by the beach club, one waiting for payment.
    await book('A03', 1, 'Sara Greco');
    await book('B03', 1, 'Luca Ferri', { promo: 'ESTATE5' });
    await book('C01', 1, 'Chiara Rossi');
    const cancelled = await book('A06', 1, 'Davide Conti');
    await cancelByBeachClub(db, manager, { code: cancelled.code, reason: 'Prova di annullamento per maltempo' });
    await book('B03', 2, 'Irene Sala');
    await book('A05', 2, 'Tommaso Riva');
    await book('A04', 3, 'Marta Leone', { pay: false });

    // Past days, to show completed bookings and accrued shares: sold on far days, then moved back.
    const history: [string, number, number, string][] = [
      ['E01', 15, -1, 'Nicola Bruno'],
      ['E02', 15, -1, 'Laura Gatti'],
      ['B04', 15, -1, 'Simone Fabbri'],
      ['E03', 16, -2, 'Alice Marino'],
      ['E04', 16, -2, 'Fabio Testa'],
    ];
    const sequence = new Map<string, number>();
    for (const [code, soldOn, movedTo, guestName] of history) {
      const sold = await book(code, soldOn, guestName);
      const past = day(movedTo);
      const next = (sequence.get(past) ?? 0) + 1;
      sequence.set(past, next);
      await client.query('UPDATE inventory_day SET day = $1 WHERE spot_id = $2 AND day = $3', [past, spots[code], day(soldOn)]);
      await client.query('UPDATE availability_proposal SET day = $1 WHERE contract_id = $2 AND day = $3', [past, contracts[code]?.id ?? null, day(soldOn)]);
      await client.query('UPDATE booking SET code = $1 WHERE id = $2', [`OM-${past.slice(2).replaceAll('-', '')}-${String(next).padStart(3, '0')}`, sold.bookingId]);
      await publish(code, day(soldOn));
    }
    await closeDay(db, beachId, day(-1));
    await closeDay(db, beachId, day(-2));

    return { created: true, beachId };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await app.close();
    await client.end();
  }
}
