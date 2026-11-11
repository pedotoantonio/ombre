// End to end on the running stack: hold, checkout, signed test payment, confirmation,
// worker notification, front desk check and reports.
// Needs OMBRE_SEED_DEMO=true, OMBRE_DEMO_PASSWORD and OMBRE_SANDBOX_WEBHOOK_SECRET.
// Usage: node scripts/smoke-booking.ts [API address]   (default http://127.0.0.1:3211)
import { createHmac, randomUUID } from 'node:crypto';

const base = (process.argv[2] ?? 'http://127.0.0.1:3211').replace(/\/+$/, '');
const password = process.env.OMBRE_DEMO_PASSWORD ?? '';
const webhookSecret = process.env.OMBRE_SANDBOX_WEBHOOK_SECRET ?? '';
const slug = 'bagno-delle-dune';
const day = '2027-06-17';
const failures: string[] = [];
let checks = 0;

function check(condition: boolean, message: string): void {
  checks += 1;
  if (!condition) failures.push(message);
}

async function call(method: string, path: string, payload?: unknown, headers: Record<string, string> = {}) {
  const response = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  const text = await response.text();
  return { status: response.status, body: (text ? JSON.parse(text) : {}) as Record<string, unknown> };
}

async function signIn(email: string): Promise<Record<string, string>> {
  const result = await call('POST', '/v1/auth/login', { email, password });
  check(result.status === 200, `sign-in ${email}: status ${result.status}`);
  return { Authorization: `Bearer ${String(result.body.token)}` };
}

if (!password || !webhookSecret) {
  console.error('Set OMBRE_DEMO_PASSWORD and OMBRE_SANDBOX_WEBHOOK_SECRET to the values the stack was started with.');
  process.exit(1);
}

const spots = (await call('GET', `/v1/beaches/${slug}/availability?day=${day}`)).body.spots as { spotId: string; code: string; shared: boolean }[];
const spot = spots.find((candidate) => candidate.shared) ?? spots[0];
if (!spot) {
  console.error('No free spot on the demo day: start from a fresh database.');
  process.exit(1);
}

const held = await call('POST', '/v1/holds', { beachSlug: slug, spotId: spot.spotId, day, promoCode: 'MARE10' }, { 'Idempotency-Key': `smoke-${randomUUID()}` });
check(held.status === 201 && held.body.totalCents === 2700, `hold: status ${held.status}, total ${String(held.body.totalCents)}`);

const checkout = await call('POST', '/v1/checkouts', { beachSlug: slug, holdId: held.body.holdId, guestName: 'Ospite di Prova', guestEmail: 'ospite@example.org', locale: 'it' });
check(checkout.status === 201 && checkout.body.status === 'under_review', `checkout: status ${checkout.status}`);
const guest = { Authorization: `Bearer ${String(checkout.body.accessToken)}` };
const bookingPath = `/v1/beaches/${slug}/bookings/${String(checkout.body.bookingId)}`;
check((await call('GET', bookingPath, undefined, guest)).body.passCredential === null, 'booking: a pass exists before the payment');

const reference = (checkout.body.payment as { reference: string }).reference;
const raw = JSON.stringify({ eventId: `evt_${randomUUID()}`, reference, outcome: 'succeeded' });
const signature = createHmac('sha256', webhookSecret).update(raw).digest('hex');
const notify = (sign: string) => fetch(`${base}/v1/payment-webhooks/sandbox`, { method: 'POST', headers: { 'X-Ombre-Signature': sign }, body: raw });
check((await notify('0'.repeat(64))).status === 401, 'webhook: a wrong signature was accepted');
check(((await (await notify(signature)).json()) as { result: string }).result === 'confirmed', 'webhook: the payment did not confirm the booking');
check(((await (await notify(signature)).json()) as { result: string }).result === 'duplicate', 'webhook: a repeated notification was applied twice');

const booking = (await call('GET', bookingPath, undefined, guest)).body;
check(booking.status === 'confirmed' && /^OM-270617-\d{3}$/.test(String(booking.code)), `booking: status ${String(booking.status)}, code ${String(booking.code)}`);
check(typeof booking.passCredential === 'string', 'booking: no pass after confirmation');
check(!((await call('GET', `/v1/beaches/${slug}/availability?day=${day}`)).body.spots as { spotId: string }[]).some((free) => free.spotId === spot.spotId), 'availability: the sold spot is still offered');

const reception = await signIn('reception@bagnodelledune.example');
const scan = await call('POST', `/v1/manage/beaches/${slug}/access-events`, { credential: booking.passCredential, kind: 'entry' }, reception);
check(scan.status === 409 && (scan.body.error as { code: string }).code === 'wrong_day', `front desk: a pass for ${day} was not refused today (status ${scan.status})`);
const listed = (await call('GET', `/v1/manage/beaches/${slug}/bookings?day=${day}`, undefined, reception)).body.bookings as { code: string }[];
check(listed.some((row) => row.code === booking.code), 'front desk: the booking is not in the list of the day');
check((await call('PUT', `/v1/manage/beaches/${slug}/inventory/price`, { spotId: spot.spotId, day, priceCents: 1 }, reception)).status === 403, 'front desk: was allowed to change a price');

const accounting = await signIn('contabilita@bagnodelledune.example');
const report = (await call('GET', `/v1/manage/beaches/${slug}/reports/summary?from=${day}&to=${day}`, undefined, accounting)).body as { byParty: Record<string, { expected: number }>; bookings: { shared: number; ordinary: number } };
const parties = report.byParty;
check(parties.platform!.expected + parties.beach_club!.expected + parties.season_holder!.expected >= 2700, 'report: the shares do not cover the sale');
if (spot.shared) {
  check(parties.season_holder!.expected >= 1350, `report: season holder share is ${parties.season_holder!.expected}, expected at least 1350`);
  const holder = await signIn('stagionale@bagnodelledune.example');
  const contracts = (await call('GET', '/v1/season/contracts', undefined, holder)).body.contracts as { contractId: string; spotCode: string }[];
  check(contracts.length === 1 && contracts[0]!.spotCode === 'B02', 'season holder: the demo season pass is not listed');
  const statement = await call('GET', `/v1/season/contracts/${contracts[0]!.contractId}/statement`, undefined, holder);
  const soldDay = (statement.body.days as { day: string; sold: boolean; shareCents: number }[]).find((row) => row.day === day);
  check(soldDay?.sold === true && soldDay.shareCents === 1350, 'season holder: the statement does not show the 13.50 share');
  check(!JSON.stringify(statement.body).includes('ospite@example.org'), 'season holder: the statement shows guest data');
}

if (failures.length > 0) {
  console.error(`${failures.length} of ${checks} checks failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`All ${checks} checks passed on ${base}: booking ${String(booking.code)} on spot ${spot.code} confirmed, shares and roles verified.`);
