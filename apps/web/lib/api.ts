// Server-side client of the Ombrè API. The address is read at request time.

export interface ApiBeach {
  slug: string;
  name: string;
  locality: string;
  timezone: string;
  demo: boolean;
}

export interface ApiSpot {
  spotId: string;
  code: string;
  rowNumber: number;
  umbrellas: number;
  sunbeds: number;
  maxGuests: number;
  priceCents: number;
  shared: boolean;
}

export interface ApiQuote {
  listPriceCents: number;
  discountCents: number;
  totalCents: number;
  promoCode: string | null;
}

export interface ApiHold extends ApiQuote {
  holdId: string;
  status: 'active' | 'released' | 'expired' | 'converted';
  expiresAt: string;
  beach: ApiBeach;
  day: string;
  spot: { code: string; rowNumber: number; umbrellas: number; sunbeds: number };
}

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; code: string };

function baseUrl(): string {
  return (process.env.OMBRE_API_URL ?? 'http://127.0.0.1:3211').replace(/\/+$/, '');
}

async function call<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const response = await fetch(baseUrl() + path, { ...init, cache: 'no-store', signal: AbortSignal.timeout(5000) });
    const body = (await response.json()) as unknown;
    if (response.ok) return { ok: true, data: body as T };
    const code = (body as { error?: { code?: string } }).error?.code ?? 'unknown';
    return { ok: false, status: response.status, code };
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
  promoCode?: string;
}

export const api = {
  beaches: () => call<{ beaches: ApiBeach[] }>('/v1/beaches'),
  beach: (slug: string) => call<{ beach: ApiBeach; nextAvailableDay: string | null }>(`/v1/beaches/${encodeURIComponent(slug)}`),
  availability: (slug: string, day: string) =>
    call<{ spots: ApiSpot[] }>(`/v1/beaches/${encodeURIComponent(slug)}/availability?day=${encodeURIComponent(day)}`),
  quote: (request: DayRequest) => post<ApiQuote>('/v1/quotes', request),
  hold: (request: DayRequest, idempotencyKey: string) =>
    post<{ holdId: string }>('/v1/holds', request, { 'Idempotency-Key': idempotencyKey }),
  getHold: (slug: string, holdId: string) =>
    call<ApiHold>(`/v1/beaches/${encodeURIComponent(slug)}/holds/${encodeURIComponent(holdId)}`),
};

export const dayPattern = /^\d{4}-\d{2}-\d{2}$/;
export const slugPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

export function formatTime(instant: string, locale: 'it' | 'en', timeZone: string): string {
  return new Intl.DateTimeFormat(dateLocale[locale], { hour: '2-digit', minute: '2-digit', timeZone }).format(new Date(instant));
}
