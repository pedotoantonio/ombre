import pg from 'pg';
import { demoImage, type DemoMediaId, type Locale, type MembershipRole, type SiteContent, type SiteTexts } from '@ombre/shared';
import { relinkBookings } from './account';
import { setAmenities } from './amenities';
import { applyPaymentOutcome, cancelByBeachClub, checkAccess, deskBooking, startCheckout } from './bookings';
import { assignCabin, createCabin, decideSublet, proposeSublet } from './cabins';
import { connect, type Database } from './client';
import { acquireHold } from './inventory';
import { addElement, addSpot, updateSpot } from './layout';
import { closeDay } from './ledger';
import { publishDay, type Actor } from './manage';
import { createReview, replyToReview } from './reviews';
import { demoAccounts, demoHolderEmail } from './seed';
import { setCancellationPolicy, setPaymentSettings } from './settings';
import { decideProposal, listProposals, proposeDays } from './sharing';
import { createSpotType, listSpotTypes, updateSpotType } from './spot-types';
import { setTypeCard } from './type-cards';
import { assignZoneToRow, createZone } from './zones';

/**
 * "Lido Aurora": a larger fictional beach club for demonstrations, with pictures, prices by
 * row, season passes, proposals waiting for the manager and bookings in every state.
 * Bookings are made through the same functions the product uses, so the money trail and
 * the presences are real results, not rows written by hand.
 */
export const showcaseBeach = {
  slug: 'lido-aurora',
  name: 'Lido Aurora',
  locality: 'Marina Azzurra',
  // Marina Azzurra is a fictional place: plausible coordinates on the Adriatic coast, sample data.
  latitude: 44.2618,
  longitude: 12.3519,
} as const;

export const showcaseHolders = [
  { email: 'anna@lidoaurora.example', name: 'Anna Riva' },
  { email: 'bruno@lidoaurora.example', name: 'Bruno Sala' },
] as const;

/** Demonstrative cabin holder: CAB1 is assigned to this account. */
export const showcaseCabinHolder = { email: 'cabina@lidoaurora.example', name: 'Titolare di cabina dimostrativo' } as const;

/** Demonstrative guest (D51): owns concluded stays at Lido Aurora and reviews them. */
export const showcaseGuest = { email: 'ospite@ombre.example', name: 'Ospite dimostrativo' } as const;

const rows = [
  { letter: 'A', priceCents: 4500, sunbeds: 2, maxGuests: 2 },
  { letter: 'B', priceCents: 4000, sunbeds: 2, maxGuests: 2 },
  { letter: 'C', priceCents: 3500, sunbeds: 2, maxGuests: 2 },
  { letter: 'D', priceCents: 3000, sunbeds: 3, maxGuests: 3 },
  { letter: 'E', priceCents: 2800, sunbeds: 4, maxGuests: 4 },
] as const;
const spotsPerRow = 8;
const publishedDays = 21;
// Single sunbeds by the shore and on the land side, published like every other spot.
const singleSunbeds = [
  { zone: 'riva', prefix: 'R', count: 6, priceCents: 1500 },
  { zone: 'monte', prefix: 'M', count: 4, priceCents: 1200 },
] as const;
// Sample rental annotations: a label is free text, "Stagionale" and "Albergo" are suggestions.
const sampleRentals = [
  { code: 'B03', rentalType: 'Stagionale', rentalNotes: null },
  { code: 'A07', rentalType: 'Albergo', rentalNotes: 'Convenzione con l\'Hotel Gabbiano (dato di esempio)' },
  { code: 'E05', rentalType: 'Animazione bimbi', rentalNotes: 'Riservato al mini club nelle mattine di luglio (dato di esempio)' },
] as const;

