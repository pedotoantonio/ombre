import { accountPath, beachLayoutPath, beachPath, bookingPath, bookPath, holdPath, isLocale, manageCabinsPath, manageTodayPath, parseEuro, type Locale } from '@ombre/shared';
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

/** Runs a spot type call and returns to the "Tipi di postazione" section with the result next to it. */
async function typesAct(request: Request, form: Form, lang: Locale, path: string, method: string, body: unknown, errorMap: Record<string, string> = {}): Promise<Outcome> {
  const beach = form('beach');
  if (!slugPattern.test(beach)) return bad();
  const result = await apiCall<unknown>(method, `/v1/manage/beaches/${beach}/types${path}`, { body, token: cookieToken(request) });
  const back = beachLayoutPath(lang, beach);
  if (result.ok) return { to: `${withQuery(back, { tok: '1' })}#tipi` };
  if (result.status === 401) return { to: accountPath(lang, 'signIn') };
  const code = result.status === 0 ? 'unavailable' : result.code;
  return { to: `${withQuery(back, { terr: errorMap[code] ?? code })}#tipi` };
}

/** Runs a cabins call and returns to the cabins page of the club with the result. */
async function cabinsAct(
  request: Request,
  form: Form,
  lang: Locale,
  path: string,
  method: string,
  body: unknown,
  errorMap: Record<string, string> = {},
  okMessage?: (data: unknown) => string,
): Promise<Outcome> {
  const beach = form('beach');
  if (!slugPattern.test(beach)) return bad();
  const result = await apiCall<unknown>(method, `/v1/manage/beaches/${beach}${path}`, { body, token: cookieToken(request) });
  const back = manageCabinsPath(lang, beach);
  if (result.ok) return { to: back, ok: okMessage ? okMessage(result.data) : '1' };
  if (result.status === 401) return { to: accountPath(lang, 'signIn') };
  const code = result.status === 0 ? 'unavailable' : result.code;
  return { to: back, err: errorMap[code] ?? code };
}

/** The tools of the drawing grid, as the query string spells them. */
const drawTools = ['passerella-orizzontale', 'passerella-verticale', 'struttura', 'blocco-cabine', 'gomma'] as const;

