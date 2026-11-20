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

const demoDay = '2027-06-17';
const count = (html: string, pattern: RegExp): number => (html.match(pattern) ?? []).length;
const brand = process.env.OMBRE_BRAND_NAME?.trim() || 'Ombrè';
const titleOf = (html: string): string => /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? '';

// ---- Home page: the search is a plain form that opens the explore page ----
const home = await page('/');
const form = /<form class="portal-search"[^>]*>[^]*?<\/form>/.exec(home.html)?.[0] ?? '';
check(/method="get"/.test(form) && /action="\/ricerca-ombrellone#risultati"/.test(form) && /role="search"/.test(form), 'home: no search form that opens the explore page at its results');
for (const name of ['place', 'day', 'to', 'guests', 'shared']) check(form.includes(`name="${name}"`), `home: the search has no "${name}" field`);
// The home search form carries no date limit; the explore page, rendered per request, starts from today.
const exploreForm = /<form class="portal-search"[^>]*>[^]*?<\/form>/.exec((await page('/ricerca-ombrellone')).html)?.[0] ?? '';
const firstDay = /name="day"[^>]*min="(\d{4}-\d{2}-\d{2})"|min="(\d{4}-\d{2}-\d{2})"[^>]*name="day"/.exec(exploreForm);
const romeToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
check((firstDay?.[1] ?? firstDay?.[2]) === romeToday, `explore: the search does not start from today (${firstDay?.[1] ?? firstDay?.[2]})`);
// Besides the search, the only other PRIMARY button is the invitation to Explore inside
// the map box; since D70 the «Per chi è» cards carry three SECONDARY buttons (their CTAs),
// which are welcome — but nothing else joins them.
const mapBox = /<div class="portal-map__invite">[^]*?<\/div>/.exec(home.html)?.[0] ?? '';
const homeButtons = home.html.replace(mapBox, '').match(/class="button( [^"]*)?"/g) ?? [];
check(count(form, /type="submit"/g) === 1 && homeButtons.filter((cls) => !cls.includes('button--secondary')).length === 1, 'home: expected exactly one main button, the search');
check(homeButtons.filter((cls) => cls.includes('button--secondary card__cta')).length === 3 && homeButtons.length === 4, 'home: expected the three secondary buttons of the «Per chi è» cards and nothing else (D70)');
check(mapBox.includes('href="/ricerca-ombrellone"') && home.html.indexOf('class="portal-search"') < home.html.indexOf('class="portal-map'), 'home: the map box has no invitation to Explore after the search form');
// The list fallback (D69): the server renders the clubs with their links inside the map box,
// and the old "map not available" notice is gone for good.
check(new RegExp(`class="portal-map__list"[^]*?href="${beach}"`).test(home.html), 'home: the map box has no server-rendered list of the beach clubs');
check(!home.html.includes('Mappa non disponibile'), 'home: the "map not available" notice is back');
check(/action="\/en\/umbrella-search#risultati"/.test((await page('/en')).html), 'english home: the search does not open the English search page');
check(/action="\/ricerca-ombrellone#risultati"/.test(exploreForm), 'explore: a new search does not land on the results');

// ---- Explore: plain list, then searches by day, guests, shared days and place ----
const explore = await page('/ricerca-ombrellone');
check(explore.status === 200 && explore.html.includes('Bagno delle Dune'), 'explore: the demo beach club is not listed');
check(explore.html.includes(`href="${beach}"`), 'explore: no link to the beach club page');
check(new RegExp(`class="portal-map__list"[^]*?href="${beach}"`).test(explore.html), 'explore: the map block has no server-rendered list of the results');
check(!explore.html.includes('postazioni libere</span>') && explore.html.includes('Indica un giorno'), 'explore: free spots shown without a day, or no hint to choose one');

