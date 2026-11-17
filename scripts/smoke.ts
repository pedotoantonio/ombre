// Checks the pages as a crawler receives them: plain HTML, no scripts executed.
// Usage: node scripts/smoke.ts [base address]   (default http://127.0.0.1:3210)

const base = (process.argv[2] ?? 'http://127.0.0.1:3210').replace(/\/+$/, '');
const siteUrl = (process.env.OMBRE_SITE_URL ?? 'http://localhost:3210').replace(/\/+$/, '');
const indexable = process.env.OMBRE_INDEXABLE === 'true';
const brand = process.env.OMBRE_BRAND_NAME?.trim() || 'Ombrè';
// Set to "true" or "false" to require that notice; unset, the check follows what the site shows.
const demoMode = process.env.OMBRE_DEMO_MODE;

const pages: { it: string; en: string; types: string[] }[] = [
  { it: '/', en: '/en', types: ['WebSite'] },
  { it: '/ricerca-ombrellone', en: '/en/umbrella-search', types: ['BreadcrumbList'] },
  { it: '/come-funziona', en: '/en/how-it-works', types: ['BreadcrumbList'] },
  { it: '/gestore-stabilimento', en: '/en/beach-manager', types: ['BreadcrumbList'] },
  { it: '/stagionale', en: '/en/season-holder', types: ['BreadcrumbList'] },
  { it: '/assistenza', en: '/en/help', types: ['BreadcrumbList', 'FAQPage'] },
];

const failures: string[] = [];
let checks = 0;

function check(condition: boolean, message: string): void {
  checks += 1;
  if (!condition) failures.push(message);
}

function absolute(path: string): string {
  return path === '/' ? siteUrl : `${siteUrl}${path}`;
}

function attribute(tag: string, name: string): string | null {
  return new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1] ?? null;
}

function tags(html: string, name: string): string[] {
  return html.match(new RegExp(`<${name}\\b[^>]*>`, 'g')) ?? [];
}

const titles = new Map<string, string>();
const descriptions = new Map<string, string>();

async function checkPage(path: string, lang: 'it' | 'en', pair: { it: string; en: string }, types: string[]) {
  const response = await fetch(base + path, { redirect: 'manual' });
  check(response.status === 200, `${path}: status ${response.status}, expected 200`);
  if (response.status !== 200) return;
  const html = await response.text();

  check(attribute(tags(html, 'html')[0] ?? '', 'lang') === lang, `${path}: html lang is not "${lang}"`);
  check(tags(html, 'h1').length === 1, `${path}: expected exactly one h1, found ${tags(html, 'h1').length}`);

  const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? '';
  check(title.length > 10, `${path}: missing title`);
  check(!titles.has(title), `${path}: same title as ${titles.get(title)}`);
  titles.set(title, path);

  const metas = tags(html, 'meta');
  const description = attribute(metas.find((tag) => attribute(tag, 'name') === 'description') ?? '', 'content') ?? '';
  check(description.length >= 90, `${path}: missing or short description`);
  check(!descriptions.has(description), `${path}: same description as ${descriptions.get(description)}`);
  descriptions.set(description, path);

  const links = tags(html, 'link');
  const canonical = attribute(links.find((tag) => attribute(tag, 'rel') === 'canonical') ?? '', 'href');
  check(canonical === absolute(path), `${path}: canonical is ${canonical}, expected ${absolute(path)}`);

  const alternates = new Map(
    links
      .filter((tag) => attribute(tag, 'rel') === 'alternate' && attribute(tag, 'hrefLang'))
      .map((tag) => [attribute(tag, 'hrefLang'), attribute(tag, 'href')]),
  );
  check(alternates.get('it') === absolute(pair.it), `${path}: hreflang it is ${alternates.get('it')}`);
  check(alternates.get('en') === absolute(pair.en), `${path}: hreflang en is ${alternates.get('en')}`);
  check(alternates.get('x-default') === absolute(pair.it), `${path}: hreflang x-default is ${alternates.get('x-default')}`);

  const robotsMeta = attribute(metas.find((tag) => attribute(tag, 'name') === 'robots') ?? '', 'content') ?? '';
  const robotsHeader = response.headers.get('x-robots-tag') ?? '';
  if (indexable) {
    check(!robotsMeta.includes('noindex') && !robotsHeader.includes('noindex'), `${path}: marked noindex on an indexable site`);
  } else {
    check(robotsMeta.includes('noindex') && robotsHeader.includes('noindex'), `${path}: not marked noindex while the site is not indexable`);
  }

  const found: string[] = [];
  for (const match of html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)) {
    try {
      const data = JSON.parse(match[1] ?? '') as { '@type'?: string };
      if (data['@type']) found.push(data['@type']);
    } catch {
      failures.push(`${path}: structured data is not valid JSON`);
    }
  }
  check(JSON.stringify(found.sort()) === JSON.stringify([...types].sort()), `${path}: structured data ${found.join(', ')}, expected ${types.join(', ')}`);

  check(html.includes(`href="${pair[lang === 'it' ? 'en' : 'it']}"`), `${path}: no link to the other language`);
  check(response.headers.get('x-content-type-options') === 'nosniff', `${path}: missing security headers`);
  check((response.headers.get('content-security-policy') ?? '').includes("frame-ancestors 'none'"), `${path}: missing content security policy`);
}

