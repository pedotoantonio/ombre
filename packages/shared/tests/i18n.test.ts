import { describe, expect, it } from 'vitest';
import { getDictionary, innerPageIds, locales, pageFromSlug, pageIds, pathFor, slugs } from '../src/index';

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
});

describe('routes', () => {
  it('give Italian no prefix and English the /en prefix', () => {
    expect(pathFor('home', 'it')).toBe('/');
    expect(pathFor('home', 'en')).toBe('/en');
    expect(pathFor('howItWorks', 'it')).toBe('/come-funziona');
    expect(pathFor('howItWorks', 'en')).toBe('/en/how-it-works');
  });

  it('resolve every slug back to its page and reject unknown ones', () => {
    for (const locale of locales) {
      for (const id of innerPageIds) expect(pageFromSlug(locale, slugs[id][locale])).toBe(id);
      expect(pageFromSlug(locale, 'non-esiste')).toBeNull();
    }
    expect(pageFromSlug('en', 'come-funziona')).toBeNull();
  });

  it('never use a locale code or a reserved name as a slug', () => {
    const all = innerPageIds.flatMap((id) => locales.map((locale) => slugs[id][locale]));
    for (const slug of all) expect(['it', 'en', '_next', 'api']).not.toContain(slug);
    expect(pageIds).toContain('home');
  });
});
