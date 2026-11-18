import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  acquireHold,
  applyPaymentOutcome,
  changePassword,
  identityLogin,
  listMyBookings,
  login,
  registerAccount,
  relinkBookings,
  resolveSession,
  setSplitRule,
  startCheckout,
  withBeach,
  withUser,
} from '../src/index';
import { bookingGroup, notification } from '../src/schema';
import { createTestDatabase, insertBeach, testAdminUrl, type TestBeach, type TestDatabase } from '../src/testing';

const signingSecret = 'segreto-di-prova-lungo-almeno-32-caratteri';
const day = '2099-07-01';

describe.skipIf(!testAdminUrl)('guest accounts on a real PostgreSQL', () => {
  let database: TestDatabase;
  let dune: TestBeach;
  let nextSpot = 0;

  beforeAll(async () => {
    database = await createTestDatabase(testAdminUrl!);
    dune = await insertBeach(database.admin, 'dune', { spots: 8, day });
    await setSplitRule(database.adminUrl, dune.beachId, { seasonHolder: 5000, beachClub: 4000, platform: 1000 });
  });

  afterAll(async () => {
    await database?.drop();
  });

  const db = () => database.app.db;

  async function confirmedBooking(guestEmail: string): Promise<string> {
    const held = await acquireHold(db(), dune.beachId, { spotId: dune.spotIds[nextSpot++]!, day, idempotencyKey: `test-${randomUUID()}`, ttlSeconds: 600 });
    const booked = await startCheckout(db(), dune.beachId, { holdId: held.holdId, guestName: 'Ada', guestEmail }, signingSecret);
    expect(await applyPaymentOutcome(db(), { provider: 'sandbox', eventId: randomUUID(), reference: booked.payment.reference, outcome: 'succeeded' })).toBe('confirmed');
    return booked.code;
  }

  it('registers once, refuses nothing on a second try, and queues a different platform mail each time', async () => {
    expect(await registerAccount(db(), { email: 'Ada@Example.org', name: 'Ada', locale: 'it' })).toBe('created');
    expect(await registerAccount(db(), { email: 'ada@example.org', name: 'Ada', locale: 'it' })).toBe('exists');

    const queued = await database.admin.query<{ beach_id: string | null; kind: string; payload: Record<string, string> }>(
      "SELECT beach_id, kind, payload FROM outbox WHERE kind LIKE 'account.%' ORDER BY id",
    );
    expect(queued.rows.map((row) => [row.beach_id, row.kind])).toEqual([
      [null, 'account.created'],
      [null, 'account.exists'],
    ]);
    // The generated password travels only inside the queued mail of the new account.
    expect(queued.rows[0]!.payload.password).toMatch(/^[a-zA-Z2-9]{16}$/);
    expect(queued.rows[0]!.payload.email).toBe('ada@example.org');
    expect(queued.rows[1]!.payload.password).toBeUndefined();

    const audited = await database.admin.query("SELECT beach_id, detail->>'outcome' AS outcome FROM audit_event WHERE action = 'account.register' ORDER BY created_at");
    expect(audited.rows).toEqual([
      { beach_id: null, outcome: 'created' },
      { beach_id: null, outcome: 'exists' },
    ]);
  });

  it('signs in with the generated password, forces the change and then accepts the new one', async () => {
    const queued = await database.admin.query<{ payload: { password: string } }>("SELECT payload FROM outbox WHERE kind = 'account.created'");
    const generated = queued.rows[0]!.payload.password;

    const session = await login(db(), 'ada@example.org', generated, 3600);
    const user = await resolveSession(db(), session.token);
    expect(user?.mustChangePassword).toBe(true);

    await expect(changePassword(db(), session.userId, 'sbagliata-e-lunga', 'nuova-parola-lunga')).rejects.toMatchObject({ code: 'invalid_credentials' });
    await expect(changePassword(db(), session.userId, generated, 'corta')).rejects.toThrow(RangeError);

    await changePassword(db(), session.userId, generated, 'nuova-parola-lunga');
    expect((await resolveSession(db(), session.token))?.mustChangePassword).toBe(false);
    await expect(login(db(), 'ada@example.org', generated, 3600)).rejects.toMatchObject({ code: 'invalid_credentials' });
    await login(db(), 'ada@example.org', 'nuova-parola-lunga', 3600);
  });

  it('relinks past bookings by email at the registration and keeps them private to their owner', async () => {
    const code = await confirmedBooking('bruno@example.org');
    expect(await registerAccount(db(), { email: 'bruno@example.org', name: 'Bruno', locale: 'it' })).toBe('created');

    const owner = await database.admin.query<{ id: string }>("SELECT id FROM app_user WHERE email = 'bruno@example.org'");
    const ownerId = owner.rows[0]!.id;
    const mine = await listMyBookings(db(), ownerId, signingSecret);
    expect(mine.upcoming.map((group) => group.code)).toEqual([code]);
    expect(mine.upcoming[0]).toMatchObject({ beachSlug: 'dune', spotCode: expect.stringMatching(/^A\d\d$/), status: 'confirmed', paymentState: 'paid' });
    expect(mine.upcoming[0]!.passCredential).toMatch(/^[0-9a-f-]{36}\./);
    expect(mine.nextArrivals).toBe(1);

    // Another account sees nothing: neither through the view nor through the owner RLS path.
    expect(await registerAccount(db(), { email: 'carla@example.org', name: 'Carla', locale: 'it' })).toBe('created');
    const other = await database.admin.query<{ id: string }>("SELECT id FROM app_user WHERE email = 'carla@example.org'");
    const otherView = await listMyBookings(db(), other.rows[0]!.id, signingSecret);
    expect(otherView).toEqual({ nextArrivals: 0, totalSpentCents: 0, upcoming: [], past: [] });
    const visible = await withUser(db(), other.rows[0]!.id, (tx) => tx.select().from(bookingGroup));
    expect(visible).toEqual([]);
  });

  it('relinks at every successful sign-in, for bookings made after the registration', async () => {
    const code = await confirmedBooking('bruno@example.org');
    const owner = await database.admin.query<{ id: string }>("SELECT id FROM app_user WHERE email = 'bruno@example.org'");
    expect(await relinkBookings(db(), owner.rows[0]!.id, 'Bruno@example.org')).toBe(1);
    expect(await relinkBookings(db(), owner.rows[0]!.id, 'bruno@example.org')).toBe(0);
    const mine = await listMyBookings(db(), owner.rows[0]!.id, signingSecret);
    expect(mine.upcoming.map((group) => group.code)).toContain(code);
  });

  it('signs in with an external identity: links by email, creates when new, reuses the identity afterwards', async () => {
    // Same email as an existing account: the identity hooks onto it.
    const linked = await identityLogin(db(), { provider: 'test', subject: 'bruno@example.org', email: 'bruno@example.org', name: 'Bruno' }, 3600);
    const owner = await database.admin.query<{ id: string }>("SELECT id FROM app_user WHERE email = 'bruno@example.org'");
    expect(linked.user.userId).toBe(owner.rows[0]!.id);

    // New email: the account is born there, with no password change owed.
    const born = await identityLogin(db(), { provider: 'test', subject: 'dora@example.org', email: 'dora@example.org', name: 'Dora' }, 3600);
    expect(born.user.mustChangePassword).toBe(false);
    const again = await identityLogin(db(), { provider: 'test', subject: 'dora@example.org', email: 'dora@example.org', name: 'Dora' }, 3600);
    expect(again.user.userId).toBe(born.user.userId);
    const identities = await database.admin.query("SELECT 1 FROM user_identity WHERE provider = 'test' AND subject = 'dora@example.org'");
    expect(identities.rowCount).toBe(1);

    const sessions = await resolveSession(db(), again.token);
    expect(sessions?.email).toBe('dora@example.org');
  });

  it('keeps platform notifications out of every beach-scoped listing', async () => {
    await database.admin.query(
      "INSERT INTO notification (beach_id, template, locale, recipient, status, provider) VALUES (NULL, 'account_created', 'it', 'ada@example.org', 'skipped', 'none')",
    );
    // In beach context the platform row stays invisible to the application role.
    const inBeach = await withBeach(db(), dune.beachId, (tx) => tx.select().from(notification));
    expect(inBeach.filter((row) => row.beachId === null)).toEqual([]);
    // Outside any context the platform row is readable, the beach ones are not.
    const outside = await db().select().from(notification);
    expect(outside.every((row) => row.beachId === null)).toBe(true);
    expect(outside.some((row) => row.template === 'account_created')).toBe(true);
  });
});
