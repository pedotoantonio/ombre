import type { SiteContent, SiteTemplate } from '@ombre/shared';

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
    const code = (body as { error?: { code?: string } } | null)?.error?.code ?? 'unknown';
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
  beach: (slug: string) =>
    call<{ beach: ApiBeach; nextAvailableDay: string | null; site: { template: SiteTemplate; content: SiteContent } | null }>(`/v1/beaches/${encodeURIComponent(slug)}`),
  availability: (slug: string, day: string) =>
    call<{ spots: ApiSpot[] }>(`/v1/beaches/${encodeURIComponent(slug)}/availability?day=${encodeURIComponent(day)}`),
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
