import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  acquireHold,
  addSpot,
  appendOp,
  applyDraft,
  applyPaymentOutcome,
  checkAccess,
  createZone,
  deskBooking,
  discardDraft,
  DomainError,
  DraftApplyError,
  getDraft,
  getLayout,
  listAvailability,
  listBookings,
  listDayMap,
  listDayOperations,
  quoteSpot,
  searchBeaches,
  spotCard,
  startCheckout,
  undoLastOp,
  upsertUser,
  type Actor,
  type DraftOp,
} from '../src/index';
import { createTestDatabase, insertBeach, testAdminUrl, type TestBeach, type TestDatabase } from '../src/testing';

const signingSecret = 'segreto-di-prova-lungo-almeno-32-caratteri';
const day = '2099-08-01';
const day2 = '2099-08-02';
const key = () => `test-${randomUUID()}`;

async function codeOf(work: () => Promise<unknown>): Promise<string> {
  try {
    await work();
    return 'no error';
  } catch (error) {
    return error instanceof DomainError ? error.code : `unexpected: ${String(error)}`;
  }
}

describe.skipIf(!testAdminUrl)('the planner draft on a real PostgreSQL (D56, D57, D58, D59, D60)', () => {
  let database: TestDatabase;
  let pino: TestBeach;
  let manager: Actor;
  let zoneId: string;
  let today: string;

  beforeAll(async () => {
    database = await createTestDatabase(testAdminUrl!);
    // A01..A06, zone ombrelloni, row 1, columns 1..6, each with `day` published.
    pino = await insertBeach(database.admin, 'pino', { spots: 6, day });
    const userId = await upsertUser(database.adminUrl, { email: 'gestore@example.org', name: 'Gea', password: 'password-di-prova-123' }, [{ beachId: pino.beachId, role: 'manager' }]);
    manager = { userId, beachId: pino.beachId, role: 'manager' };
    const named = await createZone(db(), manager, { name: 'Prima fila' });
    zoneId = named.zoneId;
    const clock = await database.admin.query<{ today: string }>("SELECT (now() at time zone 'Europe/Rome')::date::text AS today");
    today = clock.rows[0]!.today;
  });

  afterAll(async () => {
    await database?.drop();
  });

  const db = () => database.app.db;
  const spotIdOf = async (code: string) => {
    const row = await database.admin.query<{ id: string }>('SELECT id FROM spot WHERE beach_id = $1 AND code = $2', [pino.beachId, code]);
    return row.rows[0]?.id ?? null;
  };
  const publish = (spotId: string, onDay: string) =>
    database.admin.query("INSERT INTO inventory_day (beach_id, spot_id, day, state, price_cents) VALUES ($1, $2, $3, 'available', 3000)", [pino.beachId, spotId, onDay]);
  const book = async (spotId: string, onDay: string, guest: string) => {
    const held = await acquireHold(db(), pino.beachId, { spotId, day: onDay, idempotencyKey: key(), ttlSeconds: 600 });
    const booked = await startCheckout(db(), pino.beachId, { holdId: held.holdId, guestName: guest, guestEmail: `${guest.toLowerCase()}@example.org` }, signingSecret);
    expect(await applyPaymentOutcome(db(), { provider: 'sandbox', eventId: randomUUID(), reference: booked.payment.reference, outcome: 'succeeded' })).toBe('confirmed');
    return booked;
  };

  it('appends with a light validation, undoes the last op, discards the draft; the real beach never moves', async () => {
    // Nothing yet: empty ops, the preview is the real layout.
    const empty = await getDraft(db(), manager);
    expect(empty.ops).toEqual([]);
    expect(empty.updatedAt).toBeNull();
    expect(empty.preview.spots.map((place) => place.code)).toEqual(['A01', 'A02', 'A03', 'A04', 'A05', 'A06']);

    const created = await appendOp(db(), manager, { op: 'create_spot', zone: 'riva', row: 1, col: 1, code: 'R01' });
    expect(created).toMatchObject({ index: 0, description: { action: 'create_spot', code: 'R01' } });
    const moved = await appendOp(db(), manager, { op: 'move_spot', spotId: (await spotIdOf('A01'))!, zone: 'ombrelloni', row: 2, col: 1 });
    expect(moved.description).toMatchObject({ action: 'move_spot', code: 'A01', from: { zone: 'ombrelloni', row: 1, col: 1 }, to: { zone: 'ombrelloni', row: 2, col: 1 } });

    // The preview renders the beach WITH the draft; the saved beach is untouched.
    const draft = await getDraft(db(), manager);
    expect(draft.ops).toHaveLength(2);
    expect(draft.ops.every((entry) => !entry.stale)).toBe(true);
    expect(draft.updatedBy).toBe(manager.userId);
    const previewR01 = draft.preview.spots.find((place) => place.code === 'R01');
    expect(previewR01).toMatchObject({ zone: 'riva', rowNumber: 1, col: 1, draftOnly: true });
    expect(previewR01!.spotId.startsWith('draft-')).toBe(true);
    expect(draft.preview.spots.find((place) => place.code === 'A01')).toMatchObject({ rowNumber: 2, draftOnly: false });
    const saved = await getLayout(db(), manager);
    expect(saved.spots.map((place) => place.code)).toEqual(['A01', 'A02', 'A03', 'A04', 'A05', 'A06']);
    expect(saved.spots.find((place) => place.code === 'A01')).toMatchObject({ rowNumber: 1, col: 1 });

    // The light validation: evident collisions and missing references have their own errors.
    expect(await codeOf(() => appendOp(db(), manager, { op: 'create_spot', zone: 'ombrelloni', row: 1, col: 2, code: 'X01' }))).toBe('draft_cell_taken');
    expect(await codeOf(() => appendOp(db(), manager, { op: 'create_spot', zone: 'riva', row: 1, col: 2, code: 'A02' }))).toBe('code_taken');
    expect(await codeOf(() => appendOp(db(), manager, { op: 'move_spot', spotId: randomUUID(), zone: 'riva', row: 1, col: 3 }))).toBe('draft_spot_missing');
    expect(await codeOf(() => appendOp(db(), manager, { op: 'remove_element', elementId: randomUUID() }))).toBe('draft_element_missing');
    const a02 = (await spotIdOf('A02'))!;
    expect(await codeOf(() => appendOp(db(), manager, { op: 'assign_zone', spotId: a02, zoneId: randomUUID() }))).toBe('draft_zone_missing');
    expect(await codeOf(() => appendOp(db(), manager, { op: 'create_spot', zone: 'riva', row: 0, col: 1 } as unknown as DraftOp))).toBe('draft_invalid_op');
    expect(await codeOf(() => appendOp(db(), manager, { op: 'create_grid', zone: 'monte', fromRow: 7, rows: 1, cols: 3, prefix: 'Z' }))).toBe('draft_invalid_op');

    // Undo takes the LAST op off; discard empties; both refuse nothing else.
    const undone = await undoLastOp(db(), manager);
    expect(undone.removed).toMatchObject({ op: 'move_spot' });
    expect(undone.remaining).toBe(1);
    expect(await discardDraft(db(), manager)).toEqual({ discarded: 1 });
    expect((await getDraft(db(), manager)).ops).toEqual([]);
    expect(await codeOf(() => undoLastOp(db(), manager))).toBe('draft_empty');
    expect(await codeOf(() => applyDraft(db(), manager))).toBe('draft_empty');
  });

  it('applies a whole draft in one transaction: grid, moves, edit, scenography, zone, with ONE layout.saved audit event', async () => {
    // A single spot created and then MOVED by its synthetic id, a D34 grid, an
    // edit, a decoration moved by its synthetic id, and a zone assignment.
    await appendOp(db(), manager, { op: 'create_spot', zone: 'riva', row: 1, col: 1, code: 'R01' });
    await appendOp(db(), manager, { op: 'move_spot', spotId: 'draft-0', zone: 'riva', row: 1, col: 2 });
    const grid = await appendOp(db(), manager, { op: 'create_grid', zone: 'monte', rows: 2, cols: 3, prefix: 'B' });
    expect(grid.description).toMatchObject({ action: 'create_grid', fromRow: 1, spots: 6, firstCode: 'B01', lastCode: 'B06' });
    await appendOp(db(), manager, { op: 'edit_spot', spotId: (await spotIdOf('A03'))!, patch: { umbrellas: 2, rentalType: 'Albergo' } });
    await appendOp(db(), manager, { op: 'add_element', kind: 'decoration', zone: 'ombrelloni', row: 2, col: 1, sign: 'palma' });
    await appendOp(db(), manager, { op: 'move_element', elementId: 'draft-4', zone: 'ombrelloni', row: 2, col: 3 });
    await appendOp(db(), manager, { op: 'assign_zone', spotId: (await spotIdOf('A04'))!, zoneId });

    const result = await applyDraft(db(), manager);
    expect(result).toEqual({
      applied: { create_spot: 1, move_spot: 1, create_grid: 1, edit_spot: 1, add_element: 1, move_element: 1, assign_zone: 1 },
      total: 7,
    });

    // The draft is empty, the beach holds everything, the registry has ONE layout.saved with the counts.
    expect((await getDraft(db(), manager)).ops).toEqual([]);
    const layout = await getLayout(db(), manager);
    expect(layout.spots.find((place) => place.code === 'R01')).toMatchObject({ zone: 'riva', rowNumber: 1, col: 2 });
    expect(layout.spots.filter((place) => place.zone === 'monte').map((place) => place.code)).toEqual(['B01', 'B02', 'B03', 'B04', 'B05', 'B06']);
    expect(layout.spots.find((place) => place.code === 'A03')).toMatchObject({ umbrellas: 2, rentalType: 'Albergo' });
    expect(layout.spots.find((place) => place.code === 'A04')).toMatchObject({ zoneName: 'Prima fila' });
    expect(layout.elements).toEqual([expect.objectContaining({ kind: 'decoration', sign: 'palma', zone: 'ombrelloni', rowNumber: 2, colStart: 3 })]);
    const audits = await database.admin.query<{ detail: Record<string, unknown> }>("SELECT detail FROM audit_event WHERE beach_id = $1 AND action = 'layout.saved'", [pino.beachId]);
    expect(audits.rows).toHaveLength(1);
    expect(audits.rows[0]!.detail).toMatchObject({ create_grid: 1, move_spot: 1, total: 7 });
  });

  it('rolls EVERYTHING back when one op fails mid-apply, naming the op and the reason', async () => {
    await appendOp(db(), manager, { op: 'create_spot', zone: 'riva', row: 2, col: 1, code: 'R21' });
    await appendOp(db(), manager, { op: 'create_spot', zone: 'riva', row: 2, col: 2, code: 'R22' });
    // The beach changes under the draft: the second target cell gets taken for real.
    await addSpot(db(), manager, { zone: 'riva', code: 'RX2', rowNumber: 2, col: 2 });

    const failure = await applyDraft(db(), manager).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(DraftApplyError);
    expect(failure as DraftApplyError).toMatchObject({ code: 'draft_apply_failed', failedIndex: 1, reason: 'draft_cell_taken' });

    // NOTHING landed: not even the first op; the draft is still there to fix.
    expect(await spotIdOf('R21')).toBeNull();
    expect((await getDraft(db(), manager)).ops).toHaveLength(2);
    expect(await discardDraft(db(), manager)).toEqual({ discarded: 2 });
  });

  it('moves a booked spot keeping id, code, booking and pass; the old cell is free again (D60)', async () => {
    const spotId = (await spotIdOf('A05'))!;
    await publish(spotId, today);
    const booked = await book(spotId, today, 'Ada');

    await appendOp(db(), manager, { op: 'move_spot', spotId, zone: 'ombrelloni', row: 3, col: 5 });
    await applyDraft(db(), manager);

    // Same identity: id and code; the booking and its pass still answer at the entrance.
    const moved = await database.admin.query<{ id: string; zone: string; row_number: number; col: number }>('SELECT id, zone, row_number, col FROM spot WHERE beach_id = $1 AND code = $2', [
      pino.beachId,
      'A05',
    ]);
    expect(moved.rows[0]).toMatchObject({ id: spotId, zone: 'ombrelloni', row_number: 3, col: 5 });
    const entered = await checkAccess(db(), manager, { credential: booked.code, kind: 'entry' }, signingSecret);
    expect(entered.spotCode).toBe('A05');
    // The published day of 2099 moved with the spot: still buyable.
    expect((await listAvailability(db(), pino.beachId, day)).map((place) => place.code)).toContain('A05');
    // The old cell belongs to nobody now: a new spot can take it.
    await expect(addSpot(db(), manager, { zone: 'ombrelloni', code: 'X05', rowNumber: 1, col: 5 })).resolves.toMatchObject({ spotId: expect.any(String) });
  });

  it('maintenance (D56) shuts every sale channel but leaves the drawing and the bookings alone', async () => {
    const spotId = (await spotIdOf('A06'))!;
    await publish(spotId, today);
    await publish(spotId, day2);
    const booked = await book(spotId, today, 'Bice');

    await appendOp(db(), manager, { op: 'edit_spot', spotId, patch: { maintenance: true } });
    await applyDraft(db(), manager);

    // Public availability, search, quote, online reserve and desk: all excluded, like the retired spot.
    expect((await listAvailability(db(), pino.beachId, day2)).map((place) => place.code)).not.toContain('A06');
    const offers = await searchBeaches(db(), { day: day2 });
    expect(offers.find((offer) => offer.slug === 'pino')!.freeSpots).toBe(0);
    expect(await codeOf(() => quoteSpot(db(), pino.beachId, { spotId, day: day2 }))).toBe('inventory_conflict');
    expect(await codeOf(() => acquireHold(db(), pino.beachId, { spotId, day: day2, idempotencyKey: key(), ttlSeconds: 600 }))).toBe('inventory_conflict');
    expect(await codeOf(() => deskBooking(db(), manager, { spotId, day: day2, guestName: 'Caio' }, signingSecret))).toBe('inventory_conflict');

    // The drawing keeps the spot, with its state; the map says unavailable but still draws it.
    const map = await listDayMap(db(), pino.beachId, day2);
    expect(map.find((place) => place.code === 'A06')).toMatchObject({ status: 'unavailable', maintenance: true, priceCents: null });
    expect((await getLayout(db(), manager)).spots.find((place) => place.code === 'A06')).toMatchObject({ maintenance: true, retired: false });
    const console = await listDayOperations(db(), manager, today);
    expect(console.spots.find((place) => place.code === 'A06')).toMatchObject({ state: 'maintenance', maintenance: true });
    expect(console.summary.counts.maintenance).toBe(1);
    const card = await spotCard(db(), manager, { day: today, code: 'A06' });
    expect(card).toMatchObject({ state: 'maintenance', maintenance: true });
    expect(card.booking).toMatchObject({ guestName: 'Bice' });

    // The booking already taken stays confirmed, valid at the entrance; nothing is cancelled.
    const rows = await listBookings(db(), manager, today);
    expect(rows.find((row) => row.code === booked.code)).toMatchObject({ status: 'confirmed', spotCode: 'A06' });
    const entered = await checkAccess(db(), manager, { credential: booked.code, kind: 'entry' }, signingSecret);
    expect(entered.spotCode).toBe('A06');

    // Back from maintenance, the day can be sold again.
    await appendOp(db(), manager, { op: 'edit_spot', spotId, patch: { maintenance: false } });
    await applyDraft(db(), manager);
    expect((await listAvailability(db(), pino.beachId, day2)).map((place) => place.code)).toContain('A06');
  });

  it('refuses the deletion of a booked spot, telling a booked future from a sold past, and deletes clean ones with their future days', async () => {
    // A02 holds a FUTURE booking: refused with its count.
    const futureSpot = (await spotIdOf('A02'))!;
    await book(futureSpot, day, 'Dino');
    await appendOp(db(), manager, { op: 'delete_spot', spotId: futureSpot });
    const futureRefusal = (await applyDraft(db(), manager).then(
      () => null,
      (error: unknown) => error,
    )) as DraftApplyError;
    expect(futureRefusal).toMatchObject({ failedIndex: 0, reason: 'spot_has_future_bookings' });
    expect(futureRefusal.message).toContain('1 future booking');
    await discardDraft(db(), manager);

    // A01 holds a PAST booking only: a different message, pointing at retirement or maintenance.
    const pastSpot = (await spotIdOf('A01'))!;
    await book(pastSpot, day, 'Elsa');
    await database.admin.query("UPDATE inventory_day SET day = '2020-01-01' WHERE spot_id = $1 AND day = $2", [pastSpot, day]);
    await appendOp(db(), manager, { op: 'delete_spot', spotId: pastSpot });
    const pastRefusal = (await applyDraft(db(), manager).then(
      () => null,
      (error: unknown) => error,
    )) as DraftApplyError;
    expect(pastRefusal).toMatchObject({ failedIndex: 0, reason: 'spot_has_history' });
    expect(pastRefusal.message).toContain('retire it from sale or put it under maintenance');
    await discardDraft(db(), manager);

    // A spot with future published days and NO booking leaves, and its days leave with it.
    const { spotId: cleanSpot } = await addSpot(db(), manager, { zone: 'riva', code: 'R90', rowNumber: 9, col: 1 });
    await publish(cleanSpot, day);
    await publish(cleanSpot, day2);
    await appendOp(db(), manager, { op: 'delete_spot', spotId: cleanSpot });
    expect(await applyDraft(db(), manager)).toEqual({ applied: { delete_spot: 1 }, total: 1 });
    expect(await spotIdOf('R90')).toBeNull();
    const leftovers = await database.admin.query('SELECT 1 FROM inventory_day WHERE spot_id = $1', [cleanSpot]);
    expect(leftovers.rowCount).toBe(0);
  });
});
