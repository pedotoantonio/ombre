import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { demoAccounts, demoBeach, seedDemo, upsertUser } from '@ombre/db';
import { createTestDatabase, testAdminUrl, type TestDatabase } from '@ombre/db/testing';
import { createApp } from '../src/app';

const password = 'password-di-prova-123';
const day = '2027-07-20';

interface TypeRow {
  typeId: string;
  name: string;
  mark: string;
  umbrellas: number;
  sunbeds: number;
  maxGuests: number;
  defaultPriceCents: number | null;
  builtin: boolean;
  spots: number;
}

interface ElementRow {
  elementId: string;
  kind: string;
  label: string | null;
  orientation: string | null;
  zone: string | null;
  rowAfter: number | null;
  rowNumber: number | null;
  colStart: number | null;
  colEnd: number | null;
}

describe.skipIf(!testAdminUrl)('the drawing of the beach and the spot types', () => {
  let database: TestDatabase;
  let app: ReturnType<typeof createApp>;
  const tokens: Record<string, string> = {};

  beforeAll(async () => {
    database = await createTestDatabase(testAdminUrl!);
    const { beachId } = await seedDemo(database.adminUrl);
    app = createApp({ db: database.app.db, rateLimiter: { hit: () => 0 }, holdSeconds: 600, signingSecret: 'segreto-di-prova-lungo-almeno-32-caratteri', log: () => undefined });
    for (const account of demoAccounts) {
      await upsertUser(database.adminUrl, { email: account.email, name: account.name, password }, [{ beachId, role: account.role }]);
      const response = await send('POST', '/v1/auth/login', { email: account.email, password });
      tokens[account.role] = ((await response.json()) as { token: string }).token;
    }
  });

  afterAll(async () => {
    await database?.drop();
  });

  const send = (method: string, path: string, payload?: unknown, token?: string) =>
    app.request(path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
    });

  const manage = `/v1/manage/beaches/${demoBeach.slug}`;
  const manager = () => tokens.manager!;
  const reception = () => tokens.reception!;
  const layout = async () =>
    (await (await send('GET', `${manage}/layout`, undefined, manager())).json()) as {
      seaSide: string;
      spots: { spotId: string; code: string; col: number; typeName: string; umbrellas: number; sunbeds: number; maxGuests: number }[];
      elements: ElementRow[];
    };
  const types = async () => ((await (await send('GET', `${manage}/types`, undefined, manager())).json()) as { types: TypeRow[] }).types;
  const availability = async (onDay: string) =>
    (await (await send('GET', `/v1/beaches/${demoBeach.slug}/availability?day=${onDay}`)).json()) as {
      seaSide: string;
      elements: ElementRow[];
      spots: { code: string; priceCents: number; typeName: string; col: number }[];
      layout: { code: string; col: number; typeName: string }[];
    };

  it('moves the sea to the bottom and back, visible to manager and public', async () => {
    expect((await send('PUT', `${manage}/layout/sea-side`, { seaSide: 'bottom' }, manager())).status).toBe(204);
    expect((await layout()).seaSide).toBe('bottom');
    expect((await availability(demoBeach.day)).seaSide).toBe('bottom');
    // The list order never changes with the sea side: row 1 still comes first.
    expect((await availability(demoBeach.day)).layout[0]!.code).toBe('A01');
    expect((await send('PUT', `${manage}/layout/sea-side`, { seaSide: 'top' }, manager())).status).toBe(204);
    expect((await layout()).seaSide).toBe('top');
    expect((await send('PUT', `${manage}/layout/sea-side`, { seaSide: 'bottom' }, reception())).status).toBe(403);
    expect((await send('PUT', `${manage}/layout/sea-side`, { seaSide: 'est' }, manager())).status).toBe(400);
  });

  it('draws walkways, a structure and a cabin block; the public map shows the same elements', async () => {
    expect((await send('POST', `${manage}/layout/elements`, { kind: 'walkway', orientation: 'horizontal', zone: 'ombrelloni', rowAfter: 1, colStart: 1, colEnd: 4 }, manager())).status).toBe(201);
    expect((await send('POST', `${manage}/layout/elements`, { kind: 'walkway', orientation: 'vertical', colStart: 2 }, manager())).status).toBe(201);
    expect((await send('POST', `${manage}/layout/elements`, { kind: 'structure', label: 'Bar', zone: 'monte', rowNumber: 1, colStart: 1, colEnd: 2 }, manager())).status).toBe(201);
    expect((await send('POST', `${manage}/layout/elements`, { kind: 'cabin_block', label: 'Cabine', zone: 'monte', rowNumber: 2, colStart: 1, colEnd: 3 }, manager())).status).toBe(201);

    const drawn = (await layout()).elements;
    expect(drawn).toHaveLength(4);
    const open = await availability(demoBeach.day);
    expect(open.elements).toEqual(drawn);

    // A structure needs its label; only the manager draws.
    expect((await send('POST', `${manage}/layout/elements`, { kind: 'structure', zone: 'monte', rowNumber: 3, colStart: 1, colEnd: 1 }, manager())).status).toBe(400);
    expect((await send('POST', `${manage}/layout/elements`, { kind: 'walkway', orientation: 'vertical', colStart: 5 }, reception())).status).toBe(403);
  });

  it('refuses overlaps with spots (retired included) and between elements, with a clear message', async () => {
    // A02 occupies row 1, column 2 of the umbrella zone.
    const onSpot = await send('POST', `${manage}/layout/elements`, { kind: 'structure', label: 'Chiosco', zone: 'ombrelloni', rowNumber: 1, colStart: 2, colEnd: 3 }, manager());
    expect(onSpot.status).toBe(409);
    expect(((await onSpot.json()) as { error: { message: string } }).error.message).toContain('A02');

    // Retired spots keep their cell in the editor.
    const a01 = (await layout()).spots.find((spot) => spot.code === 'A01')!;
    expect((await send('PUT', `${manage}/layout/spots/${a01.spotId}/retired`, { retired: true }, manager())).status).toBe(204);
    const onRetired = await send('POST', `${manage}/layout/elements`, { kind: 'structure', label: 'Chiosco', zone: 'ombrelloni', rowNumber: 1, colStart: 1, colEnd: 1 }, manager());
    expect(onRetired.status).toBe(409);
    expect(((await onRetired.json()) as { error: { message: string } }).error.message).toMatch(/retired/);
    expect((await send('PUT', `${manage}/layout/spots/${a01.spotId}/retired`, { retired: false }, manager())).status).toBe(204);

    // Element against element: same lane, same gap, same cells.
    expect((await send('POST', `${manage}/layout/elements`, { kind: 'walkway', orientation: 'horizontal', zone: 'ombrelloni', rowAfter: 1, colStart: 3, colEnd: 6 }, manager())).status).toBe(409);
    expect((await send('POST', `${manage}/layout/elements`, { kind: 'walkway', orientation: 'vertical', colStart: 2, zone: 'ombrelloni' }, manager())).status).toBe(409);
    expect((await send('POST', `${manage}/layout/elements`, { kind: 'structure', label: 'Docce', zone: 'monte', rowNumber: 1, colStart: 2, colEnd: 4 }, manager())).status).toBe(409);

    // The eraser removes an element; drawing there becomes possible again.
    const bar = (await layout()).elements.find((element) => element.label === 'Bar')!;
    expect(await (await send('DELETE', `${manage}/layout/elements/${bar.elementId}`, undefined, manager())).json()).toEqual({ detachedCabins: 0 });
    expect((await layout()).elements.some((element) => element.label === 'Bar')).toBe(false);
    expect((await send('POST', `${manage}/layout/elements`, { kind: 'structure', label: 'Docce', zone: 'monte', rowNumber: 1, colStart: 2, colEnd: 4 }, manager())).status).toBe(201);
  });

  it('ships the three base types and lets the manager define, edit and guard them', async () => {
    const base = await types();
    expect(base.filter((type) => type.builtin).map((type) => type.name)).toEqual(['Gazebo', 'Lettino singolo', 'Ombrellone']);
    expect((await send('GET', `${manage}/types`, undefined, reception())).status).toBe(403);

    const created = await send('POST', `${manage}/types`, { name: 'Tenda araba', mark: 'tent', umbrellas: 0, sunbeds: 2, maxGuests: 3, defaultPriceCents: 5500 }, manager());
    expect(created.status).toBe(201);
    expect((await send('POST', `${manage}/types`, { name: 'Tenda araba', mark: 'tent', umbrellas: 0, sunbeds: 1, maxGuests: 2 }, manager())).status).toBe(409);
    expect((await send('POST', `${manage}/types`, { name: 'Iglù', mark: 'igloo', umbrellas: 0, sunbeds: 1, maxGuests: 2 }, manager())).status).toBe(400);

    // Builtins keep name and mark; their defaults may change; they are never deleted.
    const gazebo = base.find((type) => type.name === 'Gazebo')!;
    expect((await send('PUT', `${manage}/types/${gazebo.typeId}`, { name: 'Pagoda' }, manager())).status).toBe(409);
    expect((await send('PUT', `${manage}/types/${gazebo.typeId}`, { defaultPriceCents: 6000, maxGuests: 4 }, manager())).status).toBe(204);
    expect((await send('DELETE', `${manage}/types/${gazebo.typeId}`, undefined, manager())).status).toBe(409);

    // An unused custom type can be deleted.
    const spare = (await (await send('POST', `${manage}/types`, { name: 'Baldacchino', mark: 'daybed', umbrellas: 0, sunbeds: 1, maxGuests: 2 }, manager())).json()) as { typeId: string };
    expect((await send('DELETE', `${manage}/types/${spare.typeId}`, undefined, manager())).status).toBe(204);
    expect((await types()).some((type) => type.name === 'Baldacchino')).toBe(false);
  });

  it('copies type defaults at creation, prices new days by type, and never rewrites published days', async () => {
    const tent = (await types()).find((type) => type.name === 'Tenda araba')!;
    const gazebo = (await types()).find((type) => type.name === 'Gazebo')!;
    const added = await send('POST', `${manage}/layout/rows`, { zone: 'ombrelloni', prefix: 'T', count: 2, typeId: tent.typeId }, manager());
    expect(added.status).toBe(201);
    expect((await send('POST', `${manage}/layout/spots`, { zone: 'ombrelloni', code: 'G01', rowNumber: 4, typeId: gazebo.typeId }, manager())).status).toBe(201);

    const drawn = await layout();
    expect(drawn.spots.find((spot) => spot.code === 'T01')).toMatchObject({ typeName: 'Tenda araba', umbrellas: 0, sunbeds: 2, maxGuests: 3 });
    expect(drawn.spots.find((spot) => spot.code === 'G01')).toMatchObject({ typeName: 'Gazebo', umbrellas: 0, sunbeds: 2, maxGuests: 4 });

    // A new published day: the type's default price where there is one, the base price elsewhere.
    expect(await (await send('POST', `${manage}/inventory/publish`, { day, priceCents: 3000 }, manager())).json()).toEqual({ published: 11 });
    const open = await availability(day);
    expect(open.spots.find((spot) => spot.code === 'T01')).toMatchObject({ priceCents: 5500, typeName: 'Tenda araba' });
    expect(open.spots.find((spot) => spot.code === 'G01')?.priceCents).toBe(6000);
    expect(open.spots.find((spot) => spot.code === 'A01')?.priceCents).toBe(3000);

    // Editing the type's price touches only days published afterwards.
    expect((await send('PUT', `${manage}/types/${tent.typeId}`, { defaultPriceCents: 9000 }, manager())).status).toBe(204);
    expect((await availability(day)).spots.find((spot) => spot.code === 'T01')?.priceCents).toBe(5500);
    expect(await (await send('POST', `${manage}/inventory/publish`, { day, priceCents: 3000 }, manager())).json()).toEqual({ published: 0 });
    expect((await availability(day)).spots.find((spot) => spot.code === 'T01')?.priceCents).toBe(5500);

    // A used type cannot be deleted; changing a spot's type is explicit and keeps its equipment.
    expect((await send('DELETE', `${manage}/types/${tent.typeId}`, undefined, manager())).status).toBe(409);
    const t02 = drawn.spots.find((spot) => spot.code === 'T02')!;
    const ombrellone = (await types()).find((type) => type.name === 'Ombrellone')!;
    expect((await send('PUT', `${manage}/layout/spots/${t02.spotId}/type`, { typeId: ombrellone.typeId }, manager())).status).toBe(204);
    expect((await layout()).spots.find((spot) => spot.code === 'T02')).toMatchObject({ typeName: 'Ombrellone', umbrellas: 0, sunbeds: 2, maxGuests: 3 });
  });

  it('keeps every management field away from the public and explains the drawing instead', async () => {
    const open = JSON.stringify(await availability(day));
    expect(open).not.toMatch(/rentalType|rentalNotes|retired|builtin|defaultPriceCents|cabinId|assignment|sublet|holder/i);
    const shown = await availability(day);
    expect(shown.layout.every((spot) => spot.col >= 1 && typeof spot.typeName === 'string')).toBe(true);
  });

  it('writes drawing and type actions to the audit trail', async () => {
    const trail = await database.admin.query<{ action: string }>("SELECT DISTINCT action FROM audit_event WHERE action LIKE 'layout.sea-side' OR action LIKE 'layout.element%' OR action LIKE 'layout.spot-type' OR action LIKE 'types.%'");
    expect(trail.rows.map((row) => row.action).sort()).toEqual([
      'layout.element-add',
      'layout.element-remove',
      'layout.sea-side',
      'layout.spot-type',
      'types.create',
      'types.delete',
      'types.update',
    ]);
  });
});
