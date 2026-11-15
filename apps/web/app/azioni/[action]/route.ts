import { accountPath, beachLayoutPath, beachPath, bookingPath, bookPath, holdPath, isLocale, parseEuro, type Locale } from '@ombre/shared';
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

/** Runs a layout call and returns to the beach page of the reserved area with the result. */
async function layoutAct(
  request: Request,
  form: Form,
  lang: Locale,
  path: string,
  method: string,
  body: unknown,
  errorMap: Record<string, string> = {},
): Promise<Outcome> {
  const beach = form('beach');
  if (!slugPattern.test(beach)) return bad();
  const result = await apiCall<unknown>(method, `/v1/manage/beaches/${beach}/layout${path}`, { body, token: cookieToken(request) });
  const back = beachLayoutPath(lang, beach);
  if (result.ok) return { to: back, ok: '1' };
  if (result.status === 401) return { to: accountPath(lang, 'signIn') };
  const code = result.status === 0 ? 'unavailable' : result.code;
  return { to: back, err: errorMap[code] ?? code };
}

/** A whole number within its bounds, or -1 so that the API refuses the request as invalid. */
function wholeNumber(text: string): number {
  return /^\d{1,3}$/.test(text.trim()) ? Number(text.trim()) : -1;
}

/** An optional whole number: left out when the field stayed empty. */
function optionalNumber(text: string): number | undefined {
  return text.trim() === '' ? undefined : wholeNumber(text);
}

/** An optional annotation: an empty field clears it. */
function annotation(text: string): string | null {
  const value = text.trim();
  return value === '' ? null : value;
}

