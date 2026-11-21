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
    // A relative Location is legal and equivalent: both sides are resolved before comparing.
    const target = response.headers.get('location');
    check(target !== null && new URL(target, base).href === new URL(location, base).href, `${path}: redirects to ${target}, expected ${location}`);
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

// Home page: the client's photograph behind the search; the old feature panel is gone (perizia H5).
const homeHtml = await (await fetch(`${base}/`)).text();
check(/<img[^>]*src="\/img\/costa-1400\.jpg"[^>]*alt=""/.test(homeHtml) && /width="1400"/.test(homeHtml), 'home: the opening photograph is missing, or lacks an empty alt and its size');
check(!homeHtml.includes('class="portal-feature"') && !homeHtml.includes('Tutto in un posto solo'), 'home: the deleted «Tutto in un posto solo» panel is still in the page');
for (const file of ['costa-1400.jpg', 'costa-1400.webp', 'costa-1400.avif', 'costa-mobile.jpg', 'costa-2100.jpg']) {
  const picture = await fetch(`${base}/img/${file}`);
  check(picture.status === 200 && (picture.headers.get('content-type') ?? '').startsWith('image/'), `home: /img/${file} is not served as an image`);
}

// La home è dell'Ospite (D70): the three role buttons leave the hero — the portal-roles
// block and the buttons' exact wordings are gone in both languages (the «Gestore
// stabilimento» card and the «Gestore: come funziona» menu entry legitimately keep the
// role's name, so only the old buttons' full texts are banished); the hero keeps its h1
// and the search form; the «Per chi è» cards become the entrance of the roles, each with
// a secondary button towards its guide (matched on class and href: JSX may slip a
// <!-- --> into the text); the Manager still reaches the sign-in in two touches.
const heroOldButtons = {
  it: ['Cerco un ombrellone', 'Affitto il mio ombrellone', 'Gestisco uno stabilimento'],
  en: ["I'm looking for an umbrella", 'I rent out my umbrella', 'I manage a beach club'],
} as const;
const audienceCtas = {
  it: ['/come-funziona', '/stagionale', '/gestore-stabilimento'],
  en: ['/en/how-it-works', '/en/season-holder', '/en/beach-manager'],
} as const;
const enHomeHtml = await (await fetch(`${base}/en`)).text();
for (const [lang, html] of [['it', homeHtml], ['en', enHomeHtml]] as const) {
  check(!html.includes('portal-roles'), `home ${lang}: the portal-roles block is still in the page (D70)`);
  for (const text of heroOldButtons[lang]) {
    // The server may escape the apostrophe: every rendering of the old wording counts.
    const variants = [text, text.replace("'", '&#x27;'), text.replace("'", '&apos;'), text.replace("'", '’')];
    check(variants.every((variant) => !html.includes(variant)), `home ${lang}: the old role button «${text}» is still in the page (D70)`);
  }
  const hero = /<section class="portal-hero">[^]*?<\/section>/.exec(html)?.[0] ?? '';
  check(/<h1[^>]*>/.test(hero), `home ${lang}: the hero lost its h1 (D70)`);
  check(hero.includes('class="portal-search"'), `home ${lang}: the hero lost the search form (D70)`);
  const ctas = tags(html, 'a')
    .filter((tag) => attribute(tag, 'class') === 'button button--secondary card__cta')
    .map((tag) => attribute(tag, 'href'));
  check(ctas.length === 3, `home ${lang}: expected exactly three «Per chi è» buttons, found ${ctas.length}`);
  audienceCtas[lang].forEach((href, index) => {
    check(ctas[index] === href, `home ${lang}: the «Per chi è» button ${index + 1} points to ${ctas[index]}, expected ${href}`);
  });
}
// The Manager's two touches (D70): the guide page keeps its link to the sign-in.
for (const [guidePath, signInPath] of [['/gestore-stabilimento', '/area/accesso'], ['/en/beach-manager', '/en/account/sign-in']] as const) {
  const guideHtml = await (await fetch(base + guidePath)).text();
  check(guideHtml.includes(`href="${signInPath}"`), `${guidePath}: no link to ${signInPath} — the Manager lost the second touch (D70)`);
}

