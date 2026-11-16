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

export const bookingSegment: Record<Locale, string> = { it: 'prenotazione', en: 'booking' };

export function bookingPath(locale: Locale, beachSlug: string, bookingId: string): string {
  return `${beachPath(locale, beachSlug)}/${bookingSegment[locale]}/${bookingId}`;
}

export const accountSection: Record<Locale, string> = { it: 'area', en: 'account' };
export const accountPages = {
  signIn: { it: 'accesso', en: 'sign-in' },
  overview: { it: 'profilo', en: 'overview' },
  manage: { it: 'gestione', en: 'manage' },
  season: { it: 'stagionale', en: 'season' },
  site: { it: 'sito', en: 'site' },
  twoFactor: { it: 'verifica', en: 'two-step' },
  /** The cabin holder's own page: their cabins, periods and sublet proposals. */
  cabins: { it: 'cabine', en: 'cabins' },
} as const satisfies Record<string, Record<Locale, string>>;
export type AccountPage = keyof typeof accountPages;

/** Address of a page of the reserved area, with an optional identifier after it. */
export function accountPath(locale: Locale, page: AccountPage, id?: string): string {
  const base = `${localePrefix(locale)}/${accountSection[locale]}/${accountPages[page][locale]}`;
  return id ? `${base}/${id}` : base;
}

/** Last segment of the beach layout page, under the management page of a beach club. */
export const beachLayoutSegment: Record<Locale, string> = { it: 'spiaggia', en: 'beach-layout' };

/** Address of the beach layout page of a beach club, inside the reserved area. */
export function beachLayoutPath(locale: Locale, beachSlug: string): string {
  return `${accountPath(locale, 'manage', beachSlug)}/${beachLayoutSegment[locale]}`;
}

/** Last segment of the manager's cabins page, under the management page of a beach club. */
export const manageCabinsSegment: Record<Locale, string> = { it: 'cabine', en: 'cabins' };

/** Address of the cabins page of a beach club, inside the reserved area. */
export function manageCabinsPath(locale: Locale, beachSlug: string): string {
  return `${accountPath(locale, 'manage', beachSlug)}/${manageCabinsSegment[locale]}`;
}

/** Last segment of the operational console «Oggi sulla spiaggia», under the management page. */
export const manageTodaySegment: Record<Locale, string> = { it: 'oggi', en: 'today' };

/** Address of the operational console of a beach club, inside the reserved area. */
export function manageTodayPath(locale: Locale, beachSlug: string): string {
  return `${accountPath(locale, 'manage', beachSlug)}/${manageTodaySegment[locale]}`;
}

/** Last segment of the statistics page, under the management page of a beach club. */
export const manageStatsSegment: Record<Locale, string> = { it: 'statistiche', en: 'statistics' };

/** Address of the statistics page of a beach club, inside the reserved area. */
export function manageStatsPath(locale: Locale, beachSlug: string): string {
  return `${accountPath(locale, 'manage', beachSlug)}/${manageStatsSegment[locale]}`;
}

/** Last segment of the hotel conventions page, under the management page of a beach club. */
export const manageDealsSegment: Record<Locale, string> = { it: 'convenzioni', en: 'partner-deals' };

/** Address of the hotel conventions page of a beach club, inside the reserved area. */
export function manageDealsPath(locale: Locale, beachSlug: string): string {
  return `${accountPath(locale, 'manage', beachSlug)}/${manageDealsSegment[locale]}`;
}

/** Last segment of the extra services page, under the management page of a beach club. */
export const manageExtrasSegment: Record<Locale, string> = { it: 'extra', en: 'extras' };

/** Address of the extra services page of a beach club, inside the reserved area. */
export function manageExtrasPath(locale: Locale, beachSlug: string): string {
  return `${accountPath(locale, 'manage', beachSlug)}/${manageExtrasSegment[locale]}`;
}

/** The pages one level under the management page of a beach club: the depth whitelist. */
const manageSubPages: Record<Locale, string>[] = [beachLayoutSegment, manageCabinsSegment, manageTodaySegment, manageStatsSegment, manageDealsSegment, manageExtrasSegment];

/** Internal address of the page shown for unknown addresses. It is never linked. */
export const notFoundSegment = 'pagina-non-trovata';

const accountDepth: Record<AccountPage, number> = { signIn: 2, overview: 2, twoFactor: 2, manage: 3, season: 3, site: 3, cabins: 2 };

/**
 * Reads the language of an address and tells whether it has the shape of a page of the site.
 * Whether a beach club or a booking really exists is decided later, by the page itself.
 */
export function readAddress(pathname: string): { locale: Locale; known: boolean } {
  const parts = pathname.split('/').filter((part) => part !== '');
  const prefix = parts[0];
  const locale = prefix !== undefined && prefix !== defaultLocale && isLocale(prefix) ? prefix : defaultLocale;
  const rest = locale === defaultLocale ? parts : parts.slice(1);
  const [first, second, third] = rest;

  if (first === undefined) return { locale, known: true };
  if (rest.length === 1) return { locale, known: pageFromSlug(locale, first) !== null };
  if (first === beachSection[locale]) {
    const known =
      rest.length === 2 ||
      (rest.length === 3 && third === bookSegment[locale]) ||
      (rest.length === 4 && (third === holdSegment[locale] || third === bookingSegment[locale]));
    return { locale, known };
  }
  if (first === accountSection[locale]) {
    const page = (Object.keys(accountPages) as AccountPage[]).find((id) => accountPages[id][locale] === second);
    if (page === undefined) return { locale, known: false };
    // The beach layout, cabins, console and statistics pages live one level under the management page of a beach club.
    if (page === 'manage' && rest.length === 4) return { locale, known: manageSubPages.some((segment) => rest[3] === segment[locale]) };
    return { locale, known: accountDepth[page] === rest.length };
  }
  return { locale, known: false };
}
