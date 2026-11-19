export const locales = ['it', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'it';

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

export const htmlLang: Record<Locale, string> = { it: 'it', en: 'en' };
export const ogLocale: Record<Locale, string> = { it: 'it_IT', en: 'en_GB' };

export const pageIds = ['home', 'search', 'guestGuide', 'seasonGuide', 'managerGuide', 'help'] as const;
export type PageId = (typeof pageIds)[number];
export type InnerPageId = Exclude<PageId, 'home'>;

export const innerPageIds = pageIds.filter((id): id is InnerPageId => id !== 'home');

export const slugs: Record<InnerPageId, Record<Locale, string>> = {
  search: { it: 'ricerca-ombrellone', en: 'umbrella-search' },
  guestGuide: { it: 'come-funziona', en: 'how-it-works' },
  seasonGuide: { it: 'stagionale', en: 'season-holder' },
  managerGuide: { it: 'gestore-stabilimento', en: 'beach-manager' },
  help: { it: 'assistenza', en: 'help' },
};

/**
 * Old addresses of the renamed pages (D41): «Esplora» became «Ricerca ombrellone» and the
 * audience pages merged into the three «come funziona». Each answers 301, nothing is lost.
 */
export const legacySlugs: Record<Locale, Record<string, InnerPageId>> = {
  it: { esplora: 'search', 'per-gli-stabilimenti': 'managerGuide', 'per-gli-stagionali': 'seasonGuide' },
  en: { explore: 'search', 'for-beach-clubs': 'managerGuide', 'for-season-holders': 'seasonGuide' },
};

/** Address of today for an old first-level address, or null when nothing was renamed there. */
export function legacyRedirect(pathname: string): string | null {
  const parts = pathname.split('/').filter((part) => part !== '');
  const prefix = parts[0];
  const locale = prefix !== undefined && prefix !== defaultLocale && isLocale(prefix) ? prefix : defaultLocale;
  const rest = locale === defaultLocale ? parts : parts.slice(1);
  const first = rest[0];
  if (rest.length !== 1 || first === undefined) return null;
  const page = legacySlugs[locale][first];
  return page === undefined ? null : pathFor(page, locale);
}

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

/** The cart of one beach club (D46): a public localized segment under the beach page. */
export const cartSegment: Record<Locale, string> = { it: 'carrello', en: 'cart' };

export function cartPath(locale: Locale, beachSlug: string): string {
  return `${beachPath(locale, beachSlug)}/${cartSegment[locale]}`;
}

/** The order summary (D46): the public page of a confirmed cart, behind its signed ticket. */
export const orderSegment: Record<Locale, string> = { it: 'ordine', en: 'order' };

export function orderPath(locale: Locale, beachSlug: string, orderId: string): string {
  return `${beachPath(locale, beachSlug)}/${orderSegment[locale]}/${orderId}`;
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
  /** «Crea un conto»: the public registration of the guest account (D44). */
  register: { it: 'registrazione', en: 'register' },
  /** Password change: forced at the first sign-in, voluntary from the account later (D44). */
  password: { it: 'password', en: 'password' },
  /** Local consent page of the TEST identity provider (D48); Google never lands here. */
  oidcConsent: { it: 'consenso', en: 'consent' },
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

/** Last segment of the planner page (spec §3, D33), under the management page of a beach club. */
export const managePlannerSegment: Record<Locale, string> = { it: 'planner', en: 'planner' };

/** Address of the planner page of a beach club, inside the reserved area. */
export function managePlannerPath(locale: Locale, beachSlug: string): string {
  return `${accountPath(locale, 'manage', beachSlug)}/${managePlannerSegment[locale]}`;
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

/** Last segment of the «Comunicazioni» page, under the management page of a beach club. */
export const manageCommsSegment: Record<Locale, string> = { it: 'comunicazioni', en: 'communications' };

/** Address of the communications page of a beach club, inside the reserved area. */
export function manageCommsPath(locale: Locale, beachSlug: string): string {
  return `${accountPath(locale, 'manage', beachSlug)}/${manageCommsSegment[locale]}`;
}

/** Last segment of the reviews moderation page (D51), under the management page of a beach club. */
export const manageReviewsSegment: Record<Locale, string> = { it: 'recensioni', en: 'reviews' };

/** Address of the reviews moderation page of a beach club, inside the reserved area. */
export function manageReviewsPath(locale: Locale, beachSlug: string): string {
  return `${accountPath(locale, 'manage', beachSlug)}/${manageReviewsSegment[locale]}`;
}

/** Last segment of the «Incassi e richieste» page of one booking (spec §4.3, D31). */
export const manageCollectSegment: Record<Locale, string> = { it: 'incassi', en: 'payments' };

/** Address of the collections page of a beach club; the booking code travels in the query. */
export function manageCollectPath(locale: Locale, beachSlug: string): string {
  return `${accountPath(locale, 'manage', beachSlug)}/${manageCollectSegment[locale]}`;
}

/** The pages one level under the management page of a beach club: the depth whitelist. */
const manageSubPages: Record<Locale, string>[] = [beachLayoutSegment, manageCabinsSegment, manageTodaySegment, managePlannerSegment, manageStatsSegment, manageDealsSegment, manageExtrasSegment, manageCommsSegment, manageCollectSegment, manageReviewsSegment];

/**
 * The temporary public payment page /paga/{token} (spec §4.3): a new first-level
 * section of the addresses. It is `noindex` and excluded in robots.txt.
 */
export const paySection: Record<Locale, string> = { it: 'paga', en: 'pay' };

export function payPath(locale: Locale, token: string): string {
  return `${localePrefix(locale)}/${paySection[locale]}/${token}`;
}

/** Internal address of the page shown for unknown addresses. It is never linked. */
export const notFoundSegment = 'pagina-non-trovata';

const accountDepth: Record<AccountPage, number> = { signIn: 2, overview: 2, twoFactor: 2, manage: 3, season: 3, site: 3, cabins: 2, register: 2, password: 2, oidcConsent: 2 };

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
  // The public payment page: /paga/{token}, nothing deeper.
  if (first === paySection[locale]) return { locale, known: rest.length === 2 };
  if (first === beachSection[locale]) {
    const known =
      rest.length === 2 ||
      (rest.length === 3 && (third === bookSegment[locale] || third === cartSegment[locale])) ||
      (rest.length === 4 && (third === holdSegment[locale] || third === bookingSegment[locale] || third === orderSegment[locale]));
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
