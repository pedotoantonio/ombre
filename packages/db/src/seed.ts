import pg from 'pg';
import { demoImage, type DemoMediaId, type Locale, type SiteContent, type SiteTexts } from '@ombre/shared';
import { setAmenities } from './amenities';
import { connect } from './client';
import { addElement } from './layout';
import type { Actor } from './manage';
import { assignZoneToRow, createZone } from './zones';

export const demoBeach = {
  slug: 'bagno-delle-dune',
  name: 'Bagno delle Dune',
  locality: 'Lido di Pomposa',
  // Plausible but demonstrative coordinates, declared as sample data in docs/demo.md.
  latitude: 44.7131,
  longitude: 12.2421,
  day: '2027-06-17',
  priceCents: 3000,
  promoCode: 'MARE10',
} as const;

export const demoHolderEmail = 'stagionale@bagnodelledune.example';

export const demoAccounts = [
  { email: 'gestore@bagnodelledune.example', name: 'Gestore dimostrativo', role: 'manager' },
  { email: 'reception@bagnodelledune.example', name: 'Reception dimostrativa', role: 'reception' },
  { email: 'contabilita@bagnodelledune.example', name: 'Contabilità dimostrativa', role: 'accounting' },
] as const;

/**
 * Fictional beach club used across the project documents: spots A01-A04 and B01-B04
 * on 17 June 2027 at 30.00 euro, with the MARE10 promotion. Marked as demo data.
 */
// The seeded website of the demo beach club: cover and gallery from the demo
// library (real photographs since D43), fictional texts matching the smoke data.
function demoSiteTexts(locale: Locale): SiteTexts {
  const gallery: DemoMediaId[] = ['riva', 'passerella', 'ombrelloni', 'docce', 'chiosco', 'tramonto'];
  const images = { cover: demoImage('dune', locale), gallery: gallery.map((id) => demoImage(id, locale)) };
  if (locale === 'en') {
    return {
      tagline: 'Fine sand between the pine wood and the sea',
      description:
        'Bagno delle Dune is a fictional, family-run beach club created to try the system: fine sand, a pine wood behind and two rows of umbrellas. Every name, price and picture here is sample data.',
      services: ['Bar', 'Hot showers', 'Play area'],
      openingPeriod: 'From 15 May to 20 September',
      openingHours: 'Every day from 8:30 to 19:30',
      address: 'Viale Mare Adriatico 1, Lido di Pomposa (fictional address)',
      phone: '+39 000 000 0000',
      accessibility: 'Walkway to the first row and beach wheelchair on request.',
      images,
    };
  }
  return {
    tagline: 'Sabbia fine tra la pineta e il mare',
    description:
      'Il Bagno delle Dune è uno stabilimento di fantasia a conduzione familiare, creato per provare il sistema: sabbia fine, la pineta alle spalle e due file di ombrelloni. Nomi, prezzi e immagini sono dati di esempio.',
    services: ['Bar e ristoro', 'Docce calde', 'Area giochi'],
    openingPeriod: 'Dal 15 maggio al 20 settembre',
    openingHours: 'Tutti i giorni dalle 8:30 alle 19:30',
    address: 'Viale Mare Adriatico 1, Lido di Pomposa (indirizzo di fantasia)',
    phone: '+39 000 000 0000',
    accessibility: 'Passerella fino alla prima fila e sedia da mare su richiesta.',
    images,
  };
}

