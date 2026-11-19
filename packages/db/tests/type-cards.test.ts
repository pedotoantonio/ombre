import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createSpotType,
  DomainError,
  getTypeCardPublic,
  listTypeCardsForManager,
  listTypeCardsPublic,
  resetTypeCard,
  setTypeCard,
  upsertUser,
  type Actor,
} from '../src/index';
import { createTestDatabase, insertBeach, testAdminUrl, type TestBeach, type TestDatabase } from '../src/testing';

const day = '2099-08-01';

async function codeOf(work: () => Promise<unknown>): Promise<string> {
  try {
    await work();
    return 'no error';
  } catch (error) {
    return error instanceof DomainError ? error.code : `unexpected: ${String(error)}`;
  }
}

describe.skipIf(!testAdminUrl)('spot type cards on a real PostgreSQL (D61)', () => {
  let database: TestDatabase;
  let conchiglia: TestBeach;
  let altro: TestBeach;
  let manager: Actor;
  let altroManager: Actor;
  let umbrellaTypeId: string;
  let gazeboTypeId: string;
  let daybedTypeId: string;

  beforeAll(async () => {
    database = await createTestDatabase(testAdminUrl!);
    conchiglia = await insertBeach(database.admin, 'conchiglia', { spots: 2, day });
    altro = await insertBeach(database.admin, 'altro-lido', { spots: 1, day });
    // A club that is not active: its cards are not public.
    await insertBeach(database.admin, 'chiuso', { spots: 1, day });
    await database.admin.query("UPDATE beach SET status = 'draft' WHERE slug = 'chiuso'");
    const userId = await upsertUser(database.adminUrl, { email: 'gestore@conchiglia.example', name: 'Gea', password: 'password-di-prova-123' }, [
      { beachId: conchiglia.beachId, role: 'manager' },
      { beachId: altro.beachId, role: 'manager' },
    ]);
    manager = { userId, beachId: conchiglia.beachId, role: 'manager' };
    altroManager = { userId, beachId: altro.beachId, role: 'manager' };
    const types = await database.admin.query<{ id: string; mark: string }>('SELECT id, mark FROM spot_type WHERE beach_id = $1', [conchiglia.beachId]);
    umbrellaTypeId = types.rows.find((row) => row.mark === 'umbrella')!.id;
    gazeboTypeId = types.rows.find((row) => row.mark === 'gazebo')!.id;
    // A custom type with a spot of its own: it appears in the public list too.
    daybedTypeId = (await createSpotType(database.app.db, manager, { name: 'Lettone Laguna', mark: 'daybed', umbrellas: 0, sunbeds: 0, maxGuests: 2 })).typeId;
    await database.admin.query('INSERT INTO spot (beach_id, code, row_number, type_id) VALUES ($1, $2, 2, $3)', [conchiglia.beachId, 'L01', daybedTypeId]);
  });

  afterAll(async () => {
    await database?.drop();
  });

  it('lists every type to the manager, with the default state, and only the used ones to the public', async () => {
    const mine = await listTypeCardsForManager(database.app.db, manager);
    expect(mine.map((type) => type.name)).toEqual(['Gazebo', 'Lettino singolo', 'Ombrellone', 'Lettone Laguna']);
    expect(mine.every((type) => type.content === null && !type.customized && type.updatedAt === null)).toBe(true);
    expect(mine.find((type) => type.name === 'Ombrellone')).toMatchObject({ mark: 'umbrella', spots: 2, builtin: true });

    // The declared choice: the public sees the types with at least one non-retired spot.
    const shown = await listTypeCardsPublic(database.app.db, 'conchiglia');
    expect(shown.map((type) => type.name)).toEqual(['Ombrellone', 'Lettone Laguna']);
    expect(shown[0]).toMatchObject({ typeId: umbrellaTypeId, mark: 'umbrella', umbrellas: 1, sunbeds: 2, maxGuests: 2, content: null, customized: false });
  });

  it('saves a card with audit, replaces it whole and resets it to the default', async () => {
    const content = {
      title: 'Ombrellone in prima fila',
      descriptionIt: 'Il nostro ombrellone classico, a pochi passi dal mare.',
      photos: [{ id: 'riva', captionIt: 'La riva davanti alle file' }, { id: 'ombrelloni' }],
      details: [{ labelIt: 'Ombra', valueIt: 'Dalle 9 alle 19' }],
    };
    const saved = await setTypeCard(database.app.db, manager, { typeId: umbrellaTypeId, content });
    expect(saved.content.title).toBe('Ombrellone in prima fila');

    const [shown] = (await listTypeCardsPublic(database.app.db, 'conchiglia')).filter((type) => type.typeId === umbrellaTypeId);
    expect(shown).toMatchObject({ customized: true, content: { title: 'Ombrellone in prima fila' } });
    expect(shown!.content!.photos).toHaveLength(2);

    // Saving again replaces the card whole: the photos are gone, the new title stays.
    await setTypeCard(database.app.db, manager, { typeId: umbrellaTypeId, content: { title: 'Solo il titolo' } });
    const replaced = await getTypeCardPublic(database.app.db, 'conchiglia', umbrellaTypeId);
    expect(replaced.content).toEqual({ title: 'Solo il titolo' });

    await resetTypeCard(database.app.db, manager, { typeId: umbrellaTypeId });
    expect((await getTypeCardPublic(database.app.db, 'conchiglia', umbrellaTypeId)).content).toBeNull();
    // Resetting a card that is already default audits nothing.
    await resetTypeCard(database.app.db, manager, { typeId: umbrellaTypeId });

    const trail = await database.admin.query<{ action: string; target: string }>("SELECT action, target FROM audit_event WHERE action LIKE 'type_card.%' ORDER BY created_at");
    expect(trail.rows.map((row) => row.action)).toEqual(['type_card.saved', 'type_card.saved', 'type_card.reset']);
    expect(trail.rows.every((row) => row.target === umbrellaTypeId)).toBe(true);
  });

  it('refuses malformed content, photos outside the sample library and types of other clubs', async () => {
    const sevenPhotos = Array.from({ length: 7 }, () => ({ id: 'riva' }));
    await expect(setTypeCard(database.app.db, manager, { typeId: umbrellaTypeId, content: { photos: sevenPhotos } })).rejects.toThrow(/1 to 6/);
    await expect(setTypeCard(database.app.db, manager, { typeId: umbrellaTypeId, content: { titolo: 'x' } as never })).rejects.toThrow(/unknown field/);
    await expect(setTypeCard(database.app.db, manager, { typeId: umbrellaTypeId, content: {} })).rejects.toThrow(/at least one field/);
    expect(await codeOf(() => setTypeCard(database.app.db, manager, { typeId: umbrellaTypeId, content: { photos: [{ id: 'non-in-libreria' }] } }))).toBe('invalid_state');

    // A type of another beach club is out of reach, reading and writing alike.
    expect(await codeOf(() => setTypeCard(database.app.db, altroManager, { typeId: umbrellaTypeId, content: { title: 'Furto' } }))).toBe('not_found');
    expect(await codeOf(() => resetTypeCard(database.app.db, altroManager, { typeId: umbrellaTypeId }))).toBe('not_found');
    expect(await codeOf(() => getTypeCardPublic(database.app.db, 'altro-lido', umbrellaTypeId))).toBe('not_found');
  });

  it('answers the public only for active clubs, and keeps a card reachable while its type exists', async () => {
    expect(await codeOf(() => listTypeCardsPublic(database.app.db, 'chiuso'))).toBe('not_found');
    expect(await codeOf(() => getTypeCardPublic(database.app.db, 'chiuso', umbrellaTypeId))).toBe('not_found');
    expect(await codeOf(() => listTypeCardsPublic(database.app.db, 'non-esiste'))).toBe('not_found');

    // The gazebo has no spot: not in the public list, but its card still answers by identifier.
    expect((await listTypeCardsPublic(database.app.db, 'conchiglia')).map((type) => type.typeId)).not.toContain(gazeboTypeId);
    expect((await getTypeCardPublic(database.app.db, 'conchiglia', gazeboTypeId)).name).toBe('Gazebo');

    // Retiring the only daybed spot takes the type out of the public list.
    await database.admin.query("UPDATE spot SET retired = true WHERE code = 'L01' AND beach_id = $1", [conchiglia.beachId]);
    expect((await listTypeCardsPublic(database.app.db, 'conchiglia')).map((type) => type.name)).toEqual(['Ombrellone']);
  });

  it('drops the card with its type', async () => {
    const soloType = (await createSpotType(database.app.db, manager, { name: 'Tenda Prova', mark: 'tent', umbrellas: 0, sunbeds: 0, maxGuests: 2 })).typeId;
    await setTypeCard(database.app.db, manager, { typeId: soloType, content: { title: 'Tenda' } });
    await database.admin.query('DELETE FROM spot_type WHERE id = $1', [soloType]);
    const orphan = await database.admin.query('SELECT 1 FROM spot_type_card WHERE type_id = $1', [soloType]);
    expect(orphan.rowCount).toBe(0);
  });
});