/** A cell or interstice token of the drawing grid: zone/row/column. */
const drawCellPattern = /^(riva|ombrelloni|monte)\/(\d{1,3})\/(\d{1,3})$/;

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
      ...(uuidPattern.test(form('type')) ? { typeId: form('type') } : {}),
      ...(optionalNumber(form('umbrellas')) === undefined ? {} : { umbrellas: optionalNumber(form('umbrellas')) }),
      ...(optionalNumber(form('sunbeds')) === undefined ? {} : { sunbeds: optionalNumber(form('sunbeds')) }),
      ...(optionalNumber(form('guests')) === undefined ? {} : { maxGuests: optionalNumber(form('guests')) }),
    }),
  'spiaggia-postazione': (request, form, lang) =>
    layoutAct(request, form, lang, '/spots', 'POST', {
      zone: form('zone'),
      code: form('code').trim().toUpperCase(),
      ...(uuidPattern.test(form('type')) ? { typeId: form('type') } : {}),
      ...(optionalNumber(form('row')) === undefined ? {} : { rowNumber: optionalNumber(form('row')) }),
      ...(optionalNumber(form('umbrellas')) === undefined ? {} : { umbrellas: optionalNumber(form('umbrellas')) }),
      ...(optionalNumber(form('sunbeds')) === undefined ? {} : { sunbeds: optionalNumber(form('sunbeds')) }),
      ...(optionalNumber(form('guests')) === undefined ? {} : { maxGuests: optionalNumber(form('guests')) }),
      rentalType: annotation(form('rentalType')),
      rentalNotes: annotation(form('rentalNotes')),
    }),
  // An explicit change of spot type: the equipment of the spot stays exactly as it is.
  'spiaggia-tipo': (request, form, lang) => {
    const spotId = form('spot');
    if (!uuidPattern.test(spotId) || !uuidPattern.test(form('type'))) return Promise.resolve(bad());
    return layoutAct(request, form, lang, `/spots/${encodeURIComponent(spotId)}/type`, 'PUT', { typeId: form('type') });
  },

  // The drawing: side of the sea, grid tools, coordinates form and element removal.
  async 'spiaggia-lato'(request, form, lang) {
    const beach = form('beach');
    const side = form('side');
    if (!slugPattern.test(beach) || (side !== 'top' && side !== 'bottom')) return bad();
    const result = await apiCall('PUT', `/v1/manage/beaches/${beach}/layout/sea-side`, { body: { seaSide: side }, token: cookieToken(request) });
    const back = beachLayoutPath(lang, beach);
    if (result.ok) return { to: `${withQuery(back, { dok: '1' })}#disegno` };
    if (result.status === 401) return { to: accountPath(lang, 'signIn') };
    return { to: `${withQuery(back, { derr: result.status === 0 ? 'unavailable' : result.code })}#disegno` };
  },

  // The grid itself: one form, the tool in the query string, two explicit steps for the
  // extended elements. The first step never calls the API: it only carries the start back.
  async 'spiaggia-disegno'(request, form, lang) {
    const beach = form('beach');
    const tool = form('strumento');
    if (!slugPattern.test(beach) || !(drawTools as readonly string[]).includes(tool)) return bad();
    const back = beachLayoutPath(lang, beach);
    const token = cookieToken(request);
    const go = (params: Record<string, string | undefined>): Outcome => ({ to: `${withQuery(back, { strumento: tool, ...params })}#disegno` });
    const done = (result: Awaited<ReturnType<typeof apiCall>>): Outcome => {
      if (result.ok) return go({ dok: '1' });
      if (result.status === 401) return { to: accountPath(lang, 'signIn') };
      const code = result.status === 0 ? 'unavailable' : result.code === 'invalid_state' ? 'element_overlap' : result.code;
      return go({ derr: code });
    };
    const draw = (body: unknown) => apiCall<unknown>('POST', `/v1/manage/beaches/${beach}/layout/elements`, { body, token });

    if (tool === 'gomma') {
      const element = form('elemento');
      if (!uuidPattern.test(element)) return bad();
      const removed = await apiCall<{ detachedCabins: number }>('DELETE', `/v1/manage/beaches/${beach}/layout/elements/${encodeURIComponent(element)}`, { token });
      if (removed.ok) {
        const { getDictionary, config } = await import('@ombre/shared');
        return go({ dok: getDictionary(lang, config.brandName).layout.elementRemoved(removed.data.detachedCabins) });
      }
      if (removed.status === 401) return { to: accountPath(lang, 'signIn') };
      return go({ derr: removed.status === 0 ? 'unavailable' : removed.code });
    }
    if (tool === 'passerella-verticale') {
      // From the grid the vertical walkway crosses every zone; one zone only via the form.
      return done(await draw({ kind: 'walkway', orientation: 'vertical', colStart: wholeNumber(form('colonna')) }));
    }
    const horizontal = tool === 'passerella-orizzontale';
    const target = drawCellPattern.exec(form(horizontal ? 'interstizio' : 'cella'));
    if (!target) return bad();
    const label = form('etichetta').trim().slice(0, 40);
    const start = drawCellPattern.exec(form('passo'));
    if (!start) return go({ passo: target[0], ...(label ? { etichetta: label } : {}) });
    if (start[1] !== target[1] || start[2] !== target[2]) return go({ derr: 'step_mismatch' });
    const colStart = Math.min(Number(start[3]), Number(target[3]));
    const colEnd = Math.max(Number(start[3]), Number(target[3]));
    if (horizontal) {
      return done(await draw({ kind: 'walkway', orientation: 'horizontal', zone: target[1], rowAfter: Number(target[2]), colStart, colEnd, ...(label ? { label } : {}) }));
    }
    if (tool === 'struttura' && !label) return go({ passo: start[0], derr: 'label_required' });
    return done(await draw({ kind: tool === 'struttura' ? 'structure' : 'cabin_block', zone: target[1], rowNumber: Number(target[2]), colStart, colEnd, ...(label ? { label } : {}) }));
  },

  // The coordinates form: the full-power equivalent of the grid, always available below it.
  async 'spiaggia-disegno-modulo'(request, form, lang) {
    const beach = form('beach');
    if (!slugPattern.test(beach)) return bad();
    const back = beachLayoutPath(lang, beach);
    const kind = form('kind');
    const zone = form('zone');
    const row = wholeNumber(form('row'));
    const from = wholeNumber(form('from'));
    const to = form('to').trim() === '' ? from : wholeNumber(form('to'));
    const label = form('label').trim().slice(0, 40);
    let body: Record<string, unknown>;
    if (kind === 'passerella-verticale') {
      body = { kind: 'walkway', orientation: 'vertical', colStart: from, ...(zone !== 'tutte' ? { zone } : {}), ...(label ? { label } : {}) };
    } else if (kind === 'passerella-orizzontale') {
      body = { kind: 'walkway', orientation: 'horizontal', zone, rowAfter: row, colStart: Math.min(from, to), colEnd: Math.max(from, to), ...(label ? { label } : {}) };
    } else if (kind === 'struttura' || kind === 'blocco-cabine') {
      if (kind === 'struttura' && !label) return { to: `${withQuery(back, { derr: 'label_required' })}#disegno` };
      body = { kind: kind === 'struttura' ? 'structure' : 'cabin_block', zone, rowNumber: row, colStart: Math.min(from, to), colEnd: Math.max(from, to), ...(label ? { label } : {}) };
    } else {
      return bad();
    }
    const result = await apiCall('POST', `/v1/manage/beaches/${beach}/layout/elements`, { body, token: cookieToken(request) });
    if (result.ok) return { to: `${withQuery(back, { dok: '1' })}#disegno` };
    if (result.status === 401) return { to: accountPath(lang, 'signIn') };
    const code = result.status === 0 ? 'unavailable' : result.code === 'invalid_state' ? 'element_overlap' : result.code;
    return { to: `${withQuery(back, { derr: code })}#disegno` };
  },

  // "Rimuovi" from the element list: same removal as the eraser, from a plain button.
  async 'spiaggia-elemento-rimuovi'(request, form, lang) {
    const beach = form('beach');
    const element = form('elemento');
    if (!slugPattern.test(beach) || !uuidPattern.test(element)) return bad();
    const tool = (drawTools as readonly string[]).includes(form('strumento')) ? form('strumento') : undefined;
    const back = beachLayoutPath(lang, beach);
    const removed = await apiCall<{ detachedCabins: number }>('DELETE', `/v1/manage/beaches/${beach}/layout/elements/${encodeURIComponent(element)}`, {
      token: cookieToken(request),
    });
    if (removed.ok) {
      const { getDictionary, config } = await import('@ombre/shared');
      return { to: `${withQuery(back, { strumento: tool, dok: getDictionary(lang, config.brandName).layout.elementRemoved(removed.data.detachedCabins) })}#disegno` };
    }
    if (removed.status === 401) return { to: accountPath(lang, 'signIn') };
    return { to: `${withQuery(back, { strumento: tool, derr: removed.status === 0 ? 'unavailable' : removed.code })}#disegno` };
  },

  // Spot types: create, edit, delete. The refusals come back next to the list.
  'tipo-crea': (request, form, lang) => {
    const price = form('price').trim();
    return typesAct(request, form, lang, '', 'POST', {
      name: form('name').trim(),
      mark: form('mark'),
      umbrellas: wholeNumber(form('umbrellas')),
      sunbeds: wholeNumber(form('sunbeds')),
      maxGuests: wholeNumber(form('guests')),
      defaultPriceCents: price === '' ? null : (parseEuro(price) ?? -1),
    }, { invalid_state: 'type_conflict' });
  },
  'tipo-modifica': (request, form, lang) => {
    const typeId = form('type');
    if (!uuidPattern.test(typeId)) return Promise.resolve(bad());
    const price = form('price').trim();
    const name = form('name').trim();
    const mark = form('mark');
    // The builtin types post no name and no mark: they keep theirs.
    return typesAct(request, form, lang, `/${encodeURIComponent(typeId)}`, 'PUT', {
      ...(name ? { name } : {}),
      ...(mark ? { mark } : {}),
      umbrellas: wholeNumber(form('umbrellas')),
      sunbeds: wholeNumber(form('sunbeds')),
      maxGuests: wholeNumber(form('guests')),
      defaultPriceCents: price === '' ? null : (parseEuro(price) ?? -1),
    }, { invalid_state: 'type_conflict' });
  },
  'tipo-elimina': (request, form, lang) => {
    const typeId = form('type');
    if (!uuidPattern.test(typeId)) return Promise.resolve(bad());
    return typesAct(request, form, lang, `/${encodeURIComponent(typeId)}`, 'DELETE', undefined, { invalid_state: 'type_in_use' });
  },

  // Sea cabins: register, assignments, decisions. Managed from the cabins page of the club.
  'cabina-crea': (request, form, lang) => {
    const element = form('element');
    return cabinsAct(
      request,
      form,
      lang,
      '/cabins',
      'POST',
      {
        code: form('code').trim().toUpperCase(),
        ...(uuidPattern.test(element) ? { elementId: element } : {}),
        ...(annotation(form('notes')) ? { notes: annotation(form('notes')) } : {}),
      },
      { invalid_state: 'cabin_conflict' },
    );
  },
  'cabina-modifica': (request, form, lang) => {
    const cabin = form('cabin');
    if (!uuidPattern.test(cabin)) return Promise.resolve(bad());
    const element = form('element');
    return cabinsAct(
      request,
      form,
      lang,
      `/cabins/${encodeURIComponent(cabin)}`,
      'PUT',
      {
        code: form('code').trim().toUpperCase(),
        elementId: uuidPattern.test(element) ? element : null,
        notes: annotation(form('notes')),
      },
      { invalid_state: 'cabin_conflict' },
    );
  },
  'cabina-elimina': (request, form, lang) => {
    const cabin = form('cabin');
    if (!uuidPattern.test(cabin)) return Promise.resolve(bad());
    return cabinsAct(request, form, lang, `/cabins/${encodeURIComponent(cabin)}`, 'DELETE', undefined, { invalid_state: 'cabin_used' });
  },
  'cabina-affida': (request, form, lang) => {
    const cabin = form('cabin');
    if (!uuidPattern.test(cabin)) return Promise.resolve(bad());
    const email = form('email').trim();
    const name = form('name').trim();
    const contact = form('contact').trim();
    return cabinsAct(
      request,
      form,
      lang,
      `/cabins/${encodeURIComponent(cabin)}/assignments`,
      'POST',
      {
        ...(email ? { holderEmail: email } : {}),
        ...(name ? { holderName: name } : {}),
        ...(contact ? { holderContact: contact } : {}),
        validFrom: form('from'),
        validTo: form('to'),
      },
      { invalid_state: 'assignment_invalid' },
    );
  },
  'cabina-chiudi': async (request, form, lang) => {
    const assignment = form('assignment');
    if (!uuidPattern.test(assignment)) return bad();
    const { getDictionary, config } = await import('@ombre/shared');
    return cabinsAct(
      request,
      form,
      lang,
      `/cabin-assignments/${encodeURIComponent(assignment)}/end`,
      'POST',
      { endOn: form('endOn') },
      {},
      (data) => {
        const ended = data as { truncatedSublets: number; closedSublets: number };
        return getDictionary(lang, config.brandName).cabins.endDone(ended.truncatedSublets, ended.closedSublets);
      },
    );
  },
  'cabina-decisione': (request, form, lang) => {
    const sublet = form('sublet');
    if (!uuidPattern.test(sublet)) return Promise.resolve(bad());
    return cabinsAct(request, form, lang, `/cabin-sublets/${encodeURIComponent(sublet)}/decision`, 'POST', { approve: form('approve') === 'yes' }, { invalid_state: 'sublet_invalid' });
  },
  // The holder's own proposal, from their essential page.
  async 'cabina-proponi'(request, form, lang) {
    const assignment = form('assignment');
    if (!uuidPattern.test(assignment)) return bad();
    const contact = form('contact').trim();
    const result = await apiCall('POST', `/v1/my/assignments/${encodeURIComponent(assignment)}/sublets`, {
      body: { fromDay: form('from'), toDay: form('to'), occupantName: form('name').trim(), ...(contact ? { occupantContact: contact } : {}) },
      token: cookieToken(request),
    });
    const back = accountPath(lang, 'cabins');
    if (result.ok) return { to: back, ok: '1' };
    if (result.status === 401) return { to: accountPath(lang, 'signIn') };
    const code = result.status === 0 ? 'unavailable' : result.code === 'invalid_state' ? 'sublet_invalid' : result.code;
    return { to: back, err: code };
  },
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

  // Bulk block and unblock from the console «Oggi sulla spiaggia»: the outcome comes back
  // aggregated in the query string of the redirect, like the other outcome flags.
  async 'console-blocco'(request, form, lang) {
    const beach = form('beach');
    const day = form('day');
    const op = form('op');
    if (!slugPattern.test(beach) || !dayPattern.test(day) || (op !== 'block' && op !== 'unblock')) return bad();
    const spotIds = form('spots').split(',').filter((value) => uuidPattern.test(value));
    const reason = form('reason').trim().slice(0, 200);
    const keep: Record<string, string | undefined> = {
      day,
      vista: form('vista') || undefined,
      selezione: '1',
      q: form('q') || undefined,
    };
    const back = manageTodayPath(lang, beach);
    const { getDictionary, config } = await import('@ombre/shared');
    const o = getDictionary(lang, config.brandName).ops;
    if (spotIds.length === 0) return { to: withQuery(back, keep), err: 'nothing_selected' };
    const result = await apiCall<{ done: number; refused: { spotId: string; reason: 'not_published' | 'held' | 'occupied' | 'not_blocked' }[] }>(
      'POST',
      `/v1/manage/beaches/${beach}/inventory/bulk-block`,
      { body: { day, spotIds, blocked: op === 'block', ...(reason ? { reason } : {}) }, token: cookieToken(request) },
    );
    if (!result.ok) {
      if (result.status === 401) return { to: accountPath(lang, 'signIn') };
      return { to: withQuery(back, keep), err: result.status === 0 ? 'unavailable' : result.code };
    }
    const refusals = (reason2: 'not_published' | 'held' | 'occupied' | 'not_blocked') => result.data.refused.filter((entry) => entry.reason === reason2).length;
    return {
      to: withQuery(back, keep),
      ok: o.bulkOutcome(op === 'block', result.data.done, refusals('held'), refusals('occupied'), refusals('not_published'), refusals('not_blocked')),
    };
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
    const field = name === 'weekdays' ? 'weekday' : name === 'spots' ? 'spot' : name;
    const values = data.getAll(field).filter((value): value is string => typeof value === 'string');
    return name === 'weekdays' || name === 'gallery' || name === 'spots' ? values.join(',') : (values[0] ?? '');
  };
  const lang = form('lang');
  if (!isLocale(lang)) return bad();

  const outcome = await run(request, form, lang);
  if (outcome instanceof Response) return outcome;
  return redirect(withQuery(outcome.to, { ok: outcome.ok, err: outcome.err }));
}
