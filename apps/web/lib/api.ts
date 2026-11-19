import { config, getDictionary, type AnyDecorationSign, type DayParts, type LayoutElementKind, type SeaSide, type SiteContent, type SiteTemplate, type SpotMark, type SpotZone, type TypeCardContent, type WalkwayOrientation } from '@ombre/shared';

// Server-side client of the Ombrè API. The address is read at request time.

export interface ApiBeach {
  /** Cover picture of the published website, when there is one. Present in lists only. */
  cover?: { src: string; alt: { it: string; en: string | null } } | null;
  slug: string;
  name: string;
  locality: string;
  timezone: string;
  demo: boolean;
  /** Null until the manager sets the position: the club then stays off the map. */
  latitude: number | null;
  longitude: number | null;
  /** The amenities chosen from the fixed catalogue (D49), in catalogue order. */
  amenities: string[];
  /** Average (one decimal) and number of the verified reviews (D51); null without any. */
  rating: { average: number; count: number } | null;
}

/** How the online payment at confirmation is sized (D52). */
export interface ApiPayment {
  mode: 'full' | 'deposit';
  depositPercent: number;
}

/** The cancellation terms of a club (D53), with the deadline of one arrival day when known. */
export interface ApiCancellation {
  deadlineHours: number;
  /** ISO instant: midnight of the arrival day minus the hours, in the club's zone. */
  deadline: string | null;
  policyIt: string | null;
  policyEn: string | null;
}

/** A public review (D51): the account name, never the email; flagged ones stay visible. */
export interface ApiReview {
  rating: number;
  body: string | null;
  authorName: string;
  from: string;
  to: string;
  reply: string | null;
  status: 'published' | 'flagged';
  createdAt: string;
}

/** A beach club in a search by day: what it can sell for those guests, and from which price. */
export interface ApiBeachOffer extends ApiBeach {
  freeSpots?: number;
  priceFromCents?: number | null;
}

export interface BeachSearch {
  locality?: string;
  /** Guests and shared days are only counted on a given day. */
  day?: string;
  /** Last day of a dal–al period (D39): needs day; left out, the search is for one day. */
  to?: string;
  guests?: number;
  sharedOnly?: boolean;
  /** Catalogue identifiers (D49): only the clubs that offer them ALL are kept. */
  amenities?: string[];
}

/** A spot as the map draws it. The price is there only when the spot can be bought. */
export interface ApiMapSpot {
  spotId: string;
  code: string;
  /** Name of the manager's named zone (D50); null when the spot belongs to none. */
  zoneName: string | null;
  zone: SpotZone;
  rowNumber: number;
  /** Column inside the row: the drawing may leave holes, drawn as plain sand. */
  col: number;
  /** Name of the spot type, part of the public label. */
  typeName: string;
  /** Mark of the type, so the drawing uses the exact sign even for custom types. */
  typeMark: SpotMark;
  umbrellas: number;
  sunbeds: number;
  maxGuests: number;
  status: 'free' | 'shared' | 'unavailable';
  priceCents: number | null;
}

export interface ApiSpot {
  spotId: string;
  code: string;
  /** Name of the manager's named zone (D50); null when the spot belongs to none. */
  zoneName: string | null;
  zone: SpotZone;
  rowNumber: number;
  col: number;
  typeName: string;
  typeMark: SpotMark;
  umbrellas: number;
  sunbeds: number;
  maxGuests: number;
  priceCents: number;
  shared: boolean;
}

/** Empty corridor rows between the zones, for drawing the map to scale. */
export interface ApiZoneGaps {
  shoreGapRows: number;
  landGapRows: number;
}

/** A walkway, a labelled structure, a cabin block or a decoration, exactly as the manager drew it. */
export interface ApiLayoutElement {
  elementId: string;
  kind: LayoutElementKind;
  label: string | null;
  orientation: WalkwayOrientation | null;
  zone: SpotZone | null;
  rowAfter: number | null;
  rowNumber: number | null;
  colStart: number | null;
  colEnd: number | null;
  /** Only a decoration has a sign; null elsewhere. The repertoire covers D35 plus the new scenery (D58). */
  sign: AnyDecorationSign | null;
}

/** A name written in Italian, with the optional English version (spec §4.2). */
export interface ApiLocalName {
  it: string;
  en: string | null;
}

/** The localized form of a name: English falls back to Italian when the manager gave none. */
export function localName(name: ApiLocalName, locale: 'it' | 'en'): string {
  return locale === 'en' ? (name.en ?? name.it) : name.it;
}

/** An extra service a guest can add while booking, with its public unit price (spec §4.2). */
export interface ApiExtraService {
  serviceId: string;
  name: ApiLocalName;
  unitPriceCents: number;
}

/** A chosen extra, as quotes, holds and bookings carry it: frozen price and subtotal per line. */
export interface ApiExtraLine {
  serviceId: string;
  name: ApiLocalName;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
}

