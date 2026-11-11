// End to end checks on a running API with the demo beach club (OMBRE_SEED_DEMO=true).
// Usage: node scripts/smoke-api.ts [base address]   (default http://127.0.0.1:3211)
import { randomUUID } from 'node:crypto';

const base = (process.argv[2] ?? 'http://127.0.0.1:3211').replace(/\/+$/, '');
const slug = 'bagno-delle-dune';
const day = '2027-06-17';
const failures: string[] = [];
let checks = 0;

function check(condition: boolean, message: string): void {
  checks += 1;
  if (!condition) failures.push(message);
}

interface Spot {
  spotId: string;
  code: string;
  priceCents: number;
}

async function freeSpots(): Promise<Spot[]> {
  const response = await fetch(`${base}/v1/beaches/${slug}/availability?day=${day}`);
  check(response.status === 200, `availability: status ${response.status}`);
  return ((await response.json()) as { spots: Spot[] }).spots;
}

function post(path: string, payload: unknown, key?: string): Promise<Response> {
  return fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) },
    body: JSON.stringify(payload),
  });
}

const health = await fetch(`${base}/v1/health`);
check(health.status === 200, `health: status ${health.status}`);

const beaches = (await (await fetch(`${base}/v1/beaches`)).json()) as { beaches: { slug: string; demo: boolean }[] };
check(beaches.beaches.some((beach) => beach.slug === slug && beach.demo), 'beaches: demo beach club missing');

const before = await freeSpots();
const spot = before[0];
if (!spot) {
  console.error('No free spot on the demo day: start from a fresh database or wait for the holds to run out.');
  process.exit(1);
}
const request = { beachSlug: slug, spotId: spot.spotId, day, promoCode: 'MARE10' };

const quote = (await (await post('/v1/quotes', request)).json()) as { listPriceCents: number; totalCents: number };
check(quote.listPriceCents === 3000 && quote.totalCents === 2700, `quote: ${quote.listPriceCents} -> ${quote.totalCents}, expected 3000 -> 2700`);

const keys = Array.from({ length: 10 }, () => `smoke-${randomUUID()}`);
const attempts = await Promise.all(keys.map((key) => post('/v1/holds', request, key)));
const statuses = attempts.map((response) => response.status);
const winners = statuses.filter((status) => status === 201).length;
check(winners === 1, `holds: ${winners} buyers won the same day, expected exactly 1 (${statuses.join(' ')})`);
check(statuses.filter((status) => status === 409).length === 9, `holds: expected 9 conflicts (${statuses.join(' ')})`);

const winnerIndex = statuses.indexOf(201);
if (winnerIndex >= 0) {
  const held = (await attempts[winnerIndex]!.json()) as { holdId: string; totalCents: number };
  check(held.totalCents === 2700, `hold: total ${held.totalCents}, expected 2700`);
  const replay = await post('/v1/holds', request, keys[winnerIndex]);
  check(replay.status === 200, `replay: status ${replay.status}, expected 200`);
  check(((await replay.json()) as { holdId: string }).holdId === held.holdId, 'replay: a different hold was returned');
}

const after = await freeSpots();
check(!after.some((free) => free.spotId === spot.spotId), `availability: ${spot.code} is still listed as free`);
check(after.length === before.length - 1, `availability: ${after.length} free spots, expected ${before.length - 1}`);

const bad = await post('/v1/holds', request);
const badBody = (await bad.json()) as { error?: { code?: string } };
check(bad.status === 400 && badBody.error?.code === 'idempotency_key_required', 'missing key: not refused with a clear code');

if (failures.length > 0) {
  console.error(`${failures.length} of ${checks} checks failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`All ${checks} checks passed on ${base}: spot ${spot.code} held once out of 10 simultaneous buyers.`);