async function expectStatus(path: string, status: number, location?: string) {
  const response = await fetch(base + path, { redirect: 'manual' });
  check(response.status === status, `${path}: status ${response.status}, expected ${status}`);
  if (location) {
    const target = response.headers.get('location');
    check(target === location, `${path}: redirects to ${target}, expected ${location}`);
  }
}

for (const page of pages) {
  await checkPage(page.it, 'it', page, page.types);
  await checkPage(page.en, 'en', page, page.types);
}

// A search is one view of the umbrella-search page: never indexed, canonical on the plain address.
for (const [path, plain] of [['/ricerca-ombrellone?day=2027-06-17&guests=2', '/ricerca-ombrellone'], ['/en/umbrella-search?place=mare', '/en/umbrella-search']] as const) {
  const response = await fetch(base + path, { redirect: 'manual' });
  const html = await response.text();
  const robotsMeta = attribute(tags(html, 'meta').find((tag) => attribute(tag, 'name') === 'robots') ?? '', 'content') ?? '';
  const canonical = attribute(tags(html, 'link').find((tag) => attribute(tag, 'rel') === 'canonical') ?? '', 'href');
  check(response.status === 200 && tags(html, 'h1').length === 1, `${path}: status ${response.status} or not exactly one h1`);
  check(robotsMeta.includes('noindex'), `${path}: a search must be noindex, found "${robotsMeta}"`);
  check(!indexable || robotsMeta.includes('follow'), `${path}: a search should still let links be followed`);
  check(canonical === absolute(plain), `${path}: canonical is ${canonical}, expected ${absolute(plain)}`);
}

await expectStatus('/it', 308, '/');
await expectStatus('/it/come-funziona', 308, '/come-funziona');

// The renamed pages (D41): every old address answers 301 towards the address of today,
// and a search carried by the old address is not lost.
await expectStatus('/esplora', 301, `${base}/ricerca-ombrellone`);
await expectStatus('/en/explore', 301, `${base}/en/umbrella-search`);
await expectStatus('/per-gli-stabilimenti', 301, `${base}/gestore-stabilimento`);
await expectStatus('/en/for-beach-clubs', 301, `${base}/en/beach-manager`);
await expectStatus('/per-gli-stagionali', 301, `${base}/stagionale`);
await expectStatus('/en/for-season-holders', 301, `${base}/en/season-holder`);
await expectStatus('/esplora?day=2027-06-17&guests=2', 301, `${base}/ricerca-ombrellone?day=2027-06-17&guests=2`);

await expectStatus('/pagina-che-non-esiste', 404);
await expectStatus('/en/pagina-che-non-esiste', 404);
await expectStatus('/en/come-funziona', 404);
await expectStatus('/fr', 404);