// La vetrina del Gestore (D71): la pagina del Gestore è la vetrina commerciale del
// gestionale. Eroe con le due azioni (primaria «Ti chiamiamo noi» → #richiamata,
// secondaria → #funzionalita) e la riga discreta di chi è già cliente (i due tocchi
// di D41 restano); modulo di richiamata coi quattro campi, la casella del consenso e
// il campo trappola nascosto; cinque schede con le cinque schermate vere servite come
// immagini; «Perché Ombrè» con quattro voci; le sezioni della trasparenza conservate;
// chiusura con le stesse azioni. Niente numeri da vetrina inventati: il testo visibile
// della pagina non porta percentuali (il controllo onesto: nessuna cifra seguita da %).
const vetrina = {
  it: {
    path: '/gestore-stabilimento',
    h1: 'Il gestionale per il Gestore stabilimento',
    signIn: '/area/accesso',
    transparency: ['Cosa comprende il primo rilascio', 'Cosa non comprende, per ora', 'Come si attiva', 'Costi'],
  },
  en: {
    path: '/en/beach-manager',
    h1: 'The management area for the Beach manager',
    signIn: '/en/account/sign-in',
    transparency: ['What the first release includes', 'What it does not include yet', 'How activation works', 'Costs'],
  },
} as const;
// Le schermate vere del gestionale dimostrativo, nell'ordine delle cinque schede.
const vetrinaScreens = ['console-filtri-it-desktop.png', 'planner-it-desktop.png', 'scheda-postazione-it-desktop.png', 'economia-it-desktop.png', 'condivisione-it-desktop.png'];
for (const lang of ['it', 'en'] as const) {
  const { path, h1, signIn, transparency } = vetrina[lang];
  const html = (await (await fetch(base + path)).text()).replaceAll('&#x27;', "'").replaceAll('&amp;', '&');
  check(new RegExp(`<h1[^>]*>${h1}</h1>`).test(html), `${path}: the h1 is not the showcase claim «${h1}» (D71)`);
  // Le due azioni dell'eroe; la primaria torna identica in chiusura, quindi due volte.
  check((html.match(/<a class="button" href="#richiamata">/g) ?? []).length === 2, `${path}: the primary action towards #richiamata must appear twice, in the hero and in the closing (D71)`);
  check(html.includes('<a class="button button--secondary" href="#funzionalita">'), `${path}: the hero lost the secondary action towards #funzionalita (D71)`);
  // La riga discreta di chi è già cliente, nell'eroe e in chiusura, sempre verso l'accesso.
  const already = html.match(/<p class="manager-already">[^]*?<\/p>/g) ?? [];
  check(already.length === 2 && already.every((row) => row.includes(`href="${signIn}"`)), `${path}: the discreet «already a customer» line must appear twice and link to ${signIn} (D71)`);
  // Il modulo di richiamata: POST senza script, i quattro campi e la casella del
  // consenso. Il server rende gli attributi in un ordine suo: i controlli cercano
  // il tag del campo per nome e poi gli attributi, senza pretendere l'ordine.
  const form = /<form[^>]*action="\/azioni\/richiamata"[^]*?<\/form>/.exec(html)?.[0] ?? '';
  const field = (name: string) => new RegExp(`<input[^>]*name="${name}"[^>]*>`, 'i').exec(form)?.[0] ?? '';
  const has = (tag: string, attr: string) => new RegExp(attr, 'i').test(tag);
  check(form !== '' && has(form, 'method="post"'), `${path}: no POST form towards /azioni/richiamata (D71)`);
  check(has(field('lang'), 'type="hidden"') && has(field('lang'), `value="${lang}"`), `${path}: the callback form does not carry its language (D71)`);
  check(has(field('name'), 'maxlength="80"') && has(field('name'), 'required'), `${path}: the name field is missing, optional or without its 80-character limit (D71)`);
  check(has(field('phone'), 'type="tel"') && has(field('phone'), 'maxlength="20"') && has(field('phone'), 'required'), `${path}: the phone field is missing, optional or not a tel field (D71)`);
  check(field('beach') !== '' && has(field('beach'), 'maxlength="80"') && !has(field('beach'), 'required'), `${path}: the beach club field is missing, required or without its limit (D71)`);
  check(has(field('consent'), 'type="checkbox"') && has(field('consent'), 'value="1"'), `${path}: the consent checkbox with value "1" is missing (D71)`);
  const trap = /<div class="visually-hidden" aria-hidden="true">[^]*?<\/div>/.exec(form)?.[0] ?? '';
  const trapField = new RegExp('<input[^>]*name="sito"[^>]*>', 'i').exec(trap)?.[0] ?? '';
  check(has(trapField, 'tabindex="-1"') && has(trapField, 'autocomplete="off"'), `${path}: the hidden trap field «sito» is missing or reachable (D71)`);
  // Le cinque schede con le cinque schermate vere, nell'ordine.
  const features = /<ul class="manager-features">[^]*?<\/ul>/.exec(html)?.[0] ?? '';
  check((features.match(/<li\b/g) ?? []).length === 5 && (features.match(/<h3>/g) ?? []).length === 5, `${path}: expected exactly five feature cards with their headings (D71)`);
  let lastIndex = -1;
  for (const file of vetrinaScreens) {
    const index = features.indexOf(`<img src="/img/gestionale/${file}" alt=""`);
    check(index > lastIndex, `${path}: the screenshot ${file} is missing from the feature cards, without an empty alt, or out of order (D71)`);
    if (index >= 0) lastIndex = index;
  }
  // «Perché Ombrè»: quattro vantaggi reali, né più né meno.
  const why = /<ul class="cards">[^]*?<\/ul>/.exec(html)?.[0] ?? '';
  check((why.match(/<li class="card"/g) ?? []).length === 4, `${path}: expected exactly four «Perché Ombrè» cards (D71)`);
  // La trasparenza compattata verso il fondo: le quattro sezioni restano.
  for (const title of transparency) {
    check(html.includes(`<h3>${title}</h3>`), `${path}: the transparency section «${title}» is gone (D71)`);
  }
  // La chiusura ripete l'azione primaria e la via discreta.
  const closing = /<div class="next-step">[^]*?<\/section>/.exec(html)?.[0] ?? '';
  check(closing.includes('href="#richiamata"') && closing.includes('class="manager-already"'), `${path}: the closing lost the callback action or the discreet sign-in line (D71)`);
  // Niente cifre da vetrina: nel testo visibile della pagina nessun numero seguito da %.
  const visible = (/<main\b[^]*<\/main>/.exec(html)?.[0] ?? '').replace(/<[^>]*>/g, ' ');
  check(!/\d\s*%/.test(visible), `${path}: the page shows a percentage figure — invented showcase numbers are banished (D71)`);
}
// Le cinque schermate sono servite davvero come immagini.
for (const file of vetrinaScreens) {
  const picture = await fetch(`${base}/img/gestionale/${file}`);
  check(picture.status === 200 && (picture.headers.get('content-type') ?? '').startsWith('image/'), `vetrina: /img/gestionale/${file} is not served as an image (D71)`);
}