export async function seedDemo(adminUrl: string): Promise<{ beachId: string }> {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query('BEGIN');
    const beach = await client.query<{ id: string }>(
      `INSERT INTO beach (slug, name, locality, status, demo, latitude, longitude) VALUES ($1, $2, $3, 'active', true, $4, $5)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude RETURNING id`,
      [demoBeach.slug, demoBeach.name, demoBeach.locality, demoBeach.latitude, demoBeach.longitude],
    );
    const beachId = beach.rows[0]!.id;
    for (const [rowIndex, letter] of ['A', 'B'].entries()) {
      for (let number = 1; number <= 4; number += 1) {
        const code = `${letter}0${number}`;
        const spot = await client.query<{ id: string }>(
          `INSERT INTO spot (beach_id, code, row_number) VALUES ($1, $2, $3)
           ON CONFLICT (beach_id, code) DO UPDATE SET row_number = EXCLUDED.row_number RETURNING id`,
          [beachId, code, rowIndex + 1],
        );
        await client.query(
          `INSERT INTO inventory_day (beach_id, spot_id, day, state, price_cents, shared)
           VALUES ($1, $2, $3, 'available', $4, $5) ON CONFLICT (beach_id, spot_id, day) DO NOTHING`,
          [beachId, spot.rows[0]!.id, demoBeach.day, demoBeach.priceCents, false],
        );
      }
    }
    await client.query(
      `INSERT INTO promotion (beach_id, code, percent_bps) VALUES ($1, $2, 1000)
       ON CONFLICT (beach_id, code) DO NOTHING`,
      [beachId, demoBeach.promoCode],
    );
    // B02 is the shared spot of the project example: a season pass, an approved day.
    const holder = await client.query<{ id: string }>(
      `INSERT INTO app_user (email, name, password_hash) VALUES ($1, 'Stagionale dimostrativo', crypt(gen_random_uuid()::text, gen_salt('bf', 6)))
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [demoHolderEmail],
    );
    const shared = await client.query<{ id: string }>("SELECT id FROM spot WHERE beach_id = $1 AND code = 'B02'", [beachId]);
    const spotId = shared.rows[0]!.id;
    let contract = await client.query<{ id: string }>('SELECT id FROM season_contract WHERE spot_id = $1', [spotId]);
    if (contract.rowCount === 0) {
      contract = await client.query<{ id: string }>(
        "INSERT INTO season_contract (beach_id, holder_user_id, spot_id, valid_from, valid_to) VALUES ($1, $2, $3, '2027-05-01', '2027-09-30') RETURNING id",
        [beachId, holder.rows[0]!.id, spotId],
      );
    }
    const contractId = contract.rows[0]!.id;
    await client.query(
      `INSERT INTO availability_proposal (beach_id, contract_id, day, status, decided_at) VALUES ($1, $2, $3, 'approved', now())
       ON CONFLICT (contract_id, day) DO NOTHING`,
      [beachId, contractId, demoBeach.day],
    );
    await client.query(
      "UPDATE inventory_day SET shared = true, contract_id = $1 WHERE spot_id = $2 AND day = $3 AND contract_id IS NULL",
      [contractId, spotId, demoBeach.day],
    );
    await client.query('UPDATE beach SET shared_price_cents = $2 WHERE id = $1 AND shared_price_cents IS NULL', [beachId, demoBeach.priceCents]);
    // The published website with cover and gallery (D43). The manager account is
    // created here with a random password: sign-in comes when a demo password is set.
    const manager = demoAccounts.find((account) => account.role === 'manager')!;
    const managerUser = await client.query<{ id: string }>(
      `INSERT INTO app_user (email, name, password_hash) VALUES ($1, $2, crypt(gen_random_uuid()::text, gen_salt('bf', 6)))
       ON CONFLICT (email) DO UPDATE SET name = app_user.name RETURNING id`,
      [manager.email, manager.name],
    );
    // The manager's membership lives in the seed: the amenities and the zone
    // below are set through the product's functions, which check it.
    await client.query("INSERT INTO membership (user_id, beach_id, role) VALUES ($1, $2, 'manager') ON CONFLICT DO NOTHING", [managerUser.rows[0]!.id, beachId]);
    const siteContent: SiteContent = { it: demoSiteTexts('it'), en: demoSiteTexts('en') };
    await client.query(
      `INSERT INTO site_revision (beach_id, number, status, template, content, created_by, published_at)
       SELECT $1, 1, 'published', 'boutique', $2, $3, now()
       WHERE NOT EXISTS (SELECT 1 FROM site_revision WHERE beach_id = $1)`,
      [beachId, JSON.stringify(siteContent), managerUser.rows[0]!.id],
    );
    // Illustrative percentages from the project documents: 50 / 40 / 10.
    await client.query(
      `INSERT INTO split_rule (beach_id, season_holder_bps, beach_club_bps, platform_bps)
       SELECT $1, 5000, 4000, 1000 WHERE NOT EXISTS (SELECT 1 FROM split_rule WHERE beach_id = $1)`,
      [beachId],
    );
    await client.query('COMMIT');

    // Amenities (D49) and the named zone «Prima fila» (D50), through the
    // product's own functions as the manager, like the showcase scenario does.
    const app = connect(adminUrl, { role: 'ombre_app', max: 2 });
    try {
      const actor: Actor = { userId: managerUser.rows[0]!.id, beachId, role: 'manager' };
      await setAmenities(app.db, actor, { amenities: ['bar', 'hot_showers', 'accessible', 'wifi', 'cabins'] });
      const zones = await client.query('SELECT 1 FROM beach_zone WHERE beach_id = $1', [beachId]);
      if (zones.rowCount === 0) {
        const primaFila = await createZone(app.db, actor, { name: 'Prima fila' });
        await assignZoneToRow(app.db, actor, { zone: 'ombrelloni', rowNumber: 1, zoneId: primaFila.zoneId });
      }
      // A sober scene (D55), drawn once: the dune of the name with its vegetation
      // behind the umbrellas, the lifeguard tower by the water. The cells sit off
      // the ones the test suites draw on and inside the four columns of the rows,
      // so the demo drawing never collides and never widens.
      const drawn = await client.query('SELECT 1 FROM layout_element WHERE beach_id = $1', [beachId]);
      if (drawn.rowCount === 0) {
        await addElement(app.db, actor, { kind: 'decoration', sign: 'torretta', zone: 'riva', rowNumber: 1, colStart: 4 });
        await addElement(app.db, actor, { kind: 'decoration', sign: 'duna', zone: 'monte', rowNumber: 3, colStart: 2 });
        await addElement(app.db, actor, { kind: 'decoration', sign: 'vegetazione', zone: 'monte', rowNumber: 3, colStart: 3 });
      }
    } finally {
      await app.close();
    }
    return { beachId };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}
