import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Mail, MailProvider } from '@ombre/comms';
import { acquireHold, applyPaymentOutcome, processOutbox, runMaintenance, setSplitRule, startCheckout } from '@ombre/db';
import { createTestDatabase, insertBeach, testAdminUrl, type TestBeach, type TestDatabase } from '@ombre/db/testing';
import { createHandler } from '../src/handlers';

const signingSecret = 'segreto-di-prova-lungo-almeno-32-caratteri';
const day = '2099-07-01';

describe.skipIf(!testAdminUrl)('worker: queue, expired holds, end of day', () => {
  let database: TestDatabase;
  let beach: TestBeach;
  let nextSpot = 0;
  const sent: Mail[] = [];
  const capture: MailProvider = { name: 'capture', delivers: true, send: async (mail) => void sent.push(mail) };

  beforeAll(async () => {
    database = await createTestDatabase(testAdminUrl!);
    beach = await insertBeach(database.admin, 'lido', { spots: 14, day });
    await database.admin.query("INSERT INTO promotion (beach_id, code, percent_bps, max_uses) VALUES ($1, 'UNO', 1000, 1)", [beach.beachId]);
    await setSplitRule(database.adminUrl, beach.beachId, { seasonHolder: 5000, beachClub: 4000, platform: 1000 });
  });

  afterAll(async () => {
    await database?.drop();
  });

  const db = () => database.app.db;
  const handler = (mail: MailProvider | null) => createHandler({ db: db(), brand: 'Marchio', siteUrl: 'https://esempio.test', signingSecret, mail });
  const hold = (spotId: string, ttlSeconds = 600, promoCode?: string) => acquireHold(db(), beach.beachId, { spotId, day, promoCode, idempotencyKey: `test-${randomUUID()}`, ttlSeconds });
  async function confirmed(locale: 'it' | 'en' = 'it'): Promise<string> {
    const held = await hold(beach.spotIds[nextSpot++]!);
    const booked = await startCheckout(db(), beach.beachId, { holdId: held.holdId, guestName: 'Ada', guestEmail: 'ada@example.org', locale }, signingSecret);
    expect(await applyPaymentOutcome(db(), { provider: 'sandbox', eventId: randomUUID(), reference: booked.payment.reference, outcome: 'succeeded' })).toBe('confirmed');
    return booked.bookingId;
  }
  const notifications = async () => (await database.admin.query<{ booking_id: string; status: string; provider: string; locale: string }>('SELECT booking_id, status, provider, locale FROM notification ORDER BY created_at')).rows;

  it('gives back the days whose hold ran out, with their promotion use, and leaves live holds alone', async () => {
    const stale = beach.spotIds[nextSpot++]!;
    const live = beach.spotIds[nextSpot++]!;
    await hold(stale, 0, 'UNO');
    await hold(live);
    expect(await runMaintenance(db())).toEqual({ holdsReleased: 1, daysClosed: 0 });
    expect(await runMaintenance(db())).toEqual({ holdsReleased: 0, daysClosed: 0 });

    const states = await database.admin.query<{ spot_id: string; state: string }>('SELECT spot_id, state FROM inventory_day WHERE spot_id = ANY($1)', [[stale, live]]);
    expect(Object.fromEntries(states.rows.map((row) => [row.spot_id, row.state]))).toEqual({ [stale]: 'available', [live]: 'held' });
    const uses = await database.admin.query<{ committed_uses: number }>("SELECT committed_uses FROM promotion WHERE code = 'UNO'");
    expect(uses.rows[0]?.committed_uses).toBe(0);
  });

  it('sends one confirmation per booking, in the language of the booking, with the private link', async () => {
    const bookingId = await confirmed('en');
    expect(await processOutbox(db(), handler(capture))).toEqual({ done: 1, failed: 0 });
    expect(await processOutbox(db(), handler(capture))).toEqual({ done: 0, failed: 0 });

    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('ada@example.org');
    expect(sent[0]!.subject).toMatch(/^Marchio: booking OM-990701-\d{3} confirmed$/);
    expect(sent[0]!.text).toMatch(new RegExp(`https://esempio\\.test/en/beach-clubs/lido/booking/${bookingId}\\?t=[A-Za-z0-9_-]{43}`));
    expect(await notifications()).toEqual([{ booking_id: bookingId, status: 'sent', provider: 'capture', locale: 'en' }]);
  });

  it('records the notification as skipped when no mail provider is configured', async () => {
    const bookingId = await confirmed();
    expect(await processOutbox(db(), handler(null))).toEqual({ done: 1, failed: 0 });
    expect((await notifications()).at(-1)).toEqual({ booking_id: bookingId, status: 'skipped', provider: 'none', locale: 'it' });
    expect(sent).toHaveLength(1);
  });

  it('handles each queued item once even with two workers running together', async () => {
    const before = (await notifications()).length;
    for (let index = 0; index < 6; index += 1) await confirmed();
    const rounds = await Promise.all([processOutbox(db(), handler(capture), 4), processOutbox(db(), handler(capture), 4)]);
    const rest = await processOutbox(db(), handler(capture));
    expect(rounds[0]!.done + rounds[1]!.done + rest.done).toBe(6);

    const all = await notifications();
    expect(all.length - before).toBe(6);
    expect(new Set(all.map((row) => row.booking_id)).size).toBe(all.length);
  });

  it('retries a failed item later and gives up after five attempts, keeping the error', async () => {
    await confirmed();
    const broken = async () => {
      throw new Error('provider down');
    };
    expect(await processOutbox(db(), broken)).toEqual({ done: 0, failed: 1 });
    expect(await processOutbox(db(), broken)).toEqual({ done: 0, failed: 0 });

    for (let attempt = 2; attempt <= 5; attempt += 1) {
      await database.admin.query('UPDATE outbox SET available_at = now() WHERE processed_at IS NULL AND failed_at IS NULL');
      expect(await processOutbox(db(), broken)).toEqual({ done: 0, failed: 1 });
    }
    await database.admin.query('UPDATE outbox SET available_at = now() WHERE processed_at IS NULL');
    expect(await processOutbox(db(), handler(capture))).toEqual({ done: 0, failed: 0 });
    const given = await database.admin.query<{ attempts: number; last_error: string }>('SELECT attempts, last_error FROM outbox WHERE failed_at IS NOT NULL');
    expect(given.rows).toEqual([{ attempts: 5, last_error: 'provider down' }]);
  });

  it('closes past days by itself and refuses to sell a day that has passed', async () => {
    const spotId = beach.spotIds[nextSpot]!;
    const bookingId = await confirmed();
    await database.admin.query("UPDATE inventory_day SET day = current_date - 2 WHERE spot_id = $1", [spotId]);
    expect(await runMaintenance(db())).toEqual({ holdsReleased: 0, daysClosed: 1 });
    const closed = await database.admin.query<{ status: string; presence: string }>('SELECT status, presence FROM booking WHERE id = $1', [bookingId]);
    expect(closed.rows[0]).toEqual({ status: 'completed', presence: 'ended' });
    const accrued = await database.admin.query("SELECT 1 FROM allocation WHERE booking_id = $1 AND state = 'accrued'", [bookingId]);
    expect(accrued.rowCount).toBe(2);

    const past = beach.spotIds[nextSpot + 1]!;
    await database.admin.query("UPDATE inventory_day SET day = current_date - 2 WHERE spot_id = $1", [past]);
    await expect(acquireHold(db(), beach.beachId, { spotId: past, day: new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10), idempotencyKey: `test-${randomUUID()}`, ttlSeconds: 600 })).rejects.toMatchObject({ code: 'inventory_conflict' });
  });
});