const searched = await page(`/ricerca-ombrellone?day=${demoDay}&guests=2`);
check(searched.html.includes('8 postazioni libere') && searched.html.includes('da 30,00'), 'search: free spots and "from" price of the demo day are not shown');
check(searched.html.includes(`href="${beach}?day=${demoDay}"`), 'search: the card does not carry the day to the beach club page');
const results = /id="risultati"[^]*$/.exec(searched.html)?.[0] ?? '';
check(count(searched.html, /id="risultati"/g) === 1 && results.includes('<h2>Disponibilità per') && !results.includes('<form class="portal-search"'), 'search: the results anchor is missing, or it is not right before the results heading');
check(/<meta name="robots" content="noindex/.test(searched.html), 'search: a page with parameters must not be indexable');
check(/<link rel="canonical" href="[^"?]*\/ricerca-ombrellone"/.test(searched.html), 'search: the canonical address is not the plain explore page');
check(searched.html.includes(`href="/en/umbrella-search?day=${demoDay}&guests=2"`), 'search: the link to the other language loses the search');
check((await page(`/ricerca-ombrellone?day=${demoDay}&guests=2&shared=1`)).html.includes('1 postazione libera<'), 'search: shared days only should leave one free spot');
const tooMany = await page(`/ricerca-ombrellone?day=${demoDay}&guests=3`);
check(tooMany.html.includes('Nessuna postazione libera per questa ricerca') && !tooMany.html.includes('da 30,00'), 'search: no clear empty state when no spot fits the guests');
check((await page('/ricerca-ombrellone?place=Rimini')).html.includes('Nessuno stabilimento corrisponde alla ricerca'), 'search: no clear empty state for an unknown place');
check((await page(`/ricerca-ombrellone?place=pomposa&day=${demoDay}`)).html.includes('8 postazioni libere'), 'search: the place is not matched without regard to case');
const past = await page('/ricerca-ombrellone?day=2020-06-17&guests=2');
check(past.html.includes('già passato') && past.html.includes('Bagno delle Dune') && !past.html.includes('da 30,00'), 'search: a past day is not explained');
// A refused dal–al period (D39) must come back in words, not as a bare error.
const backwards = await page(`/ricerca-ombrellone?day=2027-06-18&to=${demoDay}&guests=2`);
check(backwards.status === 200 && backwards.html.includes('viene prima della data'), 'search: a backwards period is not explained in words');
const tooLong = await page(`/ricerca-ombrellone?day=${demoDay}&to=2027-07-20&guests=2`);
check(tooLong.status === 200 && tooLong.html.includes('supera le 31 giornate'), 'search: a period over 31 days is not explained in words');
const searchedEnglish = await page(`/en/umbrella-search?day=${demoDay}&guests=2`);
check(searchedEnglish.html.includes('8 free spots') && searchedEnglish.html.includes(`href="/en/beach-clubs/bagno-delle-dune?day=${demoDay}"`), 'english search: results not served in English');

// ---- Beach page: map with every spot, equivalent list, choice without scripts ----
const club = await page(beach);
check(club.status === 200, `beach page: status ${club.status}`);
check((club.html.match(/<h1\b/g) ?? []).length === 1, 'beach page: expected exactly one h1');
check(/<meta name="robots" content="noindex/.test(club.html), 'beach page: demo data must not be indexable');
const mapLinks = [...club.html.matchAll(/<a class="plan-spot plan-spot--(free|shared)"[^>]*href="(\/bagni\/bagno-delle-dune\?day=(\d{4}-\d{2}-\d{2})&spot=([0-9a-f-]{36}))#postazione-[A-Z]\d{2}"/g)];
const listLinks = [...club.html.matchAll(/href="\/bagni\/bagno-delle-dune\/prenota\?spot=([0-9a-f-]{36})&day=\d{4}-\d{2}-\d{2}"/g)];
const takenBefore = count(club.html, /class="plan-spot plan-spot--taken"/g);
check(mapLinks.length > 0, 'beach page: no free spot to choose on the map');
check(mapLinks.length + takenBefore === 8, `beach page: the map draws ${mapLinks.length + takenBefore} spots, expected all 8`);
check(mapLinks.length === listLinks.length && mapLinks.every((link) => listLinks.some((item) => item[1] === link[4])), 'beach page: the list is not equivalent to the map');
check(count(club.html, /class="spot__code"/g) === mapLinks.length, 'beach page: the list does not show one card per free spot');
check(['Legenda', 'Libera, giornata condivisa', 'Non disponibile', 'Scelta da te'].every((text) => club.html.includes(text)), 'beach page: the map has no text legend');
// Rows never wrap: the map scrolls inside a labelled region the keyboard can reach, with the sea marked beside row 1.
const scroller = /<div class="plan__scroll"[^>]*>/.exec(club.html)?.[0] ?? '';
check(/role="region"/.test(scroller) && /aria-label="[^"]+"/.test(scroller) && /tabindex="0"/i.test(scroller), 'beach page: the map is not a labelled, focusable scrolling region');
const seaAt = club.html.indexOf('class="plan__sea"');
check(seaAt > 0 && seaAt < club.html.indexOf('class="plan-row"') && />Mare</.test(club.html.slice(seaAt, seaAt + 600)), 'beach page: no sea marker before the first row');
check(club.html.includes('class="plan__hint"') && club.html.includes('--plan-cols:4'), 'beach page: no hint that the map scrolls, or the width of the rows is not given');
check(!club.html.includes('class="plan-bar"') && !club.html.includes('aria-current="true"'), 'beach page: a spot is shown as chosen before any choice');

const chosen = mapLinks[0];
if (!chosen) {
  console.error(`Cannot continue: ${failures.join('; ')}`);
  process.exit(1);
}
const [, , selectHref, day, spotId] = chosen as unknown as [string, string, string, string, string];

const selected = await page(selectHref);
const bar = /<aside class="plan-bar"[^>]*>[^]*?<\/aside>/.exec(selected.html)?.[0] ?? '';
const bookHref = /href="(\/bagni\/bagno-delle-dune\/prenota\?spot=[0-9a-f-]{36}&day=\d{4}-\d{2}-\d{2})"/.exec(bar)?.[1] ?? '';
check(bookHref === `${beach}/prenota?spot=${spotId}&day=${day}`, `choice: the bar does not lead to the summary of the chosen spot (${bookHref})`);
// The title of the bar names the spot with its zone and row: "Postazione A02, ombrelloni, fila 1".
// Two links: the type name towards its card (D63) and the one step forward.
check(bar.includes('30,00') && /fila \d/.test(bar) && bar.includes('ombrellone') && count(bar, /<a /g) === 2, 'choice: the bar does not show row, equipment and price with one button');
check(/<a [^>]*href="\/bagni\/bagno-delle-dune\/postazioni\/[0-9a-f-]{36}\?torna=[^"]*%23scelta"/.test(bar), 'choice: the type name in the bar does not link its card with the exact return');
check(count(selected.html, /<a class="plan-spot[^"]*plan-spot--selected"[^>]*aria-current="true"/g) === 1, 'choice: the chosen spot is not marked on the map');
check(selected.html.includes('Hai scelto la postazione') && selected.html.includes('href="#scelta"'), 'choice: the choice is not stated in words');
check(!(await page(`${beach}?day=${day}&spot=non-valido`)).html.includes('class="plan-bar"'), 'choice: an invalid spot opened the bar');
check(selected.html.includes(`href="/en/beach-clubs/bagno-delle-dune?day=${day}&spot=${spotId}"`), 'choice: the link to the other language loses the choice');

const refused = await page(`${bookHref}&promo=INESISTENTE`);
check(refused.html.includes('Questo codice non si può applicare'), 'summary: an unknown promo code is not reported');

const summary = await page(`${bookHref}&promo=MARE10`);
check(summary.status === 200, `summary: status ${summary.status}`);
check(titleOf(summary.html) === `Riepilogo · Bagno delle Dune | ${brand}`, `summary: the title is "${titleOf(summary.html)}"`);
check(/<meta name="robots" content="noindex/.test(summary.html), 'summary: must not be indexable');
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
check(titleOf(held.html) === `Riserva · Bagno delle Dune | ${brand}`, `hold page: the title is "${titleOf(held.html)}"`);

const after = await page(`${beach}?day=${day}`);
check(!after.html.includes(spotId), 'beach page: the held spot is still offered');
check(count(after.html, /class="plan-spot plan-spot--taken"/g) === takenBefore + 1, 'beach page: the held spot is not drawn as unavailable');
check(count(after.html, /<a class="plan-spot /g) === mapLinks.length - 1, 'beach page: the held spot is still a link on the map');
const gone = await page(selectHref);
check(gone.html.includes('non è più libera') && !gone.html.includes('class="plan-bar"'), 'choice: a spot taken in the meantime still opens the bar');
check((await page(`/ricerca-ombrellone?day=${day}&guests=2`)).html.includes(`${mapLinks.length - 1} postazioni libere`), 'search: the held spot is still counted as free');

const english = await page('/en/beach-clubs/bagno-delle-dune');
check(english.status === 200 && english.html.includes('<html lang="en"') && english.html.includes('Free spots on'), 'english beach page: not served in English');
check(english.html.includes('Beach map') && english.html.includes('Not available') && english.html.includes('List of free spots'), 'english beach page: map and list not in English');
check(english.html.includes(`href="${beach}"`), 'english beach page: no link to the Italian version');
const englishHold = await page(holdUrl.replace('/bagni/', '/en/beach-clubs/').replace('/riserva/', '/hold/'));
check(englishHold.html.includes('Hold active') && titleOf(englishHold.html) === `Hold · Bagno delle Dune | ${brand}`, 'english hold page: not served, or without its title');

check((await page('/en/bagni/bagno-delle-dune')).status === 404, 'italian section under /en must be 404');
check((await page('/bagni/bagno-che-non-esiste')).status === 404, 'unknown beach club must be 404');
check((await page(`${beach}/prenota?spot=non-valido&day=${day}`)).status === 404, 'invalid spot must be 404');

if (failures.length > 0) {
  console.error(`${failures.length} of ${checks} checks failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`All ${checks} checks passed on ${base}: home search, explore, map and choice, summary with MARE10, hold, replay, conflict, both languages.`);
