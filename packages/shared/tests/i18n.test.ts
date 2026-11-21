import { describe, expect, it } from 'vitest';
import { getDictionary, innerPageIds, legacyRedirect, locales, pageFromSlug, pageIds, pathFor, readAddress, slugs } from '../src/index';

function shape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shape);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, shape(inner)]));
  }
  return typeof value;
}

function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

describe('dictionaries', () => {
  const it_ = getDictionary('it', 'Marchio');
  const en = getDictionary('en', 'Marchio');

  it('have the same keys and the same number of list items in every language', () => {
    expect(shape(en)).toEqual(shape(it_));
  });

  it('have no empty text and take the brand name from configuration', () => {
    for (const dictionary of [it_, en]) {
      for (const text of strings(dictionary)) {
        expect(text.trim()).not.toBe('');
        expect(text).not.toContain('Ombrè');
      }
      expect(dictionary.pages.home.title).toContain('Marchio');
    }
  });

  it('keep titles and descriptions unique and within search result lengths', () => {
    for (const dictionary of [it_, en]) {
      const pages = Object.values(dictionary.pages);
      const titles = pages.map((page) => page.title);
      const descriptions = pages.map((page) => page.description);
      const headings = pages.map((page) => page.h1);
      expect(new Set(titles).size).toBe(titles.length);
      expect(new Set(descriptions).size).toBe(descriptions.length);
      expect(new Set(headings).size).toBe(headings.length);
      for (const title of titles) expect(title.length).toBeLessThanOrEqual(62);
      for (const description of descriptions) {
        expect(description.length).toBeGreaterThanOrEqual(90);
        expect(description.length).toBeLessThanOrEqual(165);
      }
    }
  });

  it('write a period without repeating what the two days share', () => {
    const november = (day: number) => ({ day, month: 'novembre', year: 2026 });
    expect(it_.dates.period(november(1), november(30))).toBe('dal 1º al 30 novembre 2026');
    expect(it_.dates.period(november(8), november(11))).toBe("dall'8 all'11 novembre 2026");
    expect(it_.dates.period({ day: 15, month: 'maggio', year: 2027 }, { day: 20, month: 'settembre', year: 2027 })).toBe('dal 15 maggio al 20 settembre 2027');
    expect(it_.dates.period({ day: 1, month: 'dicembre', year: 2026 }, { day: 31, month: 'gennaio', year: 2027 })).toBe('dal 1º dicembre 2026 al 31 gennaio 2027');
    expect(en.dates.period({ day: 1, month: 'November', year: 2026 }, { day: 30, month: 'November', year: 2026 })).toBe('from 1 to 30 November 2026');
    expect(en.dates.period({ day: 15, month: 'May', year: 2027 }, { day: 20, month: 'September', year: 2027 })).toBe('from 15 May to 20 September 2027');
    expect(it_.account.reportLead(it_.dates.period(november(1), november(30)))).toMatch(/^Dal 1º al 30 novembre 2026\. /);
    expect(en.account.reportLead('from 1 to 30 November 2026')).toMatch(/^From 1 to 30 November 2026\. /);
  });

  it('leave the zero parts out of the equipment line', () => {
    expect(it_.booking.equipment(0, 1)).toBe('1 lettino');
    expect(it_.booking.equipment(1, 2)).toBe('1 ombrellone e 2 lettini');
    expect(it_.booking.equipment(2, 0)).toBe('2 ombrelloni');
    expect(en.booking.equipment(0, 1)).toBe('1 sunbed');
    expect(en.booking.equipment(1, 2)).toBe('1 umbrella and 2 sunbeds');
    expect(en.booking.equipment(2, 0)).toBe('2 umbrellas');
    expect(it_.booking.equipment(0, 0)).toBe('');
    expect(en.booking.equipment(0, 0)).toBe('');
  });

  it('give reserved pages a title that ends with the brand', () => {
    expect(it_.meta.pageTitle('Accedi')).toBe('Accedi | Marchio');
    expect(en.meta.beachPageTitle('Summary', 'Lido Aurora')).toBe('Summary · Lido Aurora | Marchio');
  });
});

describe('routes', () => {
  it('give Italian no prefix and English the /en prefix', () => {
    expect(pathFor('home', 'it')).toBe('/');
    expect(pathFor('home', 'en')).toBe('/en');
    expect(pathFor('guestGuide', 'it')).toBe('/come-funziona');
    expect(pathFor('guestGuide', 'en')).toBe('/en/how-it-works');
    expect(pathFor('search', 'it')).toBe('/ricerca-ombrellone');
    expect(pathFor('search', 'en')).toBe('/en/umbrella-search');
  });

  it('send every renamed address to the page of today, and nothing else anywhere (D41)', () => {
    expect(legacyRedirect('/esplora')).toBe('/ricerca-ombrellone');
    expect(legacyRedirect('/en/explore')).toBe('/en/umbrella-search');
    expect(legacyRedirect('/per-gli-stabilimenti')).toBe('/gestore-stabilimento');
    expect(legacyRedirect('/en/for-beach-clubs')).toBe('/en/beach-manager');
    expect(legacyRedirect('/per-gli-stagionali')).toBe('/stagionale');
    expect(legacyRedirect('/en/for-season-holders')).toBe('/en/season-holder');
    for (const path of ['/', '/en', '/ricerca-ombrellone', '/come-funziona', '/en/explore/altro', '/bagni/esplora', '/en/esplora', '/explore']) {
      expect(legacyRedirect(path), path).toBeNull();
    }
  });

  it('resolve every slug back to its page and reject unknown ones', () => {
    for (const locale of locales) {
      for (const id of innerPageIds) expect(pageFromSlug(locale, slugs[id][locale])).toBe(id);
      expect(pageFromSlug(locale, 'non-esiste')).toBeNull();
    }
    expect(pageFromSlug('en', 'come-funziona')).toBeNull();
  });

  it('tell the pages of the site from unknown addresses, and in which language they are written', () => {
    const known = ['/', '/en', '/ricerca-ombrellone', '/en/umbrella-search', '/stagionale', '/en/season-holder', '/gestore-stabilimento', '/en/beach-manager', '/bagni/lido-aurora', '/bagni/lido-aurora/prenota', '/en/beach-clubs/lido-aurora/hold/abc', '/bagni/lido-aurora/prenotazione/abc', '/area/accesso', '/en/account/sign-in', '/area/gestione/lido-aurora', '/en/account/season/abc', '/area/gestione/lido-aurora/extra', '/en/account/manage/lido-aurora/extras'];
    for (const path of known) expect(readAddress(path), path).toMatchObject({ known: true });
    const unknown = ['/pagina-che-non-esiste', '/fr', '/en/come-funziona', '/en/bagni/lido-aurora', '/bagni', '/bagni/lido-aurora/book', '/bagni/a/b/c/d', '/area', '/area/gestione', '/area/accesso/altro', '/a/b', '/it/ricerca-ombrellone'];
    for (const path of unknown) expect(readAddress(path), path).toMatchObject({ known: false });
    expect(readAddress('/en/pagina-che-non-esiste').locale).toBe('en');
    expect(readAddress('/en').locale).toBe('en');
    expect(readAddress('/pagina-che-non-esiste').locale).toBe('it');
    expect(readAddress('/fr/qualcosa').locale).toBe('it');
  });

  it('never use a locale code or a reserved name as a slug', () => {
    const all = innerPageIds.flatMap((id) => locales.map((locale) => slugs[id][locale]));
    for (const slug of all) expect(['it', 'en', '_next', 'api']).not.toContain(slug);
    expect(pageIds).toContain('home');
  });
});
