export const locales = ['it', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'it';

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

export const htmlLang: Record<Locale, string> = { it: 'it', en: 'en' };
export const ogLocale: Record<Locale, string> = { it: 'it_IT', en: 'en_GB' };

export const pageIds = ['home', 'explore', 'howItWorks', 'forBeachClubs', 'forSeasonHolders', 'help'] as const;
export type PageId = (typeof pageIds)[number];
export type InnerPageId = Exclude<PageId, 'home'>;

export const innerPageIds = pageIds.filter((id): id is InnerPageId => id !== 'home');

export const slugs: Record<InnerPageId, Record<Locale, string>> = {
  explore: { it: 'esplora', en: 'explore' },
  howItWorks: { it: 'come-funziona', en: 'how-it-works' },
  forBeachClubs: { it: 'per-gli-stabilimenti', en: 'for-beach-clubs' },
  forSeasonHolders: { it: 'per-gli-stagionali', en: 'for-season-holders' },
  help: { it: 'assistenza', en: 'help' },
};

/** Public path of a page. The default locale has no prefix. */
export function pathFor(page: PageId, locale: Locale): string {
  const prefix = locale === defaultLocale ? '' : `/${locale}`;
  if (page === 'home') return prefix === '' ? '/' : prefix;
  return `${prefix}/${slugs[page][locale]}`;
}

export function pageFromSlug(locale: Locale, slug: string): InnerPageId | null {
  return innerPageIds.find((id) => slugs[id][locale] === slug) ?? null;
}

/** The home page is the bare origin: the same form Next.js writes in canonical links. */
export function absoluteUrl(siteUrl: string, path: string): string {
  return path === '/' ? siteUrl : `${siteUrl}${path}`;
}

export const beachSection: Record<Locale, string> = { it: 'bagni', en: 'beach-clubs' };
export const bookSegment: Record<Locale, string> = { it: 'prenota', en: 'book' };
export const holdSegment: Record<Locale, string> = { it: 'riserva', en: 'hold' };

function localePrefix(locale: Locale): string {
  return locale === defaultLocale ? '' : `/${locale}`;
}

export function beachPath(locale: Locale, beachSlug: string): string {
  return `${localePrefix(locale)}/${beachSection[locale]}/${beachSlug}`;
}

export function bookPath(locale: Locale, beachSlug: string): string {
  return `${beachPath(locale, beachSlug)}/${bookSegment[locale]}`;
}

export function holdPath(locale: Locale, beachSlug: string, holdId: string): string {
  return `${beachPath(locale, beachSlug)}/${holdSegment[locale]}/${holdId}`;
}
