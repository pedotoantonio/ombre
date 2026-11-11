import { accountPath, beachPath, bookingPath, bookPath, holdPath, isLocale, parseEuro, type Locale } from '@ombre/shared';
import { api, apiCall, dayPattern, sandboxNotify, slugPattern, uuidPattern } from '@/lib/api';
import { clearSessionCookieHeader, sessionCookie, sessionCookieHeader } from '@/lib/session';

// Every form of the site posts here. Each action checks its input, calls the API and
// answers with a redirect to a page chosen by the server, never by the form.

type Form = (name: string) => string;
type Outcome = Response | { to: string; ok?: string; err?: string };

function redirect(path: string, headers: Record<string, string> = {}): Response {
  return new Response(null, { status: 303, headers: { Location: path, ...headers } });
}

function withQuery(path: string, values: Record<string, string | undefined>): string {
  const query = Object.entries(values).filter((entry): entry is [string, string] => Boolean(entry[1]));
  if (query.length === 0) return path;
  return `${path}${path.includes('?') ? '&' : '?'}${new URLSearchParams(query).toString()}`;
}

function cookieToken(request: Request): string | undefined {
  const match = new RegExp(`(?:^|; )${sessionCookie}=([A-Za-z0-9_-]+)`).exec(request.headers.get('cookie') ?? '');
  return match?.[1];
}

const bad = (): Response => new Response('Bad request', { status: 400 });

/** Runs a management call and returns to the dashboard of that day with the result. */
async function manage(request: Request, form: Form, lang: Locale, path: string, method: string, body: unknown, okMessage?: (data: unknown) => string): Promise<Outcome> {
  const beach = form('beach');
  const day = form('day');
  if (!slugPattern.test(beach) || !dayPattern.test(day)) return bad();
  const result = await apiCall<unknown>(method, `/v1/manage/beaches/${beach}${path}`, { body, token: cookieToken(request) });
  const back = `${accountPath(lang, 'manage', beach)}?day=${day}`;
  if (result.ok) return { to: back, ok: okMessage ? okMessage(result.data) : '1' };
  if (result.status === 401) return { to: accountPath(lang, 'signIn') };
  return { to: back, err: result.status === 0 ? 'unavailable' : result.code };
}