function addDays(day: string, amount: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function siteTexts(locale: Locale): SiteTexts {
  // Six pictures: the gallery shows them in two or three columns, with no picture left alone.
  const gallery: DemoMediaId[] = ['ombrelloni', 'chiosco', 'passerella', 'giochi', 'docce', 'tramonto'];
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

/**
 * «Cala del Moro»: a small third beach club to show «caparra adesso, saldo al
 * lido» (D52) and its own cancellation terms (D53) — ten spots in two rows,
 * two weeks on sale, a minimal published website.
 */
export const calaBeach = {
  slug: 'cala-del-moro',
  name: 'Cala del Moro',
  locality: 'Porto Selvaggio',
  // Porto Selvaggio exists, the beach club does not: plausible Ionian coordinates, sample data.
  latitude: 40.1537,
  longitude: 17.9655,
} as const;

export const calaManagerEmail = 'gestore@caladelmoro.example';

const calaRows = [
  { letter: 'A', priceCents: 3500 },
  { letter: 'B', priceCents: 2800 },
] as const;
const calaSpotsPerRow = 5;
const calaPublishedDays = 14;

function calaSiteTexts(locale: Locale): SiteTexts {
  // A minimal site: the cover and three pictures from the demo library, nothing new.
  const gallery: DemoMediaId[] = ['tramonto', 'passerella', 'docce'];
  const images = { cover: demoImage('riva', locale), gallery: gallery.map((id) => demoImage(id, locale)) };
  if (locale === 'en') {
    return {
      tagline: 'A quiet cove, ten umbrellas and the sea',
      description:
        'Cala del Moro is a small fictional beach club created to try the deposit flow: ten spots in two rows over a quiet cove. Every name, price and picture here is sample data.',
      services: ['Beach bar', 'Parking'],
      openingPeriod: 'From 1 June to 15 September',
      openingHours: 'Every day from 9:00 to 19:00',
      address: 'Baia di Porto Selvaggio 3, Porto Selvaggio (fictional address)',
      phone: '+39 000 000 0003',
      accessibility: 'A short path leads down to the sand; help on request.',
      images,
    };
  }
  return {
    tagline: 'Una cala tranquilla, dieci ombrelloni e il mare',
    description:
      'Cala del Moro è un piccolo stabilimento di fantasia creato per provare la caparra: dieci postazioni in due file su una cala tranquilla. Nomi, prezzi e immagini sono dati di esempio.',
    services: ['Chiosco bar', 'Parcheggio'],
    openingPeriod: 'Dal 1º giugno al 15 settembre',
    openingHours: 'Tutti i giorni dalle 9:00 alle 19:00',
    address: 'Baia di Porto Selvaggio 3, Porto Selvaggio (indirizzo di fantasia)',
    phone: '+39 000 000 0003',
    accessibility: 'Un breve sentiero scende fino alla sabbia; aiuto su richiesta.',
    images,
  };
}

/** Creates Cala del Moro once; guarded by its own slug, like the main showcase club. */
async function seedCalaDelMoro(client: pg.Client, db: Database): Promise<void> {
  const existing = await client.query('SELECT 1 FROM beach WHERE slug = $1', [calaBeach.slug]);
  if ((existing.rowCount ?? 0) > 0) return;

  const clock = await client.query<{ today: string }>("SELECT (now() AT TIME ZONE 'Europe/Rome')::date::text AS today");
  const today = clock.rows[0]!.today;

  // ---- Fixed data in one transaction: beach club, spots, calendar, manager, website ----
  await client.query('BEGIN');
  const beach = await client.query<{ id: string }>(
    `INSERT INTO beach (slug, name, locality, status, demo, latitude, longitude)
     VALUES ($1, $2, $3, 'active', true, $4, $5) RETURNING id`,
    [calaBeach.slug, calaBeach.name, calaBeach.locality, calaBeach.latitude, calaBeach.longitude],
  );
  const beachId = beach.rows[0]!.id;
  for (const [index, row] of calaRows.entries()) {
    for (let number = 1; number <= calaSpotsPerRow; number += 1) {
      const code = `${row.letter}${String(number).padStart(2, '0')}`;
      const created = await client.query<{ id: string }>(
        'INSERT INTO spot (beach_id, code, row_number, umbrellas, sunbeds, max_guests) VALUES ($1, $2, $3, 1, 2, 2) RETURNING id',
        [beachId, code, index + 1],
      );
      for (let offset = 0; offset < calaPublishedDays; offset += 1) {
        await client.query(
          "INSERT INTO inventory_day (beach_id, spot_id, day, state, price_cents) VALUES ($1, $2, $3::date + $4::int, 'available', $5)",
          [beachId, created.rows[0]!.id, today, offset, row.priceCents],
        );
      }
    }
  }
  // No season pass here, but a sale still splits between beach club and platform.
  await client.query('INSERT INTO split_rule (beach_id, season_holder_bps, beach_club_bps, platform_bps) VALUES ($1, 0, 9000, 1000)', [beachId]);
  // The manager account with a random password, like the demo seed: sign-in
  // would come only from a later, explicit password.
  const managerId = await ensureUser(client, calaManagerEmail, 'Gestore di Cala del Moro');
  await client.query("INSERT INTO membership (user_id, beach_id, role) VALUES ($1, $2, 'manager') ON CONFLICT DO NOTHING", [managerId, beachId]);
  const content: SiteContent = { it: calaSiteTexts('it'), en: calaSiteTexts('en') };
  await client.query(
    "INSERT INTO site_revision (beach_id, number, status, template, content, created_by, published_at) VALUES ($1, 1, 'published', 'boutique', $2, $3, now())",
    [beachId, JSON.stringify(content), managerId],
  );
  await client.query('COMMIT');

  // ---- Through the product's own functions, as the manager ----
  const actor: Actor = { userId: managerId, beachId, role: 'manager' };
  // «Caparra adesso, saldo al lido» (D52): 30% online, the rest at the beach.
  await setPaymentSettings(db, actor, { mode: 'deposit', depositPercent: 30 });
  // Its own cancellation terms (D53): 72 hours, with the club's short texts.
  await setCancellationPolicy(db, actor, {
    deadlineHours: 72,
    policyIt: 'Annullamento gratuito fino a 72 ore prima del giorno di arrivo; oltre, la caparra non viene restituita.',
    policyEn: 'Free cancellation up to 72 hours before the arrival day; after that, the deposit is not returned.',
  });
  await setAmenities(db, actor, { amenities: ['bar', 'parking', 'hot_showers', 'wifi'] });
  const primaFila = await createZone(db, actor, { name: 'Prima fila' });
  await assignZoneToRow(db, actor, { zone: 'ombrelloni', rowNumber: 1, zoneId: primaFila.zoneId });
  // Three touches of scene, so the public drawing of the cove is not bare (D55):
  // the flag by the water, a palm and the shower behind the umbrellas.
  await addElement(db, actor, { kind: 'decoration', sign: 'bandiera', zone: 'riva', rowNumber: 1, colStart: 2 });
  await addElement(db, actor, { kind: 'decoration', sign: 'palma', zone: 'monte', rowNumber: 1, colStart: 1 });
  await addElement(db, actor, { kind: 'decoration', sign: 'doccia', zone: 'monte', rowNumber: 1, colStart: 4 });
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
    // The small club with the deposit first, behind its own guard: it exists
    // even when Lido Aurora is already there from an earlier run.
    await seedCalaDelMoro(client, app.db);

    const existing = await client.query<{ id: string }>('SELECT id FROM beach WHERE slug = $1', [showcaseBeach.slug]);
    if (existing.rows[0]) return { created: false, beachId: existing.rows[0].id };

    const clock = await client.query<{ today: string }>("SELECT (now() AT TIME ZONE 'Europe/Rome')::date::text AS today");
    const today = clock.rows[0]!.today;
    const day = (offset: number) => addDays(today, offset);

    // ---- Fixed data: beach club, spots, calendar, promotions, people, website ----
    await client.query('BEGIN');
    const beach = await client.query<{ id: string }>(
      `INSERT INTO beach (slug, name, locality, status, demo, daily_shared_cap, shared_price_cents, latitude, longitude, shore_gap_rows, land_gap_rows)
       VALUES ($1, $2, $3, 'active', true, 6, 3200, $4, $5, 1, 2) RETURNING id`,
      [showcaseBeach.slug, showcaseBeach.name, showcaseBeach.locality, showcaseBeach.latitude, showcaseBeach.longitude],
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
    // Shore sunbeds R01-R06 one empty row from the umbrellas, land sunbeds M01-M04 two away.
    for (const group of singleSunbeds) {
      for (let number = 1; number <= group.count; number += 1) {
        const code = `${group.prefix}${String(number).padStart(2, '0')}`;
        const spot = await client.query<{ id: string }>(
          "INSERT INTO spot (beach_id, code, row_number, umbrellas, sunbeds, max_guests, zone) VALUES ($1, $2, 1, 0, 1, 1, $3) RETURNING id",
          [beachId, code, group.zone],
        );
        spots[code] = spot.rows[0]!.id;
        prices[code] = group.priceCents;
      }
    }
    for (const rental of sampleRentals) {
      await client.query('UPDATE spot SET rental_type = $3, rental_notes = $4 WHERE beach_id = $1 AND code = $2', [beachId, rental.code, rental.rentalType, rental.rentalNotes]);
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
    const cabinHolderId = await ensureUser(client, showcaseCabinHolder.email, showcaseCabinHolder.name);
    await client.query("INSERT INTO membership (user_id, beach_id, role) VALUES ($1, $2, 'cabin_holder') ON CONFLICT DO NOTHING", [cabinHolderId, beachId]);

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

    // Amenities (D49) from the fixed catalogue and named zones (D50): «Prima fila»
    // on row A, «Vicino al bar» on the land-side sunbeds next to the drawn Bar,
    // «Area famiglie» on row E, the one with the most sunbeds.
    await setAmenities(db, manager, { amenities: ['bar', 'restaurant', 'parking', 'hot_showers', 'playground', 'pets', 'wifi', 'lifeguard'] });
    const primaFila = await createZone(db, manager, { name: 'Prima fila' });
    await assignZoneToRow(db, manager, { zone: 'ombrelloni', rowNumber: 1, zoneId: primaFila.zoneId });
    const vicinoAlBar = await createZone(db, manager, { name: 'Vicino al bar' });
    await assignZoneToRow(db, manager, { zone: 'monte', rowNumber: 1, zoneId: vicinoAlBar.zoneId });
    const areaFamiglie = await createZone(db, manager, { name: 'Area famiglie' });
    await assignZoneToRow(db, manager, { zone: 'ombrelloni', rowNumber: 5, zoneId: areaFamiglie.zoneId });

    // The drawing: a central vertical walkway, a horizontal one after row C,
    // the bar on the land side and a block of four sea cabins.
    await addElement(db, manager, { kind: 'walkway', orientation: 'vertical', colStart: 4 });
    await addElement(db, manager, { kind: 'walkway', orientation: 'horizontal', zone: 'ombrelloni', rowAfter: 3, colStart: 1, colEnd: 8 });
    await addElement(db, manager, { kind: 'structure', label: 'Bar', zone: 'monte', rowNumber: 1, colStart: 6, colEnd: 7 });
    const block = await addElement(db, manager, { kind: 'cabin_block', label: 'Cabine', zone: 'monte', rowNumber: 2, colStart: 1, colEnd: 4 });
    // Decorations from the client's boards (D35): the scene the demo and the screenshots show.
    await addElement(db, manager, { kind: 'decoration', sign: 'palma', zone: 'monte', rowNumber: 1, colStart: 8 });
    await addElement(db, manager, { kind: 'decoration', sign: 'doccia', label: 'Docce', zone: 'monte', rowNumber: 2, colStart: 5 });
    await addElement(db, manager, { kind: 'decoration', sign: 'giochi', label: 'Area giochi', zone: 'monte', rowNumber: 2, colStart: 7 });
    await addElement(db, manager, { kind: 'decoration', sign: 'salvagente', zone: 'riva', rowNumber: 1, colStart: 7 });
    await addElement(db, manager, { kind: 'decoration', sign: 'bandiera', zone: 'riva', rowNumber: 1, colStart: 8 });
    // The new scenery of the beach-art language (D55/D58): the small craft pulled
    // up by the shore with the lifeguard tower, a pair of dunes with low vegetation
    // on the land side with the two courts, a litter bin beside each walkway.
    await addElement(db, manager, { kind: 'decoration', sign: 'pedalo', zone: 'riva', rowNumber: 2, colStart: 1 });
    await addElement(db, manager, { kind: 'decoration', sign: 'canoa', zone: 'riva', rowNumber: 2, colStart: 2 });
    await addElement(db, manager, { kind: 'decoration', sign: 'sup', zone: 'riva', rowNumber: 2, colStart: 3 });
    await addElement(db, manager, { kind: 'decoration', sign: 'torretta', zone: 'riva', rowNumber: 2, colStart: 6 });
    await addElement(db, manager, { kind: 'decoration', sign: 'cestino', zone: 'ombrelloni', rowNumber: 6, colStart: 4 });
    await addElement(db, manager, { kind: 'decoration', sign: 'cestino', zone: 'monte', rowNumber: 1, colStart: 5 });
    await addElement(db, manager, { kind: 'decoration', sign: 'duna', zone: 'monte', rowNumber: 3, colStart: 1 });
    await addElement(db, manager, { kind: 'decoration', sign: 'vegetazione', zone: 'monte', rowNumber: 3, colStart: 2 });
    await addElement(db, manager, { kind: 'decoration', sign: 'duna', zone: 'monte', rowNumber: 3, colStart: 3 });
    await addElement(db, manager, { kind: 'decoration', sign: 'beachvolley', label: 'Beach volley', zone: 'monte', rowNumber: 3, colStart: 5 });
    await addElement(db, manager, { kind: 'decoration', sign: 'bocce', label: 'Bocce', zone: 'monte', rowNumber: 3, colStart: 7 });
    // One land-side sunbed under maintenance (D56), through the real domain change
    // the planner's draft applies: drawn on every map, never bookable.
    await updateSpot(db, manager, { spotId: spots.M02!, maintenance: true });

    // Spot types: the builtin Gazebo gains a higher default price, and a custom
    // type with its mark from the fixed repertoire gets one spot.
    const types = await listSpotTypes(db, manager);
    const gazebo = types.find((type) => type.builtin && type.mark === 'gazebo');
    if (!gazebo) throw new Error('builtin gazebo type missing');
    await updateSpotType(db, manager, { typeId: gazebo.typeId, defaultPriceCents: 6000 });
    const tent = await createSpotType(db, manager, { name: 'Tenda araba', mark: 'tent', umbrellas: 0, sunbeds: 2, maxGuests: 3, defaultPriceCents: 5000 });
    const gazeboRow: string[] = [];
    for (const code of ['G01', 'G02'] as const) {
      const created = await addSpot(db, manager, { zone: 'ombrelloni', code, rowNumber: 6, typeId: gazebo.typeId });
      gazeboRow.push(created.spotId);
    }
    const tenda = await addSpot(db, manager, { zone: 'ombrelloni', code: 'T01', rowNumber: 6, typeId: tent.typeId });
    gazeboRow.push(tenda.spotId);
    // Published like the rest: each spot starts at its type's default price.
    for (let offset = 0; offset < publishedDays; offset += 1) {
      await publishDay(db, manager, { day: day(offset), priceCents: 3000, spotIds: gazeboRow });
    }

    // Custom type cards (D61, criterion 4): Lido Aurora curates three of its
    // cards — several photos from the sample library, its own texts, a couple
    // of details — while Bagno delle Dune and Cala del Moro keep the platform
    // defaults, so the seed itself shows the difference between the two levels.
    const umbrellaType = types.find((type) => type.builtin && type.mark === 'umbrella');
    const sunbedType = types.find((type) => type.builtin && type.mark === 'sunbed');
    if (!umbrellaType || !sunbedType) throw new Error('builtin umbrella or sunbed type missing');
    await setTypeCard(db, manager, {
      typeId: umbrellaType.typeId,
      content: {
        title: 'Gli ombrelloni dell\'Aurora',
        descriptionIt:
          'Quaranta ombrelloni in cinque file tra la pineta e la riva. Ogni postazione ha il suo ombrellone fisso con i lettini indicati nella dotazione; la passerella sulla sabbia arriva fino alla prima fila.',
        descriptionEn:
          'Forty umbrellas in five rows between the pine wood and the shore. Each spot has its own fixed umbrella with the sunbeds listed in its equipment; the walkway over the sand reaches the first row.',
        photos: [
          { id: 'tipo-umbrella', captionIt: 'Un ombrellone della prima fila', captionEn: 'An umbrella in the first row' },
          { id: 'ombrelloni', captionIt: 'Le cinque file viste dall\'alto', captionEn: 'The five rows seen from above' },
          { id: 'riva', captionIt: 'La riva davanti alla fila A', captionEn: 'The shore in front of row A' },
        ],
        details: [
          { labelIt: 'Distanza tra le file', labelEn: 'Distance between rows', valueIt: '2,5 metri', valueEn: '2.5 metres' },
          { labelIt: 'Cambio telo', labelEn: 'Towel change', valueIt: 'Ogni mattina, su richiesta al chiosco', valueEn: 'Every morning, on request at the kiosk' },
        ],
      },
    });
    await setTypeCard(db, manager, {
      typeId: sunbedType.typeId,
      content: {
        title: 'I lettini in riva',
        descriptionIt:
          'Sei lettini singoli sul bagnasciuga, davanti alla prima fila, e quattro sul lato della pineta vicino al chiosco. Senza ombrellone: l\'ombra non è compresa.',
        descriptionEn:
          'Six single sunbeds at the water\'s edge, in front of the first row, and four on the pine-wood side near the kiosk. No umbrella: shade is not included.',
        photos: [
          { id: 'tipo-sunbed', captionIt: 'Un lettino singolo davanti al mare', captionEn: 'A single sunbed facing the sea' },
          { id: 'riva', captionIt: 'Il bagnasciuga dei lettini in riva', captionEn: 'The water\'s edge by the shore sunbeds' },
        ],
        details: [
          { labelIt: 'Dove si trovano', labelEn: 'Where they are', valueIt: 'Sei in riva, quattro accanto al chiosco', valueEn: 'Six by the shore, four next to the kiosk' },
          { labelIt: 'Telo mare', labelEn: 'Beach towel', valueIt: 'Non compreso, a noleggio al chiosco', valueEn: 'Not included, for hire at the kiosk' },
        ],
      },
    });
    await setTypeCard(db, manager, {
      typeId: tent.typeId,
      content: {
        title: 'La tenda araba dell\'Aurora',
        descriptionIt:
          'Una sola tenda in fondo alla fila dei gazebo, con pareti di stoffa aperte verso il mare: due lettini all\'ombra e un angolo più riservato nelle ore centrali.',
        descriptionEn:
          'A single tent at the end of the gazebo row, with fabric walls open towards the sea: two sunbeds in the shade and a more private corner in the middle hours of the day.',
        photos: [
          { id: 'tipo-tent', captionIt: 'Le tende di stoffa davanti al mare', captionEn: 'The fabric tents facing the sea' },
          { id: 'dune', captionIt: 'Le dune dietro la fila dei gazebo', captionEn: 'The dunes behind the gazebo row' },
        ],
        details: [{ labelIt: 'Pareti laterali', labelEn: 'Side walls', valueIt: 'Si chiudono in caso di vento', valueEn: 'Closed when the wind picks up' }],
      },
    });

    // Sea cabins: CAB1 assigned to the holder with an account (an approved sublet
    // under way and a pending proposal), CAB2 to a holder without an account.
    const cabins: Record<string, string> = {};
    for (const code of ['CAB1', 'CAB2', 'CAB3', 'CAB4'] as const) {
      const created = await createCabin(db, manager, { code, elementId: block.elementId });
      cabins[code] = created.cabinId;
    }
    const cab1 = await assignCabin(db, manager, {
      cabinId: cabins.CAB1!,
      holderEmail: showcaseCabinHolder.email,
      holderName: showcaseCabinHolder.name,
      validFrom: day(-30),
      validTo: day(120),
    });
    const approved = await proposeSublet(db, cabinHolderId, { assignmentId: cab1.assignmentId, fromDay: day(-2), toDay: day(5), occupantName: 'Ospiti Lanzi (dato di esempio)' });
    await decideSublet(db, manager, approved.subletId, { approve: true });
    await proposeSublet(db, cabinHolderId, { assignmentId: cab1.assignmentId, fromDay: day(10), toDay: day(14), occupantName: 'Famiglia Esposito (dato di esempio)', occupantContact: '+39 000 000 0001' });
    await assignCabin(db, manager, {
      cabinId: cabins.CAB2!,
      holderName: 'Famiglia Marchetti (senza accesso, dato di esempio)',
      holderContact: '+39 000 000 0002',
      validFrom: day(-10),
      validTo: day(90),
    });

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

    const book = async (code: string, offset: number, guestName: string, options: { promo?: string; locale?: Locale; pay?: boolean; email?: string } = {}) => {
      const onDay = day(offset);
      const held = await acquireHold(db, beachId, { spotId: spots[code]!, day: onDay, promoCode: options.promo, idempotencyKey: `showcase-${code}-${onDay}`, ttlSeconds: 900 });
      const email = options.email ?? `${guestName.toLowerCase().replace(/[^a-z]+/g, '.')}@example.org`;
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
    // The last three stays belong to the demonstrative guest, who reviews them below (D51).
    const history: [string, number, number, string, string?][] = [
      ['E01', 15, -1, 'Nicola Bruno'],
      ['E02', 15, -1, 'Laura Gatti'],
      ['B04', 15, -1, 'Simone Fabbri'],
      ['E03', 16, -2, 'Alice Marino'],
      ['E04', 16, -2, 'Fabio Testa'],
      ['E05', 17, -1, showcaseGuest.name, showcaseGuest.email],
      ['E06', 18, -2, showcaseGuest.name, showcaseGuest.email],
      ['E07', 19, -3, showcaseGuest.name, showcaseGuest.email],
    ];
    const sequence = new Map<string, number>();
    const guestGroups: string[] = [];
    for (const [code, soldOn, movedTo, guestName, email] of history) {
      const sold = await book(code, soldOn, guestName, email ? { email } : {});
      const past = day(movedTo);
      const next = (sequence.get(past) ?? 0) + 1;
      sequence.set(past, next);
      await client.query('UPDATE inventory_day SET day = $1 WHERE spot_id = $2 AND day = $3', [past, spots[code], day(soldOn)]);
      await client.query('UPDATE availability_proposal SET day = $1 WHERE contract_id = $2 AND day = $3', [past, contracts[code]?.id ?? null, day(soldOn)]);
      const renamed = `OM-${past.slice(2).replaceAll('-', '')}-${String(next).padStart(3, '0')}`;
      // The code lives on the group (D38): the group and its day change together.
      await client.query('UPDATE booking_group SET code = $1 WHERE id = (SELECT group_id FROM booking WHERE id = $2)', [renamed, sold.bookingId]);
      await client.query('UPDATE booking SET code = $1 WHERE id = $2', [renamed, sold.bookingId]);
      await publish(code, day(soldOn));
      if (email) {
        const group = await client.query<{ group_id: string }>('SELECT group_id FROM booking WHERE id = $1', [sold.bookingId]);
        guestGroups.push(group.rows[0]!.group_id);
      }
    }
    await closeDay(db, beachId, day(-1));
    await closeDay(db, beachId, day(-2));
    await closeDay(db, beachId, day(-3));

    // Verified reviews (D51): the guest account takes its concluded stays by email,
    // the way a real registration relinks them, and reviews each one; the manager
    // answers the first. No flagged review here: the public showcase stays clean,
    // flagging is exercised by the test suites.
    const guestId = await ensureUser(client, showcaseGuest.email, showcaseGuest.name);
    await relinkBookings(db, guestId, showcaseGuest.email);
    const reviewTexts = [
      { rating: 5, body: 'Spiaggia curata e personale gentilissimo. La prima fila vale ogni centesimo: torneremo di sicuro.' },
      { rating: 4, body: 'Ombrelloni comodi e mare pulito; al chiosco un po’ di coda all’ora di pranzo.' },
      { rating: 4, body: 'Prenotazione semplice e pass subito sul telefono. Docce calde ottime.' },
    ] as const;
    for (const [index, entry] of reviewTexts.entries()) {
      const created = await createReview(db, { userId: guestId, groupId: guestGroups[index]!, rating: entry.rating, body: entry.body });
      if (index === 0) await replyToReview(db, manager, { reviewId: created.reviewId, reply: 'Grazie di cuore! Vi aspettiamo di nuovo in prima fila.' });
    }

    return { created: true, beachId };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await app.close();
    await client.end();
  }
}