// An unknown address gets the site's own page, in the language of the address, readable without scripts.
const notFound = { it: { heading: 'Pagina non trovata', home: '/', explore: '/ricerca-ombrellone' }, en: { heading: 'Page not found', home: '/en', explore: '/en/umbrella-search' } };
for (const [path, lang] of [['/pagina-che-non-esiste', 'it'], ['/fr', 'it'], ['/una/pagina/molto/in/fondo', 'it'], ['/en/pagina-che-non-esiste', 'en'], ['/en/come-funziona', 'en'], ['/en/bagni/bagno-delle-dune', 'en']] as const) {
  const response = await fetch(base + path, { redirect: 'manual' });
  const html = await response.text();
  const expected = notFound[lang];
  const main = /<main\b[^]*<\/main>/.exec(html)?.[0] ?? '';
  check(response.status === 404, `${path}: status ${response.status}, expected 404`);
  check(attribute(tags(html, 'html')[0] ?? '', 'lang') === lang, `${path}: the not-found page is not in "${lang}"`);
  check(new RegExp(`<h1[^>]*>${expected.heading}</h1>`).test(main) && tags(html, 'h1').length === 1, `${path}: no "${expected.heading}" heading in the page as served`);
  check(html.includes('class="site-header"') && html.includes('class="site-footer"'), `${path}: the not-found page is outside the site shell`);
  check(main.includes(`href="${expected.home}"`) && main.includes(`href="${expected.explore}"`), `${path}: no links to the home page and to Explore`);
  check((/<title>([^<]*)<\/title>/.exec(html)?.[1] ?? '') === `${expected.heading} | ${brand}`, `${path}: the title is not "${expected.heading} | ${brand}"`);
  check(tags(html, 'meta').some((tag) => attribute(tag, 'name') === 'robots' && (attribute(tag, 'content') ?? '').includes('noindex')), `${path}: a not-found page must be noindex`);
}

// A /paga link with an unusable token answers the polite page as plain HTML, status 404,
// noindex, in the language of the address — rendered on the server, scripts or not
// (spec §4.3; regression of the wave B acceptance run: the message reached the
// visitor only through scripts, so without JavaScript the page was blank).
const payGone = { it: { path: '/paga/', title: 'Collegamento non più valido' }, en: { path: '/en/pay/', title: 'Link no longer valid' } } as const;
for (const lang of ['it', 'en'] as const) {
  const target = `${payGone[lang].path}00000000-0000-4000-8000-000000000000.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`;
  const response = await fetch(base + target, { redirect: 'manual' });
  const html = await response.text();
  const main = /<main\b[^]*<\/main>/.exec(html)?.[0] ?? '';
  check(response.status === 404, `${target}: status ${response.status}, expected 404`);
  check(new RegExp(`<h1[^>]*>${payGone[lang].title}</h1>`).test(main), `${target}: no "${payGone[lang].title}" heading in the page as served`);
  check(tags(html, 'meta').some((tag) => attribute(tag, 'name') === 'robots' && (attribute(tag, 'content') ?? '').includes('noindex')), `${target}: the polite /paga page must be noindex`);
}
// Reserved pages are never indexed, but they still need a title: here the one that needs no sign-in.
for (const [path, title] of [['/area/accesso', 'Accedi'], ['/en/account/sign-in', 'Sign in']] as const) {
  const html = await (await fetch(base + path, { redirect: 'manual' })).text();
  check((/<title>([^<]*)<\/title>/.exec(html)?.[1] ?? '') === `${title} | ${brand}`, `${path}: the title is not "${title} | ${brand}"`);
  check(tags(html, 'meta').some((tag) => attribute(tag, 'name') === 'robots' && (attribute(tag, 'content') ?? '').includes('noindex')), `${path}: a reserved page must be noindex`);
}