/** The quantities a request asks for, one entry per service. */
export interface ApiExtraRequest {
  serviceId: string;
  quantity: number;
}

/** One day of a dal–al quote (D39): the spot money of that day, discount applied per day. */
export interface ApiQuoteDay {
  day: string;
  listPriceCents: number;
  discountCents: number;
  totalCents: number;
}

export interface ApiQuote {
  /** Price and discount mean the spot alone; the extras are separate and the total is comprehensive. */
  listPriceCents: number;
  discountCents: number;
  extrasCents: number;
  totalCents: number;
  promoCode: string | null;
  extras: ApiExtraLine[];
  /** The days of a dal–al period (D39), one entry each; a single entry for one day. */
  days?: ApiQuoteDay[];
}

export interface ApiHold extends ApiQuote {
  holdId: string;
  status: 'active' | 'released' | 'expired' | 'converted';
  expiresAt: string;
  beach: ApiBeach;
  day: string;
  /** The whole dal–al period of the hold (D39); from = to = day for a single day. */
  from: string;
  to: string;
  spot: { code: string; typeName: string; zoneName: string | null; rowNumber: number; umbrellas: number; sunbeds: number };
  /** What is due now with the deposit (D52) and the terms before paying (D53). */
  dueNowCents: number;
  balanceCents: number;
  cancellation: ApiCancellation;
}

/** A spot type offered by the club with its custom card content, or null for the platform default (D61, D63). */
export interface ApiTypeCard {
  typeId: string;
  name: string;
  mark: SpotMark;
  umbrellas: number;
  sunbeds: number;
  maxGuests: number;
  content: TypeCardContent | null;
  customized: boolean;
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; code: string; message?: string; detail?: Record<string, unknown> };

function baseUrl(): string {
  return (process.env.OMBRE_API_URL ?? 'http://127.0.0.1:3211').replace(/\/+$/, '');
}

/** Address of the visitor, passed on so that the API can limit requests per person. */
async function clientAddress(): Promise<Record<string, string>> {
  try {
    const { headers } = await import('next/headers');
    const forwarded = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim();
    return forwarded ? { 'X-Forwarded-For': forwarded } : {};
  } catch {
    return {};
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const response = await fetch(baseUrl() + path, {
      ...init,
      headers: { ...(init?.headers as Record<string, string> | undefined), ...(await clientAddress()) },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    const text = await response.text();
    const body = (text ? JSON.parse(text) : null) as unknown;
    if (response.ok) return { ok: true, data: body as T };
    const failure = (body as { error?: { code?: string; message?: string } } | null)?.error;
    // The whole error object travels along: the planner's apply names the op at fault in it (D57).
    return {
      ok: false,
      status: response.status,
      code: failure?.code ?? 'unknown',
      ...(failure?.message ? { message: failure.message } : {}),
      ...(failure ? { detail: failure as unknown as Record<string, unknown> } : {}),
    };
  } catch {
    return { ok: false, status: 0, code: 'unreachable' };
  }
}

function post<T>(path: string, payload: unknown, headers: Record<string, string> = {}): Promise<ApiResult<T>> {
  return call<T>(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload),
  });
}

export interface DayRequest {
  beachSlug: string;
  spotId: string;
  day: string;
  /** Last day of a dal–al period (D39): left out, the request is for the one day. */
  to?: string;
  promoCode?: string;
  extras?: ApiExtraRequest[];
}

function searchQuery(search: BeachSearch): string {
  const query = new URLSearchParams();
  if (search.locality) query.set('locality', search.locality);
  if (search.day) {
    query.set('day', search.day);
    if (search.to && search.to !== search.day) query.set('to', search.to);
    if (search.guests) query.set('guests', String(search.guests));
    if (search.sharedOnly) query.set('sharedOnly', 'true');
  }
  // The chosen amenities (D49), comma separated: the API keeps the clubs that have them ALL.
  if (search.amenities && search.amenities.length > 0) query.set('amenities', search.amenities.join(','));
  const text = query.toString();
  return text ? `?${text}` : '';
}