// The two-row header (D67): the menu bar is a band of its own — nav.site-nav is a
// sibling of .site-header__inner, never inside it — with its entries in a container,
// in the D41 order, same in both languages. The rainbow of D68 lives in the CSS and is
// measured by the accessibility report; here the structure that carries it.
const navItems = {
  it: [
    ['/ricerca-ombrellone', 'Ricerca ombrellone'],
    ['/come-funziona', 'Ospite: come funziona'],
    ['/stagionale', 'Stagionale: come funziona'],
    ['/gestore-stabilimento', 'Gestore: come funziona'],
    ['/assistenza', 'Assistenza'],
  ],
  en: [
    ['/en/umbrella-search', 'Umbrella search'],
    ['/en/how-it-works', 'Guest: how it works'],
    ['/en/season-holder', 'Season holder: how it works'],
    ['/en/beach-manager', 'Beach manager: how it works'],
    ['/en/help', 'Help'],
  ],
} as const;
for (const [path, lang] of [['/', 'it'], ['/en', 'en']] as const) {
  const html = await (await fetch(base + path)).text();
  const header = /<header class="site-header">[^]*?<\/header>/.exec(html)?.[0] ?? '';
  const nav = /<nav class="site-nav"[^>]*>[^]*?<\/nav>/.exec(header)?.[0] ?? '';
  check((html.match(/class="site-nav"/g) ?? []).length === 1 && nav !== '', `${path}: expected exactly one site-nav, inside the header`);
  check(/<\/div><nav class="site-nav"/.test(header), `${path}: the menu bar is not its own band after the brand row (site-nav must not sit inside site-header__inner)`);
  check(/<nav class="site-nav"[^>]*><ul class="container">/.test(nav), `${path}: the menu entries are not inside a container`);
  const entries = [...nav.matchAll(/<a [^>]*href="([^"]+)"[^>]*>(?:<span class="site-nav__mark"[^>]*>[^<]*<\/span>)?(?:<!-- -->)?([^<]*)<\/a>/g)].map((entry) => [entry[1], (entry[2] ?? '').trim()]);
  check(JSON.stringify(entries) === JSON.stringify(navItems[lang].map((item) => [...item])), `${path}: the menu entries are not the five of D41 in order (found ${JSON.stringify(entries)})`);
}