// The notice at the top: one at most, the same kind in both languages, and never the pre-launch
// wording on a demonstration environment, where bookings can be tried.
const notices = { demo: { it: 'Ambiente dimostrativo', en: 'Demonstration environment' }, preLaunch: { it: 'Servizio in preparazione', en: 'Service in preparation' } };
const noticeOf = async (path: string, lang: 'it' | 'en') => {
  const found = [...(await (await fetch(base + path)).text()).matchAll(/<p class="notice[^"]*">([^<]*)<\/p>/g)].map((match) => match[1] ?? '');
  const kinds = (Object.keys(notices) as (keyof typeof notices)[]).filter((kind) => found.some((text) => text.startsWith(notices[kind][lang])));
  return { count: found.length, kind: kinds[0] ?? 'none' };
};
const noticeIt = await noticeOf('/', 'it');
const noticeEn = await noticeOf('/en', 'en');
check(noticeIt.count <= 1 && noticeEn.count <= 1, 'notice: more than one notice at the top of the page');
check(noticeIt.kind === noticeEn.kind && noticeIt.count === noticeEn.count, `notice: Italian shows "${noticeIt.kind}", English "${noticeEn.kind}"`);
// Pages rendered at each request must show the same notice as the prerendered ones.
for (const [path, lang] of [['/ricerca-ombrellone', 'it'], ['/en/umbrella-search', 'en'], ['/area/accesso', 'it']] as const) {
  const notice = await noticeOf(path, lang);
  check(notice.kind === noticeIt.kind && notice.count === noticeIt.count, `notice: ${path} shows "${notice.kind}", the home page "${noticeIt.kind}"`);
}
check(noticeIt.count === 0 || noticeIt.kind !== 'none', 'notice: a notice with an unknown wording');
if (demoMode === 'true') check(noticeIt.kind === 'demo', `notice: OMBRE_DEMO_MODE is true but the site shows "${noticeIt.kind}"`);
if (demoMode === 'false') check(noticeIt.kind !== 'demo', 'notice: OMBRE_DEMO_MODE is false but the site shows the demonstration notice');

// Home page: the client's photograph behind the search and the five feature tiles.
const homeHtml = await (await fetch(`${base}/`)).text();
check(/<img[^>]*src="\/img\/costa-1400\.jpg"[^>]*alt=""/.test(homeHtml) && /width="1400"/.test(homeHtml), 'home: the opening photograph is missing, or lacks an empty alt and its size');
check((homeHtml.match(/class="portal-feature"/g) ?? []).length === 5, 'home: expected five feature tiles');
for (const file of ['costa-1400.jpg', 'costa-1400.webp', 'costa-1400.avif', 'costa-mobile.jpg', 'costa-2100.jpg']) {
  const picture = await fetch(`${base}/img/${file}`);
  check(picture.status === 200 && (picture.headers.get('content-type') ?? '').startsWith('image/'), `home: /img/${file} is not served as an image`);
}

const robots = await fetch(`${base}/robots.txt`);
const robotsText = await robots.text();
check(robots.status === 200 && robotsText.includes(`Sitemap: ${siteUrl}/sitemap.xml`), 'robots.txt: missing or without sitemap');
check(robotsText.includes('Disallow: /area') && robotsText.includes('Disallow: /en/account'), 'robots.txt: reserved areas not listed');
check(robotsText.includes('Disallow: /paga') && robotsText.includes('Disallow: /en/pay'), 'robots.txt: the temporary payment links are not excluded');

// The three role names and nothing else (spec §5, D42): the banished formulas must not
// appear in the rendered HTML of the main pages — home, the search, the three «come
// funziona» and the sign-in — in either language. Same census as the dictionary test
// (packages/shared/tests/names.test.ts); matches ignore case.
const banishedNames = [
  'per gli stabilimenti',
  'per gli stagionali',
  'condividi giornate',
  'condividi le giornate',
  'area gestore',
  'for beach clubs',
  'for season holders',
  'share days',
  'share your days',
  'manager area',
];
const namePages = ['/', '/en', '/ricerca-ombrellone', '/en/umbrella-search', '/come-funziona', '/en/how-it-works', '/stagionale', '/en/season-holder', '/gestore-stabilimento', '/en/beach-manager', '/area/accesso', '/en/account/sign-in'];
for (const path of namePages) {
  const html = (await (await fetch(base + path, { redirect: 'manual' })).text()).toLowerCase();
  for (const formula of banishedNames) {
    check(!html.includes(formula), `${path}: the banished formula "${formula}" is still in the page`);
  }
}

const sitemap = await fetch(`${base}/sitemap.xml`);
const sitemapText = await sitemap.text();
const listed = (sitemapText.match(/<loc>/g) ?? []).length;
check(sitemap.status === 200, `sitemap.xml: status ${sitemap.status}`);
check(listed === (indexable ? pages.length * 2 : 0), `sitemap.xml: lists ${listed} pages`);

if (failures.length > 0) {
  console.error(`${failures.length} of ${checks} checks failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`All ${checks} checks passed on ${base} (indexable: ${indexable}, notice: ${noticeIt.kind}).`);
