import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  acquireHold,
  applyPaymentOutcome,
  assignZoneToRow,
  assignZoneToSpot,
  checkAccess,
  createZone,
  deleteZone,
  DomainError,
  listActiveBeaches,
  listAmenities,
  listAvailability,
  listMyBookings,
  listZones,
  relinkBookings,
  renameZone,
  searchBeaches,
  setAmenities,
  startCheckout,
  upsertUser,
  type Actor,
} from '../src/index';
import { createTestDatabase, insertBeach, testAdminUrl, type TestBeach, type TestDatabase } from '../src/testing';

const signingSecret = 'segreto-di-prova-lungo-almeno-32-caratteri';
const day = '2099-08-01';
const key = () => `test-${randomUUID()}`;

async function codeOf(work: () => Promise<unknown>): Promise<string> {
  try {
    await work();
    return 'no error';
  } catch (error) {
    return error instanceof DomainError ? error.code : `unexpected: ${String(error)}`;
  }
}

describe.skipIf(!testAdminUrl)('amenities and named zones on a real PostgreSQL (D49, D50)', () => {
  let database: TestDatabase;
  let dune: TestBeach;
  let altro: TestBeach;
  let manager: Actor;
  let altroManager: Actor;
  let today: string;

  beforeAll(async () => {
    database = await createTestDatabase(testAdminUrl!);
    dune = await insertBeach(database.admin, 'dune', { spots: 6, day });
    altro = await insertBeach(database.admin, 'altro', { spots: 2, day });
    const userId = await upsertUser(database.adminUrl, { email: 'gestore@example.org', name: 'Gea', password: 'password-di-prova-123' }, [
      { beachId: dune.beachId, role: 'manager' },
      { beachId: altro.beachId, role: 'manager' },
    ]);
    manager = { userId, beachId: dune.beachId, role: 'manager' };
    altroManager = { userId, beachId: altro.beachId, role: 'manager' };
    const clock = await database.admin.query<{ today: string }>("SELECT (now() at time zone 'Europe/Rome')::date::text AS today");
    today = clock.rows[0]!.today;
    // A sellable day today, for the pass verification at the entrance.
    await database.admin.query("INSERT INTO inventory_day (beach_id, spot_id, day, state, price_cents) VALUES ($1, $2, $3, 'available', 3000)", [
      dune.beachId,
      dune.spotIds[5]!,
      today,
    ]);
  });

  afterAll(async () => {
    await database?.drop();
  });

  const db = () => database.app.db;

  it('replaces the whole amenity set, validates against the catalogue and answers in catalogue order', async () => {
    await setAmenities(db(), manager, { amenities: ['wifi', 'bar'] });
    expect(await listAmenities(db(), dune.beachId)).toEqual(['bar', 'wifi']);

    // The replacement is whole: what is not sent any more disappears.
    const replaced = await setAmenities(db(), manager, { amenities: ['restaurant', 'wifi', 'bar'] });
    expect(replaced.amenities).toEqual(['bar', 'restaurant', 'wifi']);
    expect(await listAmenities(db(), dune.beachId)).toEqual(['bar', 'restaurant', 'wifi']);

    expect(await codeOf(() => setAmenities(db(), manager, { amenities: ['sauna'] }))).toBe('invalid_state');
    expect(await codeOf(() => setAmenities(db(), manager, { amenities: ['bar', 'bar'] }))).toBe('invalid_state');
    // The refused writes left the set as it was.
    expect(await listAmenities(db(), dune.beachId)).toEqual(['bar', 'restaurant', 'wifi']);
  });

  it('keeps only the clubs that offer ALL the requested amenities, in the list and in the search', async () => {
    await setAmenities(db(), altroManager, { amenities: ['bar'] });

    const all = await listActiveBeaches(db());
    expect(all.map((club) => [club.slug, club.amenities])).toEqual([
      ['altro', ['bar']],
      ['dune', ['bar', 'restaurant', 'wifi']],
    ]);

    expect((await listActiveBeaches(db(), undefined, ['bar'])).map((club) => club.slug)).toEqual(['altro', 'dune']);
    expect((await listActiveBeaches(db(), undefined, ['bar', 'wifi'])).map((club) => club.slug)).toEqual(['dune']);
    expect(await listActiveBeaches(db(), undefined, ['bar', 'playground'])).toEqual([]);

    const offers = await searchBeaches(db(), { day, amenities: ['bar', 'wifi'] });
    expect(offers.map((offer) => offer.slug)).toEqual(['dune']);
    expect(offers[0]!.freeSpots).toBeGreaterThan(0);
    expect(offers[0]!.amenities).toEqual(['bar', 'restaurant', 'wifi']);
  });

  it('creates, renames and refuses duplicate or malformed zone names', async () => {
    const created = await createZone(db(), manager, { name: '  Zona Relax  ' });
    expect(created.name).toBe('Zona Relax');

    await expect(createZone(db(), manager, { name: 'X' })).rejects.toThrow(RangeError);
    await expect(createZone(db(), manager, { name: 'Z'.repeat(41) })).rejects.toThrow(RangeError);
    expect(await codeOf(() => createZone(db(), manager, { name: 'Zona Relax' }))).toBe('invalid_state');

    await createZone(db(), manager, { name: 'Prima fila' });
    expect(await codeOf(() => renameZone(db(), manager, { zoneId: created.zoneId, name: 'Prima fila' }))).toBe('invalid_state');
    await renameZone(db(), manager, { zoneId: created.zoneId, name: 'Zona Famiglie' });
    expect((await listZones(db(), manager)).map((zone) => zone.name)).toEqual(['Zona Famiglie', 'Prima fila']);
  });

  it('applies the ceiling of 20 zones per beach club', async () => {
    for (let count = 1; count <= 20; count += 1) await createZone(db(), altroManager, { name: `Zona ${String(count).padStart(2, '0')}` });
    expect(await codeOf(() => createZone(db(), altroManager, { name: 'Zona 21' }))).toBe('cap_reached');
    // The other beach club is not affected by the neighbour's ceiling.
    expect((await listZones(db(), manager)).length).toBeLessThan(20);
  });

  it('assigns a zone per spot and per whole row, and the availability carries the name', async () => {
    const zones = await listZones(db(), manager);
    const famiglie = zones.find((zone) => zone.name === 'Zona Famiglie')!;
    const primaFila = zones.find((zone) => zone.name === 'Prima fila')!;

    // The whole row first (like the rental per row), then one spot apart.
    const rowed = await assignZoneToRow(db(), manager, { zone: 'ombrelloni', rowNumber: 1, zoneId: primaFila.zoneId });
    expect(rowed.updated).toBe(6);
    await assignZoneToSpot(db(), manager, { spotId: dune.spotIds[0]!, zoneId: famiglie.zoneId });
    await assignZoneToSpot(db(), manager, { spotId: dune.spotIds[1]!, zoneId: null });

    expect(await codeOf(() => assignZoneToSpot(db(), manager, { spotId: dune.spotIds[0]!, zoneId: randomUUID() }))).toBe('not_found');
    expect(await codeOf(() => assignZoneToRow(db(), manager, { zone: 'riva', rowNumber: 9, zoneId: null }))).toBe('not_found');

    const available = await listAvailability(db(), dune.beachId, day);
    const nameOf = new Map(available.map((place) => [place.code, place.zoneName]));
    expect(nameOf.get('A01')).toBe('Zona Famiglie');
    expect(nameOf.get('A02')).toBeNull();
    expect(nameOf.get('A03')).toBe('Prima fila');

    const counted = await listZones(db(), manager);
    expect(counted.find((zone) => zone.name === 'Zona Famiglie')!.spots).toBe(1);
    expect(counted.find((zone) => zone.name === 'Prima fila')!.spots).toBe(4);

    // Deleting the zone detaches its spot and nothing else: the FK sets NULL.
    const removed = await deleteZone(db(), manager, { zoneId: famiglie.zoneId });
    expect(removed.detachedSpots).toBe(1);
    const after = new Map((await listAvailability(db(), dune.beachId, day)).map((place) => [place.code, place.zoneName]));
    expect(after.get('A01')).toBeNull();
    expect(after.get('A03')).toBe('Prima fila');
    expect((await listZones(db(), manager)).map((zone) => zone.name)).toEqual(['Prima fila']);
  });

  it('shows the zone name in «Le mie prenotazioni» and at the entrance check', async () => {
    // A confirmed stay of an account owner on a zoned spot (A03, «Prima fila»)...
    const held = await acquireHold(db(), dune.beachId, { spotId: dune.spotIds[2]!, day, idempotencyKey: key(), ttlSeconds: 600 });
    const booked = await startCheckout(db(), dune.beachId, { holdId: held.holdId, guestName: 'Ada', guestEmail: 'ada@example.org' }, signingSecret);
    expect(await applyPaymentOutcome(db(), { provider: 'sandbox', eventId: randomUUID(), reference: booked.payment.reference, outcome: 'succeeded' })).toBe('confirmed');
    const ownerId = await upsertUser(database.adminUrl, { email: 'ada@example.org', name: 'Ada', password: 'password-di-prova-123' });
    await relinkBookings(db(), ownerId, 'ada@example.org');
    const mine = await listMyBookings(db(), ownerId, signingSecret);
    expect(mine.upcoming.map((group) => [group.spotCode, group.zoneName])).toEqual([['A03', 'Prima fila']]);

    // ...and a stay of TODAY on A06 («Prima fila» too), verified at the entrance.
    const todayHold = await acquireHold(db(), dune.beachId, { spotId: dune.spotIds[5]!, day: today, idempotencyKey: key(), ttlSeconds: 600 });
    const todayBooked = await startCheckout(db(), dune.beachId, { holdId: todayHold.holdId, guestName: 'Bice', guestEmail: 'bice@example.org' }, signingSecret);
    expect(await applyPaymentOutcome(db(), { provider: 'sandbox', eventId: randomUUID(), reference: todayBooked.payment.reference, outcome: 'succeeded' })).toBe('confirmed');
    const entered = await checkAccess(db(), manager, { credential: todayBooked.code, kind: 'entry' }, signingSecret);
    expect(entered.spotCode).toBe('A06');
    expect(entered.zoneName).toBe('Prima fila');
  });
});