const actions: Record<string, (request: Request, form: Form, lang: Locale) => Promise<Outcome>> = {
  async riserva(_request, form, lang) {
    const beach = form('beach');
    const spotId = form('spot');
    const day = form('day');
    const key = form('key');
    const promo = form('promo').trim();
    if (!slugPattern.test(beach) || !uuidPattern.test(spotId) || !dayPattern.test(day) || !/^web-[0-9a-f-]{36}$/.test(key)) return bad();
    const result = await api.hold({ beachSlug: beach, spotId, day, ...(promo ? { promoCode: promo } : {}) }, key);
    if (result.ok) return { to: holdPath(lang, beach, result.data.holdId) };
    if (result.code === 'promo_not_applicable') return { to: `${bookPath(lang, beach)}?spot=${spotId}&day=${day}&promoError=1` };
    if (result.code === 'inventory_conflict') return { to: `${beachPath(lang, beach)}?day=${day}&taken=1` };
    if (result.status === 404) return new Response('Not found', { status: 404 });
    return new Response('Service unavailable', { status: 503 });
  },

  async prenotazione(_request, form, lang) {
    const beach = form('beach');
    const holdId = form('hold');
    if (!slugPattern.test(beach) || !uuidPattern.test(holdId)) return bad();
    const result = await apiCall<{ bookingId: string; accessToken: string }>('POST', '/v1/checkouts', {
      body: { beachSlug: beach, holdId, guestName: form('name'), guestEmail: form('email'), locale: lang },
    });
    if (result.ok) return { to: `${bookingPath(lang, beach, result.data.bookingId)}?t=${result.data.accessToken}` };
    return { to: holdPath(lang, beach, holdId) };
  },

  async 'pagamento-prova'(_request, form, lang) {
    const secret = process.env.OMBRE_SANDBOX_WEBHOOK_SECRET;
    const beach = form('beach');
    const bookingId = form('booking');
    const token = form('t');
    const outcome = form('outcome');
    if (!secret) return new Response('Not found', { status: 404 });
    if (!slugPattern.test(beach) || !uuidPattern.test(bookingId) || (outcome !== 'succeeded' && outcome !== 'failed')) return bad();
    const back = `${bookingPath(lang, beach, bookingId)}?t=${encodeURIComponent(token)}`;
    // Only who can read the booking may settle its test payment.
    const booked = await apiCall<{ paymentReference: string }>('GET', `/v1/beaches/${beach}/bookings/${bookingId}`, { token });
    if (!booked.ok) return new Response('Not found', { status: 404 });
    await sandboxNotify(booked.data.paymentReference, outcome, secret);
    return { to: back };
  },

  async accesso(_request, form, lang) {
    const result = await apiCall<{ token: string; expiresAt: string }>('POST', '/v1/auth/login', { body: { email: form('email'), password: form('password') } });
    if (!result.ok) return { to: accountPath(lang, 'signIn'), err: result.status === 0 ? 'unavailable' : result.status === 400 ? 'invalid_credentials' : result.code };
    return redirect(accountPath(lang, 'overview'), { 'Set-Cookie': sessionCookieHeader(result.data.token, result.data.expiresAt) });
  },

  async uscita(request, _form, lang) {
    const token = cookieToken(request);
    if (token) await apiCall('POST', '/v1/auth/logout', { token });
    return redirect(accountPath(lang, 'signIn'), { 'Set-Cookie': clearSessionCookieHeader() });
  },

  'gestione-pubblica': (request, form, lang) => {
    const priceCents = parseEuro(form('price'));
    if (priceCents === null) return Promise.resolve({ to: `${accountPath(lang, 'manage', form('beach'))}?day=${form('day')}`, err: 'invalid_request' });
    return manage(request, form, lang, '/inventory/publish', 'POST', { day: form('day'), priceCents });
  },
  'gestione-blocco': (request, form, lang) =>
    manage(request, form, lang, '/inventory/block', 'POST', { spotId: form('spot'), day: form('day'), blocked: form('blocked') === 'yes' }),
  'gestione-prezzo': (request, form, lang) =>
    manage(request, form, lang, '/inventory/price', 'PUT', { spotId: form('spot'), day: form('day'), priceCents: parseEuro(form('price')) ?? -1 }),
  'gestione-impostazioni': (request, form, lang) => {
    const cap = form('cap').trim();
    const price = form('price').trim();
    return manage(request, form, lang, '/sharing-settings', 'PUT', {
      dailySharedCap: cap === '' ? null : /^\d{1,5}$/.test(cap) ? Number(cap) : -1,
      sharedPriceCents: price === '' ? null : (parseEuro(price) ?? -1),
    });
  },
  'gestione-proposta': (request, form, lang) =>
    manage(request, form, lang, `/proposals/${encodeURIComponent(form('proposal'))}/decision`, 'POST', { approve: form('approve') === 'yes' }),
  'gestione-abbonamento': (request, form, lang) =>
    manage(request, form, lang, '/contracts', 'POST', { holderEmail: form('email'), spotId: form('spot'), validFrom: form('from'), validTo: form('to'), sharingMode: form('mode') || 'per_day' }),
  'gestione-stato-abbonamento': (request, form, lang) =>
    manage(request, form, lang, `/contracts/${encodeURIComponent(form('contract'))}/status`, 'POST', { status: form('status') }),
  'reception-accesso': (request, form, lang) =>
    manage(request, form, lang, '/access-events', 'POST', { credential: form('credential'), kind: form('kind') }, (data) => {
      const entry = data as { code: string; spotCode: string; guestName: string };
      return `${entry.code} · ${entry.spotCode} · ${entry.guestName}`;
    }),

  async 'stagionale-proponi'(request, form, lang) {
    const contract = form('contract');
    if (!uuidPattern.test(contract)) return bad();
    const back = accountPath(lang, 'season', contract);
    return { to: back, ...(await seasonCall(request, lang, `/v1/season/contracts/${contract}/proposals`, form)) };
  },

  async 'stagionale-ritira'(request, form, lang) {
    const contract = form('contract');
    if (!uuidPattern.test(contract)) return bad();
    const result = await apiCall('POST', `/v1/season/contracts/${contract}/withdrawals`, { body: { day: form('day') }, token: cookieToken(request) });
    if (result.ok) return { to: accountPath(lang, 'season', contract), ok: '1' };
    if (result.status === 401) return { to: accountPath(lang, 'signIn') };
    return { to: accountPath(lang, 'season', contract), err: result.status === 0 ? 'unavailable' : result.code };
  },
};

async function seasonCall(request: Request, lang: Locale, path: string, form: Form): Promise<{ ok?: string; err?: string }> {
  const { getDictionary, config } = await import('@ombre/shared');
  const result = await apiCall<{ added: string[]; alreadyPresent: string[]; outsidePeriod: string[]; waiting: string[] }>('POST', path, {
    body: { recurrence: { from: form('from'), to: form('to'), weekdays: form('weekdays') ? form('weekdays').split(',').map(Number) : [1, 2, 3, 4, 5, 6, 7] } },
    token: cookieToken(request),
  });
  if (!result.ok) return { err: result.status === 0 ? 'unavailable' : result.code };
  const summary = result.data;
  return { ok: getDictionary(lang, config.brandName).account.proposeResult(summary.added.length, summary.alreadyPresent.length, summary.outsidePeriod.length, summary.waiting.length) };
}

export async function POST(request: Request, context: { params: Promise<{ action: string }> }): Promise<Response> {
  // A form posted from another site must not act for the visitor.
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (origin && host && new URL(origin).host !== host) return new Response('Forbidden', { status: 403 });

  const { action } = await context.params;
  const run = Object.hasOwn(actions, action) ? actions[action] : undefined;
  if (!run) return new Response('Not found', { status: 404 });

  const data = await request.formData();
  const form: Form = (name) => {
    // Checkboxes with the same name arrive as several values: they are joined.
    const values = data.getAll(name === 'weekdays' ? 'weekday' : name).filter((value): value is string => typeof value === 'string');
    return name === 'weekdays' ? values.join(',') : (values[0] ?? '');
  };
  const lang = form('lang');
  if (!isLocale(lang)) return bad();

  const outcome = await run(request, form, lang);
  if (outcome instanceof Response) return outcome;
  return redirect(withQuery(outcome.to, { ok: outcome.ok, err: outcome.err }));
}
