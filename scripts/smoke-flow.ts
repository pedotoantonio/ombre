// Walks the booking path on the running site, as a browser without scripts would.
// Needs the demo beach club (OMBRE_SEED_DEMO=true).
// Usage: node scripts/smoke-flow.ts [base address]   (default http://127.0.0.1:3210)
import { randomUUID } from 'node:crypto';

const base = (process.argv[2] ?? 'http://127.0.0.1:3210').replace(/\/+$/, '');
const beach = '/bagni/bagno-delle-dune';
const failures: string[] = [];
let checks = 0;

function check(condition: boolean, message: string): void {
  checks += 1;
  if (!condition) failures.push(message);
}

async function page(path: string): Promise<{ status: number; html: string }> {
  const response = await fetch(base + path, { redirect: 'manual' });
  return { status: response.status, html: (await response.text()).replaceAll('&amp;', '&') };
}

function submit(fields: Record<string, string>, origin = base): Promise<Response> {
  return fetch(`${base}/azioni/riserva`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: origin },
    body: new URLSearchParams(fields).toString(),
  });
}

const explore = await page('/esplora');
check(explore.status === 200 && explore.html.includes('Bagno delle Dune'), 'explore: the demo beach club is not listed');
check(explore.html.includes(`href="${beach}"`), 'explore: no link to the beach club page');

const club = await page(beach);
check(club.status === 200, `beach page: status ${club.status}`);
check((club.html.match(/<h1\b/g) ?? []).length === 1, 'beach page: expected exactly one h1');
check(/<meta name="robots" content="noindex/.test(club.html), 'beach page: demo data must not be indexable');
const links = [...club.html.matchAll(/href="(\/bagni\/bagno-delle-dune\/prenota\?spot=([0-9a-f-]{36})&day=(\d{4}-\d{2}-\d{2}))"/g)];
check(links.length > 0, 'beach page: no free spot to choose');

const chosen = links[0];
if (!chosen) {
  console.error(`Cannot continue: ${failures.join('; ')}`);
  process.exit(1);
}
const [, bookHref, spotId, day] = chosen as unknown as [string, string, string, string];

const refused = await page(`${bookHref}&promo=INESISTENTE`);
check(refused.html.includes('Questo codice non si può applicare'), 'summary: an unknown promo code is not reported');

const summary = await page(`${bookHref}&promo=MARE10`);
check(summary.status === 200, `summary: status ${summary.status}`);
check(summary.html.includes('30,00') && summary.html.includes('27,00'), 'summary: MARE10 does not turn 30,00 into 27,00');
const key = /name="key" value="(web-[0-9a-f-]{36})"/.exec(summary.html)?.[1] ?? '';
check(key !== '', 'summary: the form has no idempotency key');

const fields = { lang: 'it', beach: 'bagno-delle-dune', spot: spotId, day, promo: 'MARE10', key };
const created = await submit(fields);
const holdUrl = created.headers.get('location') ?? '';
check(created.status === 303 && /\/riserva\/[0-9a-f-]{36}$/.test(holdUrl), `hold: status ${created.status}, location ${holdUrl}`);

const again = await submit(fields);
check(again.headers.get('location') === holdUrl, 'hold: sending the same form twice created a second hold');

const rival = await submit({ ...fields, key: `web-${randomUUID()}` });
check((rival.headers.get('location') ?? '').includes('taken=1'), 'hold: a second buyer was not sent back with a notice');

const foreign = await submit({ ...fields, key: `web-${randomUUID()}` }, 'https://example.org');
check(foreign.status === 403, `hold: a form posted from another site got status ${foreign.status}`);

const held = await page(holdUrl);
check(held.status === 200 && held.html.includes('Riserva attiva'), 'hold page: the hold is not shown as active');
check(held.html.includes('27,00') && held.html.includes('Sconto MARE10'), 'hold page: the saved price is not shown');
check(/<meta name="robots" content="noindex/.test(held.html), 'hold page: must not be indexable');

const after = await page(`${beach}?day=${day}`);
check(!after.html.includes(spotId), 'beach page: the held spot is still offered');

const english = await page('/en/beach-clubs/bagno-delle-dune');
check(english.status === 200 && english.html.includes('<html lang="en"') && english.html.includes('Free spots on'), 'english beach page: not served in English');
check(english.html.includes(`href="${beach}"`), 'english beach page: no link to the Italian version');
check((await page(holdUrl.replace('/bagni/', '/en/beach-clubs/').replace('/riserva/', '/hold/'))).html.includes('Hold active'), 'english hold page: not served');

check((await page('/en/bagni/bagno-delle-dune')).status === 404, 'italian section under /en must be 404');
check((await page('/bagni/bagno-che-non-esiste')).status === 404, 'unknown beach club must be 404');
check((await page(`${beach}/prenota?spot=non-valido&day=${day}`)).status === 404, 'invalid spot must be 404');

if (failures.length > 0) {
  console.error(`${failures.length} of ${checks} checks failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`All ${checks} checks passed on ${base}: explore, beach page, summary with MARE10, hold, replay, conflict, both languages.`);