/** Runs a website call and returns to the editor with the result. */
async function site(request: Request, form: Form, lang: Locale, path: string, method: string, body: unknown): Promise<Outcome> {
  const beach = form('beach');
  if (!slugPattern.test(beach)) return bad();
  const result = await apiCall<unknown>(method, `/v1/manage/beaches/${beach}${path}`, { body, token: cookieToken(request) });
  const back = accountPath(lang, 'site', beach);
  if (result.ok) return { to: back, ok: '1' };
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
    const code = form('code').trim();
    const result = await apiCall<{ token: string; expiresAt: string }>('POST', '/v1/auth/login', { body: { email: form('email'), password: form('password'), ...(code ? { code } : {}) } });
    if (!result.ok) return { to: accountPath(lang, 'signIn'), err: result.status === 0 ? 'unavailable' : result.status === 400 ? 'invalid_credentials' : result.code };
    return redirect(accountPath(lang, 'overview'), { 'Set-Cookie': sessionCookieHeader(result.data.token, result.data.expiresAt) });
  },

  async 'verifica-conferma'(request, form, lang) {
    const result = await apiCall('POST', '/v1/auth/two-factor/confirm', { body: { code: form('code').trim() }, token: cookieToken(request) });
    if (result.ok) return { to: accountPath(lang, 'overview'), ok: '1' };
    if (result.status === 401) return { to: accountPath(lang, 'signIn') };
    return { to: accountPath(lang, 'twoFactor'), err: 'totp_invalid' };
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
  'banco-prenota': async (request, form, lang) => {
    const { getDictionary, config } = await import('@ombre/shared');
    return manage(request, form, lang, '/desk-bookings', 'POST', { spotId: form('spot'), day: form('day'), guestName: form('name') }, (data) =>
      getDictionary(lang, config.brandName).account.deskDone((data as { code: string }).code),
    );
  },
  'banco-sposta': (request, form, lang) =>
    manage(request, form, lang, `/bookings/${encodeURIComponent(form('code'))}/move`, 'POST', { spotId: form('spot') }),
  'gestione-annulla': async (request, form, lang) => {
    const { getDictionary, config } = await import('@ombre/shared');
    return manage(request, form, lang, `/bookings/${encodeURIComponent(form('code'))}/cancel`, 'POST', { reason: getDictionary(lang, config.brandName).account.cancelReason });
  },
  // Position of the beach club on the public map. A refused value comes back next to its field.
  async 'gestione-posizione'(request, form, lang) {
    const beach = form('beach');
    const day = form('day');
    if (!slugPattern.test(beach) || !dayPattern.test(day)) return bad();
    const back = `${accountPath(lang, 'manage', beach)}?day=${day}`;
    const lat = form('lat').trim();
    const lng = form('lng').trim();
    // Decimals with a dot. Undefined marks a refused field; null an emptied one.
    const coordinate = (text: string, bound: number): number | null | undefined => {
      if (text === '') return null;
      if (!/^-?\d{1,3}(\.\d{1,8})?$/.test(text)) return undefined;
      const value = Number(text);
      return Math.abs(value) <= bound ? value : undefined;
    };
    const latitude = coordinate(lat, 90);
    const longitude = coordinate(lng, 180);
    // Both or none: a lone coordinate marks the missing field as the wrong one.
    const latBad = latitude === undefined || (latitude === null && typeof longitude === 'number');
    const lngBad = longitude === undefined || (longitude === null && typeof latitude === 'number');
    if (latBad || lngBad) {
      return { to: `${withQuery(back, { latErr: latBad ? '1' : undefined, lngErr: lngBad ? '1' : undefined, lat, lng })}#posizione` };
    }
    const result = await apiCall('PUT', `/v1/manage/beaches/${beach}/position`, {
      body: { latitude: latitude ?? null, longitude: longitude ?? null },
      token: cookieToken(request),
    });
    if (result.ok) return { to: back, ok: '1' };
    if (result.status === 401) return { to: accountPath(lang, 'signIn') };
    return { to: back, err: result.status === 0 ? 'unavailable' : result.code };
  },

  // Beach layout: distances, rows, spots, rental annotations, retirement and deletion.
  'spiaggia-distanze': (request, form, lang) =>
    layoutAct(request, form, lang, '/gaps', 'PUT', { shoreGapRows: wholeNumber(form('shore')), landGapRows: wholeNumber(form('land')) }),
  'spiaggia-fila': (request, form, lang) =>
    layoutAct(request, form, lang, '/rows', 'POST', {
      zone: form('zone'),
      prefix: form('prefix').trim().toUpperCase(),
      count: wholeNumber(form('count')),
      ...(optionalNumber(form('umbrellas')) === undefined ? {} : { umbrellas: optionalNumber(form('umbrellas')) }),
      ...(optionalNumber(form('sunbeds')) === undefined ? {} : { sunbeds: optionalNumber(form('sunbeds')) }),
      ...(optionalNumber(form('guests')) === undefined ? {} : { maxGuests: optionalNumber(form('guests')) }),
    }),
  'spiaggia-postazione': (request, form, lang) =>
    layoutAct(request, form, lang, '/spots', 'POST', {
      zone: form('zone'),
      code: form('code').trim().toUpperCase(),
      ...(optionalNumber(form('row')) === undefined ? {} : { rowNumber: optionalNumber(form('row')) }),
      ...(optionalNumber(form('umbrellas')) === undefined ? {} : { umbrellas: optionalNumber(form('umbrellas')) }),
      ...(optionalNumber(form('sunbeds')) === undefined ? {} : { sunbeds: optionalNumber(form('sunbeds')) }),
      ...(optionalNumber(form('guests')) === undefined ? {} : { maxGuests: optionalNumber(form('guests')) }),
      rentalType: annotation(form('rentalType')),
      rentalNotes: annotation(form('rentalNotes')),
    }),
  'spiaggia-modifica': (request, form, lang) => {
    const spotId = form('spot');
    if (!uuidPattern.test(spotId)) return Promise.resolve(bad());
    return layoutAct(request, form, lang, `/spots/${encodeURIComponent(spotId)}`, 'PUT', {
      umbrellas: wholeNumber(form('umbrellas')),
      sunbeds: wholeNumber(form('sunbeds')),
      maxGuests: wholeNumber(form('guests')),
      rentalType: annotation(form('rentalType')),
      rentalNotes: annotation(form('rentalNotes')),
    });
  },
  'spiaggia-fila-affitto': (request, form, lang) =>
    layoutAct(request, form, lang, '/rows/rental', 'PUT', {
      zone: form('zone'),
      rowNumber: wholeNumber(form('row')),
      rentalType: annotation(form('rentalType')),
      rentalNotes: annotation(form('rentalNotes')),
    }),
  'spiaggia-ritiro': (request, form, lang) => {
    const spotId = form('spot');
    if (!uuidPattern.test(spotId)) return Promise.resolve(bad());
    return layoutAct(request, form, lang, `/spots/${encodeURIComponent(spotId)}/retired`, 'PUT', { retired: form('retired') === 'yes' });
  },
  'spiaggia-elimina': (request, form, lang) => {
    const spotId = form('spot');
    if (!uuidPattern.test(spotId)) return Promise.resolve(bad());
    // A spot that was already used cannot be deleted: the message points at retirement instead.
    return layoutAct(request, form, lang, `/spots/${encodeURIComponent(spotId)}`, 'DELETE', undefined, { invalid_state: 'spot_used' });
  },

  'reception-accesso': (request, form, lang) =>
    manage(request, form, lang, '/access-events', 'POST', { credential: form('credential'), kind: form('kind') }, (data) => {
      const entry = data as { code: string; spotCode: string; guestName: string };
      return `${entry.code} · ${entry.spotCode} · ${entry.guestName}`;
    }),

  async 'sito-salva'(request, form, lang) {
    const { demoImage, demoMedia } = await import('@ombre/shared');
    const known = (id: string): id is keyof typeof demoMedia => Object.hasOwn(demoMedia, id);
    const coverId = form('cover');
    const galleryIds = form('gallery').split(',').filter(known);
    const images = (locale: Locale) => ({
      cover: known(coverId) ? demoImage(coverId, locale) : null,
      gallery: galleryIds.map((id) => demoImage(id, locale)),
    });
    const texts = (prefix: string) => ({
      tagline: form(`${prefix}_tagline`),
      description: form(`${prefix}_description`),
      services: form(`${prefix}_services`).split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
      openingPeriod: form(`${prefix}_openingPeriod`),
      openingHours: form(`${prefix}_openingHours`),
      address: form(`${prefix}_address`),
      phone: form(`${prefix}_phone`),
      accessibility: form(`${prefix}_accessibility`),
    });
    const en = texts('en');
    const hasEnglish = Object.values(en).some((value) => (Array.isArray(value) ? value.length > 0 : value.trim() !== ''));
    const version = form('version');
    return site(request, form, lang, '/site/draft', 'PUT', {
      expectedVersion: version === '' ? null : Number(version),
      template: form('template'),
      content: { it: { ...texts('it'), images: images('it') }, en: hasEnglish ? { ...en, images: images('en') } : null },
    });
  },
  'sito-pubblica': (request, form, lang) => site(request, form, lang, '/site/publish', 'POST', { expectedVersion: Number(form('version')) }),
  'sito-ripristina': (request, form, lang) => site(request, form, lang, '/site/restore', 'POST', { revisionId: form('revision') }),

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
    return name === 'weekdays' || name === 'gallery' ? values.join(',') : (values[0] ?? '');
  };
  const lang = form('lang');
  if (!isLocale(lang)) return bad();

  const outcome = await run(request, form, lang);
  if (outcome instanceof Response) return outcome;
  return redirect(withQuery(outcome.to, { ok: outcome.ok, err: outcome.err }));
}
