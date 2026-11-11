// Checks the pages as a crawler receives them: plain HTML, no scripts executed.
// Usage: node scripts/smoke.ts [base address]   (default http://127.0.0.1:3210)

const base = (process.argv[2] ?? 'http://127.0.0.1:3210').replace(/\/+$/, '');
const siteUrl = (process.env.OMBRE_SITE_URL ?? 'http://localhost:3210').replace(/\/+$/, '');
const indexable = process.env.OMBRE_INDEXABLE === 'true';

const pages: { it: string; en: string; types: string[] }[] = [
  { it: '/', en: '/en', types: ['WebSite'] },
  { it: '/esplora', en: '/en/explore', types: ['BreadcrumbList'] },
  { it: '/come-funziona', en: '/en/how-it-works', types: ['BreadcrumbList'] },
  { it: '/per-gli-stabilimenti', en: '/en/for-beach-clubs', types: ['BreadcrumbList'] },
  { it: '/per-gli-stagionali', en: '/en/for-season-holders', types: ['BreadcrumbList'] },
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

await expectStatus('/it', 308, '/');
await expectStatus('/it/come-funziona', 308, '/come-funziona');
await expectStatus('/pagina-che-non-esiste', 404);
await expectStatus('/en/pagina-che-non-esiste', 404);
await expectStatus('/en/come-funziona', 404);
await expectStatus('/fr', 404);

const robots = await fetch(`${base}/robots.txt`);
const robotsText = await robots.text();
check(robots.status === 200 && robotsText.includes(`Sitemap: ${siteUrl}/sitemap.xml`), 'robots.txt: missing or without sitemap');
check(robotsText.includes('Disallow: /area') && robotsText.includes('Disallow: /en/account'), 'robots.txt: reserved areas not listed');

const sitemap = await fetch(`${base}/sitemap.xml`);
const sitemapText = await sitemap.text();
const listed = (sitemapText.match(/<loc>/g) ?? []).length;
check(sitemap.status === 200, `sitemap.xml: status ${sitemap.status}`);
check(listed === (indexable ? pages.length * 2 : 0), `sitemap.xml: lists ${listed} pages`);

if (failures.length > 0) {
  console.error(`${failures.length} of ${checks} checks failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`All ${checks} checks passed on ${base} (indexable: ${indexable}).`);