// The pins of the home map (D69): /dati/mappa serves the three demonstration clubs with
// slug, name, locality, coordinates and the page already localized; an unknown language
// falls back to Italian.
const demoClubs = [
  ['bagno-delle-dune', 'Bagno delle Dune', 'Lido di Pomposa'],
  ['lido-aurora', 'Lido Aurora', 'Marina Azzurra'],
  ['cala-del-moro', 'Cala del Moro', 'Porto Selvaggio'],
] as const;
const clubPath = (lang: 'it' | 'en', slug: string) => (lang === 'it' ? `/bagni/${slug}` : `/en/beach-clubs/${slug}`);
interface Marker {
  slug?: string;
  name?: string;
  locality?: string;
  latitude?: unknown;
  longitude?: unknown;
  href?: string;
}
async function markersOf(query: string): Promise<Marker[]> {
  const response = await fetch(`${base}/dati/mappa${query}`, { headers: { Accept: 'application/json' } });
  if (response.status !== 200) return [];
  const body = (await response.json()) as { markers?: Marker[] };
  return Array.isArray(body.markers) ? body.markers : [];
}
for (const lang of ['it', 'en'] as const) {
  const markers = await markersOf(`?lang=${lang}`);
  check(markers.length === 3, `/dati/mappa?lang=${lang}: expected the three demonstration clubs, found ${markers.length}`);
  for (const [slug, name, locality] of demoClubs) {
    const marker = markers.find((candidate) => candidate.slug === slug);
    check(
      marker !== undefined && marker.name === name && marker.locality === locality && typeof marker.latitude === 'number' && typeof marker.longitude === 'number' && marker.href === clubPath(lang, slug),
      `/dati/mappa?lang=${lang}: the pin of ${slug} is missing, or without name, locality, coordinates and its localized page`,
    );
  }
}
check((await markersOf('?lang=de')).every((marker) => (marker.href ?? '').startsWith('/bagni/')) && (await markersOf('?lang=de')).length === 3, '/dati/mappa: an unknown language does not fall back to Italian');

// The list fallback inside the map box (D69): the server renders the three clubs with
// name, locality and the right link; without JavaScript this is what a visitor reads.
for (const lang of ['it', 'en'] as const) {
  const html = await (await fetch(base + (lang === 'it' ? '/' : '/en'))).text();
  const list = /<ul class="portal-map__list">[^]*?<\/ul>/.exec(html)?.[0] ?? '';
  check((list.match(/<li\b/g) ?? []).length === 3, `home ${lang}: the list fallback does not show the three clubs`);
  for (const [slug, name, locality] of demoClubs) {
    check(new RegExp(`<a href="${clubPath(lang, slug)}">(?:<!-- -->)?${name}</a>`).test(list) && list.includes(locality), `home ${lang}: ${slug} is not in the list fallback with its link and locality`);
  }
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
const namePages = ['/', '/en', '/ricerca-ombrellone', '/en/umbrella-search', '/come-funziona', '/en/how-it-works', '/stagionale', '/en/season-holder', '/gestore-stabilimento', '/en/beach-manager', '/area/accesso', '/en/account/sign-in', '/area/registrazione', '/en/account/register', '/bagni/bagno-delle-dune/carrello', '/en/beach-clubs/bagno-delle-dune/cart'];
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