export const api = {
  beaches: (search: BeachSearch = {}) => call<{ beaches: ApiBeachOffer[] }>(`/v1/beaches${searchQuery(search)}`),
  beach: (slug: string) =>
    call<{
      beach: ApiBeach;
      nextAvailableDay: string | null;
      site: { template: SiteTemplate; content: SiteContent } | null;
      // «Caparra adesso, saldo allo stabilimento» (D52) and the cancellation terms (D53).
      payment: ApiPayment;
      cancellation: ApiCancellation;
    }>(`/v1/beaches/${encodeURIComponent(slug)}`),
  // The verified reviews of one club (D51): the most recent first, at most 50.
  reviews: (slug: string) => call<{ beach: ApiBeach; reviews: ApiReview[] }>(`/v1/beaches/${encodeURIComponent(slug)}/reviews`),
  // With guests the answer also carries the recommended spot for that party (spec §3.3).
  // With `to` the spots are the ones free on EVERY day of the dal–al period, priced as its total (D39).
  availability: (slug: string, day: string, guests?: number, to?: string) =>
    call<{
      spots: ApiSpot[];
      layout: ApiMapSpot[];
      gaps: ApiZoneGaps;
      seaSide: SeaSide;
      elements: ApiLayoutElement[];
      guests?: number;
      suggestedSpotId?: string | null;
      // How this club is paid (D52) and its terms with the deadline of THIS arrival day (D53).
      payment: ApiPayment;
      cancellation: ApiCancellation;
    }>(
      `/v1/beaches/${encodeURIComponent(slug)}/availability?day=${encodeURIComponent(day)}${to && to !== day ? `&to=${encodeURIComponent(to)}` : ''}${guests ? `&guests=${guests}` : ''}`,
    ),
  // The spot types in use at one club, each with the custom card content or null (D61, D63):
  // the site resolves the default fields itself with the shared resolveTypeCard.
  spotTypes: (slug: string) => call<{ beach: ApiBeach; types: ApiTypeCard[] }>(`/v1/beaches/${encodeURIComponent(slug)}/spot-types`),
  // The active extra services of one club: public only here, inside its booking flow (spec §4.2).
  extras: (slug: string) => call<{ beach: ApiBeach; currency: string; extras: ApiExtraService[] }>(`/v1/beaches/${encodeURIComponent(slug)}/extras`),
  quote: (request: DayRequest) => post<ApiQuote>('/v1/quotes', request),
  hold: (request: DayRequest, idempotencyKey: string) =>
    post<{ holdId: string }>('/v1/holds', request, { 'Idempotency-Key': idempotencyKey }),
  getHold: (slug: string, holdId: string) =>
    call<ApiHold>(`/v1/beaches/${encodeURIComponent(slug)}/holds/${encodeURIComponent(holdId)}`),
};

/** Call for the reserved area: any method, optional body, optional session or booking token. */
export function apiCall<T>(method: string, path: string, options: { body?: unknown; token?: string } = {}): Promise<ApiResult<T>> {
  return call<T>(path, {
    method,
    headers: {
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
}

/** Sends the outcome of a test payment, signed as the test provider would. */
export async function sandboxNotify(reference: string, outcome: 'succeeded' | 'failed', secret: string): Promise<boolean> {
  const { createHmac, randomUUID } = await import('node:crypto');
  const raw = JSON.stringify({ eventId: `evt_${randomUUID()}`, reference, outcome });
  try {
    const response = await fetch(`${baseUrl()}/v1/payment-webhooks/sandbox`, {
      method: 'POST',
      headers: { 'X-Ombre-Signature': createHmac('sha256', secret).update(raw).digest('hex') },
      body: raw,
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
export const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Today as YYYY-MM-DD where the beach clubs are: the first day a search may ask for. */
export function today(timeZone = 'Europe/Rome'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** True for a real calendar day written as YYYY-MM-DD. */
export function isDay(value: string | undefined): value is string {
  if (!value || !dayPattern.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const dateLocale = { it: 'it-IT', en: 'en-GB' } as const;

export function formatDay(day: string, locale: 'it' | 'en'): string {
  return new Intl.DateTimeFormat(dateLocale[locale], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`));
}

/** A date without the day of the week, for tables and short labels. */
export function formatDate(day: string, locale: 'it' | 'en'): string {
  return new Intl.DateTimeFormat(dateLocale[locale], { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));
}

function dayParts(day: string, locale: 'it' | 'en'): DayParts {
  const date = new Date(`${day}T00:00:00Z`);
  return {
    day: date.getUTCDate(),
    month: new Intl.DateTimeFormat(dateLocale[locale], { month: 'long', timeZone: 'UTC' }).format(date),
    year: date.getUTCFullYear(),
  };
}

/** Two days as one period, in lower case: "dal 1º al 30 novembre 2026", "from 1 to 30 November 2026". */
export function formatPeriod(from: string, to: string, locale: 'it' | 'en'): string {
  return getDictionary(locale, config.brandName).dates.period(dayParts(from, locale), dayParts(to, locale));
}

/** The review average with one decimal in the locale's own writing: «4,6» / "4.6" (D51). */
export function formatRating(average: number, locale: 'it' | 'en'): string {
  return new Intl.NumberFormat(dateLocale[locale], { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(average);
}

/** Number of calendar days of a dal–al period, boundaries included. */
export function periodDays(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

export function formatTime(instant: string, locale: 'it' | 'en', timeZone: string): string {
  return new Intl.DateTimeFormat(dateLocale[locale], { hour: '2-digit', minute: '2-digit', timeZone }).format(new Date(instant));
}

/** Date and time of an instant in the given time zone: deadlines and notification times. */
export function formatInstant(instant: string, locale: 'it' | 'en', timeZone: string): string {
  return new Intl.DateTimeFormat(dateLocale[locale], { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone }).format(
    new Date(instant),
  );
}
