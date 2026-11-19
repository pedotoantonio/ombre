import { accountPath, beachLayoutPath, beachPath, bookingPath, bookPath, cartPath, decorationSigns, holdPath, isLocale, manageCabinsPath, manageCollectPath, manageDealsPath, manageExtrasPath, manageReviewsPath, manageTodayPath, orderPath, parseEuro, payPath, type Locale } from '@ombre/shared';
import { api, apiCall, dayPattern, formatPeriod, periodDays, sandboxNotify, slugPattern, uuidPattern } from '@/lib/api';
import { cartCookie, cartCookieHeader, clearCartCookieHeader, clearSessionCookieHeader, parseCartTicket, sessionCookie, sessionCookieHeader, type CartTicket } from '@/lib/session';

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

/** The anonymous cart ticket of the request (D46), or null when there is none. */
function readCartTicket(request: Request): CartTicket | null {
  const match = new RegExp(`(?:^|; )${cartCookie}=([^;]+)`).exec(request.headers.get('cookie') ?? '');
  return parseCartTicket(match?.[1]);
}

/** Who may touch this cart: the session when there is one, else the matching ticket. */
function cartBearer(request: Request, cartId: string): string | undefined {
  const session = cookieToken(request);
  if (session) return session;
  const ticket = readCartTicket(request);
  return ticket && ticket.cartId === cartId ? ticket.accessToken : undefined;
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
  okMessage?: (data: unknown) => string,
): Promise<Outcome> {
  const beach = form('beach');
  if (!slugPattern.test(beach)) return bad();
  const result = await apiCall<unknown>(method, `/v1/manage/beaches/${beach}/layout${path}`, { body, token: cookieToken(request) });
  const back = beachLayoutPath(lang, beach);
  if (result.ok) return { to: back, ok: okMessage ? okMessage(result.data) : '1' };
  if (result.status === 401) return { to: accountPath(lang, 'signIn') };
  const code = result.status === 0 ? 'unavailable' : result.code;
  return { to: back, err: errorMap[code] ?? code };
}

/** A spot or element of the planner: a real uuid, or the synthetic id of a draft creation (D57). */
const draftRefPattern = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|draft-\d+(?:-\d+)?)$/i;

/**
 * Queues ONE operation on the planner draft (D57) and returns to the planner page with the
 * outcome next to the given anchor. Nothing touches the beach: only «Salva la spiaggia» does.
 */
async function draftOp(
  request: Request,
  form: Form,
  lang: Locale,
  op: Record<string, unknown>,
  keep: Record<string, string | undefined> = {},
  anchor = '#bozza',
): Promise<Outcome> {
  const beach = form('beach');
  if (!slugPattern.test(beach)) return bad();
  const result = await apiCall<{ index: number }>('POST', `/v1/manage/beaches/${beach}/layout/draft/ops`, { body: op, token: cookieToken(request) });
  const back = beachLayoutPath(lang, beach);
  if (result.ok) {
    const { getDictionary, config } = await import('@ombre/shared');
    return { to: `${withQuery(back, { ...keep, ok: getDictionary(lang, config.brandName).draft.queued(result.data.index + 1) })}${anchor}` };
  }
  if (result.status === 401) return { to: accountPath(lang, 'signIn') };
  return { to: `${withQuery(back, { ...keep, err: result.status === 0 ? 'unavailable' : result.code })}${anchor}` };
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

/** Runs a named-zone call (D50) and returns to the «Zone con nome» panel with the result next to it. */
async function zonesAct(request: Request, form: Form, lang: Locale, path: string, method: string, body: unknown, errorMap: Record<string, string> = {}): Promise<Outcome> {
  const beach = form('beach');
  if (!slugPattern.test(beach)) return bad();
  const result = await apiCall<unknown>(method, `/v1/manage/beaches/${beach}/zones${path}`, { body, token: cookieToken(request) });
  const back = beachLayoutPath(lang, beach);
  if (result.ok) return { to: `${withQuery(back, { zok: '1' })}#zone` };
  if (result.status === 401) return { to: accountPath(lang, 'signIn') };
  const code = result.status === 0 ? 'unavailable' : result.code;
  return { to: `${withQuery(back, { zerr: errorMap[code] ?? code })}#zone` };
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

/** Runs a hotel conventions call and returns to the conventions page with the result. */
async function dealsAct(request: Request, form: Form, lang: Locale, path: string, method: string, body: unknown, errorMap: Record<string, string> = {}): Promise<Outcome> {
  const beach = form('beach');
  if (!slugPattern.test(beach)) return bad();
  const result = await apiCall<unknown>(method, `/v1/manage/beaches/${beach}/conventions${path}`, { body, token: cookieToken(request) });
  const back = manageDealsPath(lang, beach);
  if (result.ok) return { to: back, ok: '1' };
  if (result.status === 401) return { to: accountPath(lang, 'signIn') };
  const code = result.status === 0 ? 'unavailable' : result.code;
  return { to: back, err: errorMap[code] ?? code };
}

/** Runs an extra services call and returns to the extras page with the result (spec §4.2). */
async function extrasAct(request: Request, form: Form, lang: Locale, path: string, method: string, body: unknown, errorMap: Record<string, string> = {}): Promise<Outcome> {
  const beach = form('beach');
  if (!slugPattern.test(beach)) return bad();
  const result = await apiCall<unknown>(method, `/v1/manage/beaches/${beach}/extras${path}`, { body, token: cookieToken(request) });
  const back = manageExtrasPath(lang, beach);
  if (result.ok) return { to: back, ok: '1' };
  if (result.status === 401) return { to: accountPath(lang, 'signIn') };
  const code = result.status === 0 ? 'unavailable' : result.code;
  return { to: back, err: errorMap[code] ?? code };
}

/** A booking code as the pass writes it: the key of the collections view (spec §4.3). */
const bookingCodePattern = /^OM-\d{6}-\d{3}$/i;

/** Runs a collections call and returns to the «Incassi e richieste» view of that booking. */
async function collectAct(
  request: Request,
  form: Form,
  lang: Locale,
  path: (code: string) => string,
  method: string,
  body: unknown,
  errorMap: Record<string, string> = {},
  okMessage?: (data: unknown) => string,
): Promise<Outcome> {
  const beach = form('beach');
  const code = form('code').trim().toUpperCase();
  if (!slugPattern.test(beach) || !bookingCodePattern.test(code)) return bad();
  const result = await apiCall<unknown>(method, `/v1/manage/beaches/${beach}${path(code)}`, { body, token: cookieToken(request) });
  const back = `${manageCollectPath(lang, beach)}?code=${encodeURIComponent(code)}`;
  if (result.ok) return { to: back, ok: okMessage ? okMessage(result.data) : '1' };
  if (result.status === 401) return { to: accountPath(lang, 'signIn') };
  const resolved = result.status === 0 ? 'unavailable' : result.code;
  return { to: back, err: errorMap[resolved] ?? resolved };
}

/** The quantity fields of the extras, named extra-<serviceId>, as the chosen services. */
function chosenExtras(form: Form): { serviceId: string; quantity: number }[] {
  const text = form('extras');
  return text === '' ? [] : text.split(',').map((entry) => {
    const [serviceId = '', quantity = ''] = entry.split(':');
    return { serviceId, quantity: Number(quantity) };
  });
}

/** A percentage with up to two decimals, as basis points; -1 so the API refuses what is not one. */
function percentBps(text: string): number {
  const match = /^(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(text.trim());
  if (!match) return -1;
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}

/** The tools of the drawing grid, as the query string spells them. «postazione» creates a spot in the draft (D57). */
const drawTools = ['postazione', 'passerella-orizzontale', 'passerella-verticale', 'struttura', 'blocco-cabine', 'decorazione', 'gomma'] as const;

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
    // «Al» del periodo (D39): assente o uguale a «dal», la riserva resta di una giornata.
    const toAsked = form('to');
    const key = form('key');
    const promo = form('promo').trim();
    const extras = chosenExtras(form);
    if (!slugPattern.test(beach) || !uuidPattern.test(spotId) || !dayPattern.test(day) || !/^web-[0-9a-f-]{36}$/.test(key)) return bad();
    if (toAsked !== '' && !dayPattern.test(toAsked)) return bad();
    const to = toAsked !== '' && toAsked !== day ? toAsked : undefined;
    const toQuery = to ? `&to=${to}` : '';
    const result = await api.hold({ beachSlug: beach, spotId, day, ...(to ? { to } : {}), ...(promo ? { promoCode: promo } : {}), ...(extras.length > 0 ? { extras } : {}) }, key);
    if (result.ok) return { to: holdPath(lang, beach, result.data.holdId) };
    // The chosen quantities come back in the address, next to the message that explains the refusal.
    const extrasQuery = extras.map((entry) => `&extra-${entry.serviceId}=${entry.quantity}`).join('');
    if (result.code === 'promo_not_applicable') return { to: `${bookPath(lang, beach)}?spot=${spotId}&day=${day}${toQuery}${extrasQuery}&promoError=1` };
    if (result.code === 'extra_not_available') return { to: `${bookPath(lang, beach)}?spot=${spotId}&day=${day}${toQuery}${promo ? `&promo=${encodeURIComponent(promo)}` : ''}&extrasError=1` };
    // La riserva è tutta o niente (D39): una giornata presa nel mezzo riporta alla pagina del periodo.
    if (result.code === 'inventory_conflict') return { to: `${beachPath(lang, beach)}?day=${day}${toQuery}&taken=1` };
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

  // ---- The cart (D46): add, change, remove, confirm — the quick path stays as it is ----

  // «Aggiungi al carrello»: ensures a cart at this beach club (created when there is
  // none), adds the item and lands on the cart page. Signed in, the cart is the
  // account's one; otherwise it lives behind the ticket cookie.
  async 'carrello-aggiungi'(request, form, lang) {
    const beach = form('beach');
    const spotId = form('spot');
    const day = form('day');
    const toAsked = form('to');
    const promo = form('promo').trim();
    const extras = chosenExtras(form);
    if (!slugPattern.test(beach) || !uuidPattern.test(spotId) || !dayPattern.test(day)) return bad();
    if (toAsked !== '' && !dayPattern.test(toAsked)) return bad();
    const to = toAsked !== '' && toAsked !== day ? toAsked : undefined;
    const back = cartPath(lang, beach);
    const session = cookieToken(request);
    let cartId: string;
    let bearer: string;
    let setCookie: string | undefined;
    if (session) {
      const opened = await apiCall<{ cartId: string; accessToken: string }>('POST', '/v1/carts', { body: { beachSlug: beach }, token: session });
      if (!opened.ok) {
        if (opened.status === 401) return { to: accountPath(lang, 'signIn') };
        return { to: back, err: opened.status === 0 ? 'unavailable' : opened.code };
      }
      cartId = opened.data.cartId;
      bearer = session;
    } else {
      const ticket = readCartTicket(request);
      if (ticket && ticket.beachSlug === beach) {
        cartId = ticket.cartId;
        bearer = ticket.accessToken;
      } else {
        // No ticket, or a ticket of another beach club: a new cart replaces the cookie (D46).
        const opened = await apiCall<{ cartId: string; accessToken: string }>('POST', '/v1/carts', { body: { beachSlug: beach } });
        if (!opened.ok) return { to: back, err: opened.status === 0 ? 'unavailable' : opened.code };
        cartId = opened.data.cartId;
        bearer = opened.data.accessToken;
        setCookie = cartCookieHeader({ cartId, beachSlug: beach, accessToken: bearer });
      }
    }
    const added = await apiCall('POST', `/v1/carts/${cartId}/items`, {
      body: { spotId, day, ...(to ? { to } : {}), ...(promo ? { promoCode: promo } : {}), ...(extras.length > 0 ? { extras } : {}) },
      token: bearer,
    });
    const headers: Record<string, string> = setCookie ? { 'Set-Cookie': setCookie } : {};
    if (added.ok) return redirect(back, headers);
    const code = added.status === 0 ? 'unavailable' : added.code;
    return redirect(withQuery(back, { err: code }), headers);
  },

  // The inline item form of the cart page: «per chi è» and the extra quantities.
  async 'carrello-voce'(request, form, lang) {
    const beach = form('beach');
    const cartId = form('cart');
    const itemId = form('item');
    if (!slugPattern.test(beach) || !uuidPattern.test(cartId) || !uuidPattern.test(itemId)) return bad();
    const back = cartPath(lang, beach);
    const bearer = cartBearer(request, cartId);
    if (!bearer) return { to: back };
    const result = await apiCall('PUT', `/v1/carts/${cartId}/items/${itemId}`, {
      body: { guestName: form('name').trim(), extras: chosenExtras(form) },
      token: bearer,
    });
    if (result.ok) return { to: back, ok: '1' };
    return { to: back, err: result.status === 0 ? 'unavailable' : result.code };
  },

  async 'carrello-rimuovi'(request, form, lang) {
    const beach = form('beach');
    const cartId = form('cart');
    const itemId = form('item');
    if (!slugPattern.test(beach) || !uuidPattern.test(cartId) || !uuidPattern.test(itemId)) return bad();
    const back = cartPath(lang, beach);
    const bearer = cartBearer(request, cartId);
    if (!bearer) return { to: back };
    const result = await apiCall('DELETE', `/v1/carts/${cartId}/items/${itemId}`, { token: bearer });
    if (result.ok) return { to: back, ok: '1' };
    return { to: back, err: result.status === 0 ? 'unavailable' : result.code };
  },

  // «Conferma e paga» (D46): all the reserves in one transaction, then the order page.
  async 'carrello-conferma'(request, form, lang) {
    const beach = form('beach');
    const cartId = form('cart');
    if (!slugPattern.test(beach) || !uuidPattern.test(cartId)) return bad();
    const back = cartPath(lang, beach);
    const bearer = cartBearer(request, cartId);
    if (!bearer) return { to: back };
    const result = await apiCall<{ orderId: string; accessToken: string }>('POST', `/v1/carts/${cartId}/confirm`, {
      body: { guestName: form('name'), guestEmail: form('email'), locale: lang },
      token: bearer,
    });
    if (result.ok) {
      // The anonymous ticket is spent with the cart: the cookie goes home.
      const ticket = readCartTicket(request);
      const headers: Record<string, string> = ticket && ticket.cartId === cartId ? { 'Set-Cookie': clearCartCookieHeader() } : {};
      return redirect(`${orderPath(lang, beach, result.data.orderId)}?t=${encodeURIComponent(result.data.accessToken)}`, headers);
    }
    if (result.code === 'order_item_unavailable') {
      // The refusal names the culprit: spot code and period come back next to the message.
      const named = /^Spot (\S+) is no longer available for (\d{4}-\d{2}-\d{2})(?:–(\d{4}-\d{2}-\d{2}))?/.exec(result.message ?? '');
      return { to: withQuery(back, { vspot: named?.[1], vdal: named?.[2], val: named?.[3] }), err: 'order_item_unavailable' };
    }
    return { to: back, err: result.status === 0 ? 'unavailable' : result.code };
  },

  // The test payment of an ORDER (D46): same mechanics as the booking one — the
  // reference comes from the order itself, read with its signed ticket.
  async 'ordine-prova'(_request, form, lang) {
    const secret = process.env.OMBRE_SANDBOX_WEBHOOK_SECRET;
    const beach = form('beach');
    const orderId = form('order');
    const token = form('t');
    const outcome = form('outcome');
    if (!secret) return new Response('Not found', { status: 404 });
    if (!slugPattern.test(beach) || !uuidPattern.test(orderId) || (outcome !== 'succeeded' && outcome !== 'failed')) return bad();
    const back = `${orderPath(lang, beach, orderId)}?t=${encodeURIComponent(token)}`;
    const order = await apiCall<{ payment: { reference: string } | null }>('GET', `/v1/beaches/${beach}/orders/${orderId}`, { token });
    if (!order.ok || !order.data.payment) return new Response('Not found', { status: 404 });
    await sandboxNotify(order.data.payment.reference, outcome, secret);
    return { to: back };
  },

  // «Aggiungi servizi» from «Il mio conto» (D46 §5): the owner adds extras to an own
  // confirmed booking; the balance becomes a payment request and the page goes straight
  // to its public payment address.
  async 'conto-extra'(request, form, lang) {
    const group = form('group');
    if (!uuidPattern.test(group)) return bad();
    const extras = chosenExtras(form);
    const back = accountPath(lang, 'overview');
    if (extras.length === 0) return { to: back, err: 'invalid_request' };
    const result = await apiCall<{ paymentRequest: { payUrl: string } | null }>('POST', `/v1/account/bookings/${group}/extras`, {
      body: { extras },
      token: cookieToken(request),
    });
    if (result.ok) {
      if (result.data.paymentRequest) return redirect(result.data.paymentRequest.payUrl);
      return { to: back, ok: '1' };
    }
    if (result.status === 401) return { to: accountPath(lang, 'signIn') };
    const code = result.status === 0 ? 'unavailable' : result.code === 'invalid_state' ? 'extras_add_invalid' : result.code;
    return { to: back, err: code };
  },

  // La recensione dal conto (D51): voto 1–5 e testo facoltativo, una per soggiorno.
  // L'esito torna sulla pagina del conto, come gli altri gesti dell'Ospite.
  async 'conto-recensione'(request, form, lang) {
    const group = form('group');
    const rating = form('rating');
    if (!uuidPattern.test(group) || !/^[1-5]$/.test(rating)) return bad();
    const text = form('body').trim().slice(0, 600);
    const back = accountPath(lang, 'overview');
    const result = await apiCall('POST', `/v1/account/bookings/${group}/review`, {
      body: { rating: Number(rating), body: text === '' ? null : text },
      token: cookieToken(request),
    });
    if (result.ok) {
      const { getDictionary, config } = await import('@ombre/shared');
      return { to: back, ok: getDictionary(lang, config.brandName).reviews.thanks };
    }
    if (result.status === 401) return { to: accountPath(lang, 'signIn') };
    return { to: back, err: result.status === 0 ? 'unavailable' : result.code };
  },

  // L'annullamento dal conto (D53): solo entro il termine, rimborso pieno di quanto
  // pagato. L'importo del messaggio è il «paid» mostrato dalla pagina stessa.
  async 'conto-annulla'(request, form, lang) {
    const group = form('group');
    const paid = form('paid');
    if (!uuidPattern.test(group)) return bad();
    const back = accountPath(lang, 'overview');
    const result = await apiCall('POST', `/v1/account/bookings/${group}/cancel`, { token: cookieToken(request) });
    if (result.ok) {
      const { getDictionary, config, formatMoney } = await import('@ombre/shared');
      const t = getDictionary(lang, config.brandName).cancel;
      const cents = /^\d{1,9}$/.test(paid) ? Number(paid) : 0;
      return { to: back, ok: cents > 0 ? t.done(formatMoney(cents, lang)) : t.doneNoRefund };
    }
    if (result.status === 401) return { to: accountPath(lang, 'signIn') };
    return { to: back, err: result.status === 0 ? 'unavailable' : result.code };
  },

  // The local consent of the TEST identity provider (D48): mints the signed code and
  // sends the navigator to the same return address the real Google would use.
  async 'oidc-consenso'(_request, form, lang) {
    const state = form('state');
    if (state === '' || state.length > 300) return bad();
    const result = await apiCall<{ code: string }>('POST', '/v1/auth/oidc/test-code', { body: { email: form('email'), name: form('name') } });
    if (!result.ok) return { to: accountPath(lang, 'signIn'), err: result.status === 0 ? 'unavailable' : 'oidc_failed' };
    return { to: `/azioni/oidc-ritorno?${new URLSearchParams({ code: result.data.code, state, lang }).toString()}` };
  },

  // «Crea un conto» (D44): whatever happened — new account or existing email — the
  // answer is the same neutral notice: the page never tells whether an email has a conto.
  async registrazione(_request, form, lang) {
    const { getDictionary, config } = await import('@ombre/shared');
    const result = await apiCall('POST', '/v1/account/register', { body: { name: form('name'), email: form('email'), locale: lang } });
    if (result.ok) return { to: accountPath(lang, 'signIn'), ok: getDictionary(lang, config.brandName).account.registerNotice };
    const code = result.status === 0 ? 'unavailable' : result.status === 429 ? 'rate_limited' : result.code;
    return { to: accountPath(lang, 'register'), err: code };
  },

  // The password change (D44): forced after the first sign-in, voluntary later.
  async 'cambia-password'(request, form, lang) {
    const { getDictionary, config } = await import('@ombre/shared');
    const back = accountPath(lang, 'password');
    if (form('next') !== form('repeat')) return { to: back, err: 'password_mismatch' };
    const result = await apiCall('POST', '/v1/account/password', { body: { current: form('current'), next: form('next') }, token: cookieToken(request) });
    if (result.ok) return { to: back, ok: getDictionary(lang, config.brandName).account.passwordChanged };
    if (result.status === 401 && result.code === 'unauthenticated') return { to: accountPath(lang, 'signIn') };
    const code = result.status === 0 ? 'unavailable' : result.status === 401 ? 'invalid_credentials' : result.code;
    return { to: back, err: code };
  },

  async accesso(request, form, lang) {
    const code = form('code').trim();
    const result = await apiCall<{ token: string; expiresAt: string }>('POST', '/v1/auth/login', { body: { email: form('email'), password: form('password'), ...(code ? { code } : {}) } });
    if (!result.ok) return { to: accountPath(lang, 'signIn'), err: result.status === 0 ? 'unavailable' : result.status === 400 ? 'invalid_credentials' : result.code };
    const headers = new Headers({ Location: accountPath(lang, 'overview') });
    headers.append('Set-Cookie', sessionCookieHeader(result.data.token, result.data.expiresAt));
    // The anonymous cart joins the account at sign-in (D46). The cookie goes home once
    // the cart is claimed or gone; a claim refused (say, pending password change) keeps it.
    const ticket = readCartTicket(request);
    if (ticket) {
      const claimed = await apiCall('POST', `/v1/carts/${ticket.cartId}/claim`, { body: { accessToken: ticket.accessToken }, token: result.data.token });
      if (claimed.ok || claimed.status === 404) headers.append('Set-Cookie', clearCartCookieHeader());
    }
    return new Response(null, { status: 303, headers });
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
  // I servizi del catalogo (D49): le caselle spuntate sostituiscono l'intero insieme.
  'gestione-servizi': (request, form, lang) => {
    const ticked = form('amenities');
    return manage(request, form, lang, '/amenities', 'PUT', { amenities: ticked === '' ? [] : ticked.split(',') });
  },
  // Pagamento online (D52): intero oppure caparra, con la percentuale.
  'gestione-pagamenti': (request, form, lang) =>
    manage(request, form, lang, '/payment-settings', 'PUT', {
      mode: form('mode') === 'deposit' ? 'deposit' : 'full',
      depositPercent: wholeNumber(form('percent')),
    }),
  // Condizioni di annullamento (D53): termine in ore e testi facoltativi it/en.
  'gestione-condizioni': (request, form, lang) =>
    manage(request, form, lang, '/cancellation-policy', 'PUT', {
      deadlineHours: wholeNumber(form('hours')),
      policyIt: annotation(form('policyIt')),
      policyEn: annotation(form('policyEn')),
    }),
  'gestione-proposta': (request, form, lang) =>
    manage(request, form, lang, `/proposals/${encodeURIComponent(form('proposal'))}/decision`, 'POST', { approve: form('approve') === 'yes' }),
  'gestione-abbonamento': (request, form, lang) =>
    manage(request, form, lang, '/contracts', 'POST', { holderEmail: form('email'), spotId: form('spot'), validFrom: form('from'), validTo: form('to'), sharingMode: form('mode') || 'per_day' }),
  'gestione-stato-abbonamento': (request, form, lang) =>
    manage(request, form, lang, `/contracts/${encodeURIComponent(form('contract'))}/status`, 'POST', { status: form('status') }),
  'banco-prenota': async (request, form, lang) => {
    const { getDictionary, config } = await import('@ombre/shared');
    // An optional convention, picked from the list of the day; never a typed code (spec §4.1).
    const convention = form('convention');
    // The extras of the desk follow the same quantity fields as the public flow (spec §4.2).
    const extras = chosenExtras(form);
    // Optional contacts and the collection choice: «later» confirms «da incassare» (spec §4.3, D31).
    const email = form('email').trim();
    const phone = form('phone').trim();
    // «Al» facoltativo (D39): al banco si prenota per periodo come online. I periodi
    // scritti male tornano in parole prima di chiamare l'API, senza ambiguità di codici.
    const day = form('day');
    const toAsked = form('to').trim();
    if (toAsked !== '' && !dayPattern.test(toAsked)) return bad();
    const to = toAsked !== '' && toAsked !== day ? toAsked : undefined;
    const back = `${accountPath(lang, 'manage', form('beach'))}?day=${day}`;
    if (to && to < day) return { to: back, err: 'period_backwards' };
    if (to && periodDays(day, to) > 31) return { to: back, err: 'period_too_long' };
    return manage(
      request,
      form,
      lang,
      '/desk-bookings',
      'POST',
      {
        spotId: form('spot'),
        day,
        ...(to ? { to } : {}),
        guestName: form('name'),
        ...(email ? { guestEmail: email } : {}),
        ...(phone ? { guestPhone: phone } : {}),
        ...(uuidPattern.test(convention) ? { conventionId: convention } : {}),
        ...(extras.length > 0 ? { extras } : {}),
        collect: form('collect') === 'later' ? 'later' : 'now',
      },
      (data) => getDictionary(lang, config.brandName).account.deskDone((data as { code: string }).code),
    );
  },

  // ---- Collections, payment requests and late extras of one booking (spec §4.3, D31) ----
  'banco-incassa': async (request, form, lang) => {
    const { getDictionary, config, formatMoney } = await import('@ombre/shared');
    return collectAct(
      request,
      form,
      lang,
      (code) => `/bookings/${encodeURIComponent(code)}/collect`,
      'POST',
      { amountCents: parseEuro(form('amount')) ?? -1 },
      { invalid_state: 'collect_invalid' },
      (data) => getDictionary(lang, config.brandName).collect.collectDone(formatMoney((data as { remainingCents: number }).remainingCents, lang)),
    );
  },
  'banco-richiesta': async (request, form, lang) => {
    const { getDictionary, config } = await import('@ombre/shared');
    const note = form('note').trim();
    const hours = form('hours').trim();
    return collectAct(
      request,
      form,
      lang,
      (code) => `/bookings/${encodeURIComponent(code)}/payment-requests`,
      'POST',
      {
        amountCents: parseEuro(form('amount')) ?? -1,
        ...(note ? { note } : {}),
        ...(hours === '' ? {} : { expiresInHours: /^\d{1,3}$/.test(hours) ? Number(hours) : -1 }),
      },
      { invalid_state: 'request_invalid' },
      (data) => getDictionary(lang, config.brandName).collect.requestDone(Boolean((data as { notified: boolean }).notified)),
    );
  },
  'banco-richiesta-annulla': (request, form, lang) => {
    const requestId = form('request');
    if (!uuidPattern.test(requestId)) return Promise.resolve(bad());
    return collectAct(request, form, lang, () => `/payment-requests/${encodeURIComponent(requestId)}/cancel`, 'POST', undefined, { invalid_state: 'request_closed' });
  },
  'banco-extra': async (request, form, lang) => {
    const { getDictionary, config, formatMoney } = await import('@ombre/shared');
    const extras = chosenExtras(form);
    return collectAct(
      request,
      form,
      lang,
      (code) => `/bookings/${encodeURIComponent(code)}/extras`,
      'POST',
      { extras, collect: form('collect') === 'later' ? 'later' : 'desk' },
      { invalid_state: 'extras_add_invalid' },
      (data) => {
        const grown = data as { addedCents: number; remainingCents: number };
        return getDictionary(lang, config.brandName).collect.extrasDone(formatMoney(grown.addedCents, lang), formatMoney(grown.remainingCents, lang));
      },
    );
  },

  // The test payment of a public /paga/{token} link (spec §4.3): the payment is opened
  // with the test provider and its outcome is delivered at once, like the checkout one.
  async 'paga-prova'(_request, form, lang) {
    const secret = process.env.OMBRE_SANDBOX_WEBHOOK_SECRET;
    const token = form('token');
    const outcome = form('outcome');
    if (!secret) return new Response('Not found', { status: 404 });
    if (!/^[A-Za-z0-9._-]{10,200}$/.test(token) || (outcome !== 'succeeded' && outcome !== 'failed')) return bad();
    const back = payPath(lang, token);
    const started = await apiCall<{ payment: { reference: string } }>('POST', `/v1/pay-requests/${encodeURIComponent(token)}/payments`);
    if (!started.ok) {
      // The balance has changed under two pending requests: a clear message, not a neutral one.
      if (started.status === 409) return { to: withQuery(back, { esito: 'residuo' }) };
      // Any unusable token: back to the page, which answers the same polite 404.
      if (started.status === 404) return { to: back };
      return { to: withQuery(back, { esito: 'errore' }) };
    }
    const delivered = await sandboxNotify(started.data.payment.reference, outcome, secret);
    if (!delivered) return { to: withQuery(back, { esito: 'errore' }) };
    return { to: withQuery(back, { esito: outcome === 'succeeded' ? 'ok' : 'fallito' }) };
  },
  // «Sposta» resta per giornata (D38): il corpo porta la giornata corrente della riga o della scheda.
  'banco-sposta': (request, form, lang) =>
    manage(request, form, lang, `/bookings/${encodeURIComponent(form('code'))}/move`, 'POST', { spotId: form('spot'), day: form('day') }),
  // L'annullamento tratta l'intero periodo (D40): l'esito lo dice con le giornate interessate.
  'gestione-annulla': async (request, form, lang) => {
    const { getDictionary, config } = await import('@ombre/shared');
    const t = getDictionary(lang, config.brandName).account;
    const from = form('from');
    const to = form('to');
    const period = dayPattern.test(from) && dayPattern.test(to) && to !== from ? { from, to } : null;
    return manage(
      request,
      form,
      lang,
      `/bookings/${encodeURIComponent(form('code'))}/cancel`,
      'POST',
      { reason: t.cancelReason },
      period ? () => t.cancelledPeriod(formatPeriod(period.from, period.to, lang), periodDays(period.from, period.to)) : undefined,
    );
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

  // Beach layout. The catalogues (distances, sea side, types, zones) stay immediate;
  // rows, spots, elements and zone painting queue operations on the planner draft (D57).
  'spiaggia-distanze': (request, form, lang) =>
    layoutAct(request, form, lang, '/gaps', 'PUT', { shoreGapRows: wholeNumber(form('shore')), landGapRows: wholeNumber(form('land')) }),
  // One row is the bulk generation of D34 with rows = 1: the same op, the same numbering.
  'spiaggia-fila': (request, form, lang) =>
    draftOp(request, form, lang, {
      op: 'create_grid',
      zone: form('zone'),
      rows: 1,
      cols: wholeNumber(form('count')),
      prefix: form('prefix').trim().toUpperCase(),
      ...(uuidPattern.test(form('type')) ? { typeId: form('type') } : {}),
      ...(optionalNumber(form('umbrellas')) === undefined ? {} : { umbrellas: optionalNumber(form('umbrellas')) }),
      ...(optionalNumber(form('sunbeds')) === undefined ? {} : { sunbeds: optionalNumber(form('sunbeds')) }),
      ...(optionalNumber(form('guests')) === undefined ? {} : { maxGuests: optionalNumber(form('guests')) }),
    }),
  // Several whole rows (spec §4, D34) as ONE draft operation: nothing is created until the save.
  'spiaggia-file': (request, form, lang) =>
    draftOp(request, form, lang, {
      op: 'create_grid',
      zone: form('zone'),
      rows: wholeNumber(form('rows')),
      cols: wholeNumber(form('perRow')),
      prefix: form('prefix').trim().toUpperCase(),
      ...(uuidPattern.test(form('type')) ? { typeId: form('type') } : {}),
      ...(optionalNumber(form('umbrellas')) === undefined ? {} : { umbrellas: optionalNumber(form('umbrellas')) }),
      ...(optionalNumber(form('sunbeds')) === undefined ? {} : { sunbeds: optionalNumber(form('sunbeds')) }),
      ...(optionalNumber(form('guests')) === undefined ? {} : { maxGuests: optionalNumber(form('guests')) }),
    }),
  // A single spot in the chosen cell (D57): the coordinates form; the grid tool posts spiaggia-disegno.
  'spiaggia-postazione': (request, form, lang) =>
    draftOp(request, form, lang, {
      op: 'create_spot',
      zone: form('zone'),
      row: wholeNumber(form('row')),
      col: wholeNumber(form('col')),
      ...(form('code').trim() === '' ? {} : { code: form('code').trim().toUpperCase() }),
      ...(uuidPattern.test(form('type')) ? { typeId: form('type') } : {}),
      ...(optionalNumber(form('umbrellas')) === undefined ? {} : { umbrellas: optionalNumber(form('umbrellas')) }),
      ...(optionalNumber(form('sunbeds')) === undefined ? {} : { sunbeds: optionalNumber(form('sunbeds')) }),
      ...(optionalNumber(form('guests')) === undefined ? {} : { maxGuests: optionalNumber(form('guests')) }),
    }),
  // The change of spot type queues an edit on the draft; the equipment stays as it is.
  'spiaggia-tipo': (request, form, lang) => {
    const spotId = form('spot');
    if (!draftRefPattern.test(spotId) || !uuidPattern.test(form('type'))) return Promise.resolve(bad());
    return draftOp(request, form, lang, { op: 'edit_spot', spotId, patch: { typeId: form('type') } }, {}, '#bozza');
  },
  // «Sposta una postazione» (D60): the band/row/column form everyone uses; the progressive
  // drag fills and submits THIS form. The identity of the spot never changes.
  'spiaggia-sposta': (request, form, lang) => {
    const spotId = form('spot');
    if (!draftRefPattern.test(spotId)) return Promise.resolve(bad());
    return draftOp(request, form, lang, { op: 'move_spot', spotId, zone: form('zone'), row: wholeNumber(form('row')), col: wholeNumber(form('col')) }, {}, '#sposta');
  },
  // Moving a drawn element from its card (D58): a draft operation like the rest.
  'spiaggia-elemento-sposta': (request, form, lang) => {
    const elementId = form('elemento');
    if (!draftRefPattern.test(elementId)) return Promise.resolve(bad());
    const zone = form('zone');
    return draftOp(
      request,
      form,
      lang,
      { op: 'move_element', elementId, zone: zone === 'tutte' ? null : zone, row: wholeNumber(form('row')), col: wholeNumber(form('col')) },
      {},
      '#disegno',
    );
  },
  // The zone brush (D59): the chosen zone rides along, every tap on a spot queues one assignment.
  'spiaggia-pennello': (request, form, lang) => {
    const spotId = form('postazione');
    const brush = form('pennello');
    if (!draftRefPattern.test(spotId) || (brush !== 'nessuna' && !uuidPattern.test(brush))) return Promise.resolve(bad());
    return draftOp(request, form, lang, { op: 'assign_zone', spotId, zoneId: brush === 'nessuna' ? null : brush }, { pennello: brush }, '#disegno');
  },

  // ---- The draft itself (D57): undo, discard, apply ----
  async 'spiaggia-bozza-annulla'(request, form, lang) {
    const beach = form('beach');
    if (!slugPattern.test(beach)) return bad();
    const back = beachLayoutPath(lang, beach);
    const result = await apiCall<{ remaining: number }>('POST', `/v1/manage/beaches/${beach}/layout/draft/undo`, { token: cookieToken(request) });
    if (result.ok) {
      const { getDictionary, config } = await import('@ombre/shared');
      return { to: `${withQuery(back, { ok: getDictionary(lang, config.brandName).draft.undone(result.data.remaining) })}#bozza` };
    }
    if (result.status === 401) return { to: accountPath(lang, 'signIn') };
    return { to: `${withQuery(back, { err: result.status === 0 ? 'unavailable' : result.code })}#bozza` };
  },
  async 'spiaggia-bozza-scarta'(request, form, lang) {
    const beach = form('beach');
    if (!slugPattern.test(beach)) return bad();
    const back = beachLayoutPath(lang, beach);
    const result = await apiCall<{ discarded: number }>('POST', `/v1/manage/beaches/${beach}/layout/draft/discard`, { token: cookieToken(request) });
    if (result.ok) {
      const { getDictionary, config } = await import('@ombre/shared');
      return { to: `${withQuery(back, { ok: getDictionary(lang, config.brandName).draft.discarded(result.data.discarded) })}#bozza` };
    }
    if (result.status === 401) return { to: accountPath(lang, 'signIn') };
    return { to: `${withQuery(back, { err: result.status === 0 ? 'unavailable' : result.code })}#bozza` };
  },
  // «Conferma il salvataggio»: ONE transaction. On a refusal NOTHING is applied and the
  // summary view points at the operation at fault with its translated reason (D57).
  async 'spiaggia-bozza-salva'(request, form, lang) {
    const beach = form('beach');
    if (!slugPattern.test(beach)) return bad();
    const back = beachLayoutPath(lang, beach);
    const result = await apiCall<{ applied: Record<string, number>; total: number }>('POST', `/v1/manage/beaches/${beach}/layout/draft/apply`, { token: cookieToken(request) });
    const { getDictionary, config } = await import('@ombre/shared');
    const d = getDictionary(lang, config.brandName).draft;
    if (result.ok) {
      // The kinds of the saved operations, the same counts the audit event carries.
      const kinds = Object.entries(result.data.applied)
        .map(([kind, count]) => `${count} ${(d.kinds as Record<string, string>)[kind] ?? kind}`)
        .join(', ');
      return { to: `${withQuery(back, { ok: `${d.savedOk(result.data.total)}${kinds ? ` (${kinds})` : ''}` })}#bozza` };
    }
    if (result.status === 401) return { to: accountPath(lang, 'signIn') };
    if (result.code === 'draft_apply_failed') {
      const failedIndex = typeof result.detail?.failedIndex === 'number' ? String(result.detail.failedIndex) : '';
      const reason = typeof result.detail?.reason === 'string' ? result.detail.reason : 'draft_apply_failed';
      return { to: `${withQuery(back, { salva: '1', fallita: failedIndex, motivo: reason })}#riepilogo` };
    }
    return { to: `${withQuery(back, { err: result.status === 0 ? 'unavailable' : result.code })}#bozza` };
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
  // extended elements. Every completed gesture queues ONE operation on the draft (D57);
  // the first step of a two-step element never calls the API: it only carries the start back.
  async 'spiaggia-disegno'(request, form, lang) {
    const beach = form('beach');
    const tool = form('strumento');
    if (!slugPattern.test(beach) || !(drawTools as readonly string[]).includes(tool)) return bad();
    const back = beachLayoutPath(lang, beach);
    const go = (params: Record<string, string | undefined>): Outcome => ({ to: `${withQuery(back, { strumento: tool, ...params })}#disegno` });
    const queue = (op: Record<string, unknown>) => draftOp(request, form, lang, op, { strumento: tool }, '#disegno');

    if (tool === 'gomma') {
      const element = form('elemento');
      if (!draftRefPattern.test(element)) return bad();
      return queue({ op: 'remove_element', elementId: element });
    }
    if (tool === 'postazione') {
      // One step: the tapped free cell; type and automatic code come from the draft (D57).
      const cell = drawCellPattern.exec(form('cella'));
      if (!cell) return bad();
      return queue({
        op: 'create_spot',
        zone: cell[1],
        row: Number(cell[2]),
        col: Number(cell[3]),
        ...(uuidPattern.test(form('tipo-postazione')) ? { typeId: form('tipo-postazione') } : {}),
      });
    }
    if (tool === 'passerella-verticale') {
      // From the grid the vertical walkway crosses every zone; one zone only via the form.
      return queue({ op: 'add_element', kind: 'walkway', orientation: 'vertical', zone: null, row: 0, col: wholeNumber(form('colonna')) });
    }
    if (tool === 'decorazione') {
      // One step: the tapped cell, the chosen sign and the optional label (D35).
      const cell = drawCellPattern.exec(form('cella'));
      if (!cell) return bad();
      const sign = form('segno');
      if (!(decorationSigns as readonly string[]).includes(sign)) return bad();
      const label = form('etichetta').trim().slice(0, 40);
      return queue({ op: 'add_element', kind: 'decoration', zone: cell[1], row: Number(cell[2]), col: Number(cell[3]), sign, ...(label ? { label } : {}) });
    }
    const horizontal = tool === 'passerella-orizzontale';
    const target = drawCellPattern.exec(form(horizontal ? 'interstizio' : 'cella'));
    if (!target) return bad();
    const label = form('etichetta').trim().slice(0, 40);
    const start = drawCellPattern.exec(form('passo'));
    if (!start) return go({ passo: target[0], ...(label ? { etichetta: label } : {}) });
    if (start[1] !== target[1] || start[2] !== target[2]) return go({ derr: 'step_mismatch' });
    const colStart = Math.min(Number(start[3]), Number(target[3]));
    const span = Math.abs(Number(start[3]) - Number(target[3])) + 1;
    if (horizontal) {
      return queue({ op: 'add_element', kind: 'walkway', orientation: 'horizontal', zone: target[1], row: Number(target[2]), col: colStart, span, ...(label ? { label } : {}) });
    }
    if (tool === 'struttura' && !label) return go({ passo: start[0], derr: 'label_required' });
    return queue({ op: 'add_element', kind: tool === 'struttura' ? 'structure' : 'cabin_block', zone: target[1], row: Number(target[2]), col: colStart, span, ...(label ? { label } : {}) });
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
    const span = from >= 0 && to >= 0 ? Math.abs(to - from) + 1 : 1;
    const col = Math.min(from, to);
    let op: Record<string, unknown>;
    if (kind === 'passerella-verticale') {
      op = { op: 'add_element', kind: 'walkway', orientation: 'vertical', zone: zone === 'tutte' ? null : zone, row: 0, col: from, ...(label ? { label } : {}) };
    } else if (kind === 'passerella-orizzontale') {
      op = { op: 'add_element', kind: 'walkway', orientation: 'horizontal', zone, row, col, span, ...(label ? { label } : {}) };
    } else if (kind === 'struttura' || kind === 'blocco-cabine') {
      if (kind === 'struttura' && !label) return { to: `${withQuery(back, { derr: 'label_required' })}#disegno` };
      op = { op: 'add_element', kind: kind === 'struttura' ? 'structure' : 'cabin_block', zone, row, col, span, ...(label ? { label } : {}) };
    } else if (kind === 'decorazione') {
      const sign = form('sign');
      if (!(decorationSigns as readonly string[]).includes(sign)) return bad();
      op = { op: 'add_element', kind: 'decoration', zone, row, col: from, sign, ...(label ? { label } : {}) };
    } else {
      return bad();
    }
    return draftOp(request, form, lang, op, {}, '#disegno');
  },

  // "Rimuovi" from the element list: the same draft operation as the eraser, from a plain button.
  async 'spiaggia-elemento-rimuovi'(request, form, lang) {
    const element = form('elemento');
    if (!draftRefPattern.test(element)) return bad();
    const tool = (drawTools as readonly string[]).includes(form('strumento')) ? form('strumento') : undefined;
    return draftOp(request, form, lang, { op: 'remove_element', elementId: element }, { strumento: tool }, '#disegno');
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
  // The edit of one spot queues edit_spot on the draft (D57): code, equipment, named zone,
  // maintenance (D56) and the rental annotations travel together as the patch.
  'spiaggia-modifica': (request, form, lang) => {
    const spotId = form('spot');
    if (!draftRefPattern.test(spotId)) return Promise.resolve(bad());
    // La tendina della zona con nome (D50): «Nessuna zona» arriva vuota e stacca la postazione.
    const named = form('namedZone');
    const code = form('code').trim().toUpperCase();
    return draftOp(
      request,
      form,
      lang,
      {
        op: 'edit_spot',
        spotId,
        patch: {
          ...(code === '' ? {} : { code }),
          umbrellas: wholeNumber(form('umbrellas')),
          sunbeds: wholeNumber(form('sunbeds')),
          maxGuests: wholeNumber(form('guests')),
          maintenance: form('maintenance') === 'yes',
          rentalType: annotation(form('rentalType')),
          rentalNotes: annotation(form('rentalNotes')),
          namedZoneId: uuidPattern.test(named) ? named : null,
        },
      },
      {},
      '#bozza',
    );
  },
  // Zone con nome (D50): crea, rinomina, elimina e il gesto per fila intera.
  'zona-crea': (request, form, lang) => zonesAct(request, form, lang, '', 'POST', { name: form('name') }, { invalid_state: 'zone_name_taken', cap_reached: 'zone_limit' }),
  'zona-rinomina': (request, form, lang) => {
    const zoneId = form('zona');
    if (!uuidPattern.test(zoneId)) return Promise.resolve(bad());
    return zonesAct(request, form, lang, `/${encodeURIComponent(zoneId)}`, 'PUT', { name: form('name') }, { invalid_state: 'zone_name_taken' });
  },
  'zona-elimina': (request, form, lang) => {
    const zoneId = form('zona');
    if (!uuidPattern.test(zoneId)) return Promise.resolve(bad());
    return zonesAct(request, form, lang, `/${encodeURIComponent(zoneId)}`, 'DELETE', undefined);
  },
  'zona-fila': (request, form, lang) => {
    const named = form('namedZone');
    return layoutAct(request, form, lang, '/rows/zone', 'PUT', {
      zone: form('zone'),
      rowNumber: wholeNumber(form('row')),
      zoneId: uuidPattern.test(named) ? named : null,
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
  // Deletion queues delete_spot (D57). The real guards speak at the save: future bookings
  // and history refuse with their own distinct messages in the summary.
  'spiaggia-elimina': (request, form, lang) => {
    const spotId = form('spot');
    if (!draftRefPattern.test(spotId)) return Promise.resolve(bad());
    return draftOp(request, form, lang, { op: 'delete_spot', spotId }, {}, '#bozza');
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
    // The card posts a single spot outside selection mode: each context comes back as it was.
    const keep: Record<string, string | undefined> = {
      day,
      vista: form('vista') || undefined,
      selezione: form('selezione') === '1' ? '1' : undefined,
      q: form('q') || undefined,
      // The filters and the scale of the console (D37) come back as they were.
      zona: /^(riva|ombrelloni|monte)$/.test(form('zona')) ? form('zona') : undefined,
      stato: /^(free|reserved|expected|present|departed|blocked|not_for_sale)$/.test(form('stato')) ? form('stato') : undefined,
      scala: /^(compatta|ampia|adatta)$/.test(form('scala')) ? form('scala') : undefined,
      postazione: form('postazione') || undefined,
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

  // Hotel conventions (spec §4.1): one form for creation and edit, status and deletion.
  async 'convenzione-salva'(request, form, lang) {
    const beach = form('beach');
    if (!slugPattern.test(beach)) return bad();
    const conventionId = form('convention');
    const editing = uuidPattern.test(conventionId);
    // A refusal comes back next to the form, keeping the edit open when there was one.
    const backTo = (merr: string): Outcome => ({
      to: `${withQuery(manageDealsPath(lang, beach), { ...(editing ? { modifica: conventionId } : {}), merr })}#modulo-convenzione`,
    });
    const percent = form('percent').trim();
    const fixed = form('fixed').trim();
    // Exactly one of the two prices, as the register demands: a clear message otherwise.
    if ((percent === '') === (fixed === '')) return backTo('convention_pricing');
    const payload = {
      partnerName: form('partner').trim(),
      code: form('code').trim(),
      percentBps: percent === '' ? null : percentBps(percent),
      fixedPriceCents: fixed === '' ? null : (parseEuro(fixed) ?? -1),
      validFrom: form('from').trim() || null,
      validTo: form('to').trim() || null,
      notes: annotation(form('notes')),
    };
    const result = await apiCall(editing ? 'PUT' : 'POST', `/v1/manage/beaches/${beach}/conventions${editing ? `/${encodeURIComponent(conventionId)}` : ''}`, {
      body: payload,
      token: cookieToken(request),
    });
    if (result.ok) return { to: manageDealsPath(lang, beach), ok: '1' };
    if (result.status === 401) return { to: accountPath(lang, 'signIn') };
    const code = result.status === 0 ? 'unavailable' : result.code === 'invalid_state' ? 'invalid_request' : result.code;
    return backTo(code);
  },
  'convenzione-stato': (request, form, lang) => {
    const conventionId = form('convention');
    if (!uuidPattern.test(conventionId)) return Promise.resolve(bad());
    return dealsAct(request, form, lang, `/${encodeURIComponent(conventionId)}/status`, 'POST', { active: form('active') === 'yes' });
  },
  'convenzione-elimina': (request, form, lang) => {
    const conventionId = form('convention');
    if (!uuidPattern.test(conventionId)) return Promise.resolve(bad());
    // A used convention cannot be deleted: the message points at suspension instead.
    return dealsAct(request, form, lang, `/${encodeURIComponent(conventionId)}`, 'DELETE', undefined, { invalid_state: 'convention_used' });
  },

  // Extra services (spec §4.2): one form for creation and edit, retirement and deletion.
  async 'extra-salva'(request, form, lang) {
    const beach = form('beach');
    if (!slugPattern.test(beach)) return bad();
    const serviceId = form('service');
    const editing = uuidPattern.test(serviceId);
    // A refusal comes back next to the form, keeping the edit open when there was one.
    const backTo = (merr: string): Outcome => ({
      to: `${withQuery(manageExtrasPath(lang, beach), { ...(editing ? { modifica: serviceId } : {}), merr })}#modulo-extra`,
    });
    const price = parseEuro(form('price'));
    if (price === null) return backTo('invalid_request');
    const position = form('position').trim();
    const payload = {
      nameIt: form('nameIt').trim(),
      nameEn: form('nameEn').trim() || null,
      unitPriceCents: price,
      position: position === '' ? 0 : /^\d{1,5}$/.test(position) ? Number(position) : -1,
    };
    const result = await apiCall(editing ? 'PUT' : 'POST', `/v1/manage/beaches/${beach}/extras${editing ? `/${encodeURIComponent(serviceId)}` : ''}`, {
      body: payload,
      token: cookieToken(request),
    });
    if (result.ok) return { to: manageExtrasPath(lang, beach), ok: '1' };
    if (result.status === 401) return { to: accountPath(lang, 'signIn') };
    return backTo(result.status === 0 ? 'unavailable' : result.code === 'invalid_state' ? 'invalid_request' : result.code);
  },
  'extra-stato': (request, form, lang) => {
    const serviceId = form('service');
    if (!uuidPattern.test(serviceId)) return Promise.resolve(bad());
    return extrasAct(request, form, lang, `/${encodeURIComponent(serviceId)}/status`, 'POST', { active: form('active') === 'yes' });
  },
  'extra-elimina': (request, form, lang) => {
    const serviceId = form('service');
    if (!uuidPattern.test(serviceId)) return Promise.resolve(bad());
    // A used service cannot be deleted: the message points at retirement instead.
    return extrasAct(request, form, lang, `/${encodeURIComponent(serviceId)}`, 'DELETE', undefined, { invalid_state: 'extra_used' });
  },

  // Recensioni (D51): la replica dello stabilimento e la segnalazione alla piattaforma.
  async 'recensione-replica'(request, form, lang) {
    const beach = form('beach');
    const reviewId = form('recensione');
    if (!slugPattern.test(beach) || !uuidPattern.test(reviewId)) return bad();
    const { getDictionary, config } = await import('@ombre/shared');
    const back = manageReviewsPath(lang, beach);
    const result = await apiCall('POST', `/v1/manage/beaches/${beach}/reviews/${encodeURIComponent(reviewId)}/reply`, {
      body: { reply: form('reply').trim() },
      token: cookieToken(request),
    });
    if (result.ok) return { to: back, ok: getDictionary(lang, config.brandName).reviews.replied };
    if (result.status === 401) return { to: accountPath(lang, 'signIn') };
    return { to: back, err: result.status === 0 ? 'unavailable' : result.code };
  },
  async 'recensione-segnala'(request, form, lang) {
    const beach = form('beach');
    const reviewId = form('recensione');
    if (!slugPattern.test(beach) || !uuidPattern.test(reviewId)) return bad();
    const back = manageReviewsPath(lang, beach);
    const result = await apiCall('POST', `/v1/manage/beaches/${beach}/reviews/${encodeURIComponent(reviewId)}/flag`, {
      body: { reason: form('reason').trim() },
      token: cookieToken(request),
    });
    if (result.ok) return { to: back, ok: '1' };
    if (result.status === 401) return { to: accountPath(lang, 'signIn') };
    const code = result.status === 0 ? 'unavailable' : result.code === 'invalid_state' ? 'review_already_flagged' : result.code;
    return { to: back, err: code };
  },

  'reception-accesso': async (request, form, lang) => {
    const { getDictionary, config } = await import('@ombre/shared');
    const t = getDictionary(lang, config.brandName);
    return manage(request, form, lang, '/access-events', 'POST', { credential: form('credential'), kind: form('kind') }, (data) => {
      const entry = data as { code: string; spotCode: string; zoneName: string | null; guestName: string; extras?: { name: { it: string; en: string | null }; quantity: number }[] };
      // La zona con nome accanto al codice della postazione, quando c'è (D50).
      const base = `${entry.code} · ${entry.spotCode}${entry.zoneName ? ` · ${t.zone.badge(entry.zoneName)}` : ''} · ${entry.guestName}`;
      // The extras to hand over, right in the outcome of the check (spec §4.2).
      const extras = entry.extras ?? [];
      if (extras.length === 0) return base;
      const lines = extras.map((line) => t.booking.extraLine(lang === 'en' ? (line.name.en ?? line.name.it) : line.name.it, line.quantity)).join(', ');
      return `${base} · ${t.account.toDeliver}: ${lines}`;
    });
  },

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

/**
 * The two addresses of the sign-in with Google (D48), reached by plain navigation: the
 * start is an ANCHOR on the sign-in page (the CSP form-action 'self' stays untouched),
 * and the return is where the provider — real or test — sends the navigator back.
 */
export async function GET(request: Request, context: { params: Promise<{ action: string }> }): Promise<Response> {
  const { action } = await context.params;
  const url = new URL(request.url);
  const langAsked = url.searchParams.get('lang') ?? '';
  const lang: Locale = isLocale(langAsked) ? langAsked : 'it';

  if (action === 'oidc-avvio') {
    const providers = await apiCall<{ provider: 'test' | 'google' | null; state?: string; authorizeUrl?: string }>('GET', '/v1/auth/oidc/providers');
    if (!providers.ok || !providers.data.provider) return redirect(accountPath(lang, 'signIn'));
    // Google: straight to the provider. Test: the local consent page, state in the query.
    if (providers.data.provider === 'google' && providers.data.authorizeUrl) return redirect(providers.data.authorizeUrl);
    return redirect(withQuery(accountPath(lang, 'oidcConsent'), { state: providers.data.state }));
  }

  if (action === 'oidc-ritorno') {
    const code = url.searchParams.get('code') ?? '';
    const state = url.searchParams.get('state') ?? '';
    if (code === '' || state === '') return redirect(withQuery(accountPath(lang, 'signIn'), { err: 'oidc_failed' }));
    const result = await apiCall<{ token: string; expiresAt: string }>('POST', '/v1/auth/oidc/callback', { body: { code, state } });
    if (!result.ok) return redirect(withQuery(accountPath(lang, 'signIn'), { err: result.status === 0 ? 'unavailable' : 'oidc_failed' }));
    // The session cookie is laid exactly as after «accesso», and the anonymous cart
    // joins the account the same way (D46).
    const headers = new Headers({ Location: accountPath(lang, 'overview') });
    headers.append('Set-Cookie', sessionCookieHeader(result.data.token, result.data.expiresAt));
    const ticket = readCartTicket(request);
    if (ticket) {
      const claimed = await apiCall('POST', `/v1/carts/${ticket.cartId}/claim`, { body: { accessToken: ticket.accessToken }, token: result.data.token });
      if (claimed.ok || claimed.status === 404) headers.append('Set-Cookie', clearCartCookieHeader());
    }
    return new Response(null, { status: 303, headers });
  }

  return new Response('Not found', { status: 404 });
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
    // The extras travel as one quantity field per service (extra-<serviceId>, 1–20, a quantity
    // of zero stays home): they are assembled as id:qty pairs, read back by chosenExtras.
    if (name === 'extras') {
      const pairs: string[] = [];
      for (const [key, value] of data.entries()) {
        const match = /^extra-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.exec(key);
        if (match && typeof value === 'string' && /^(?:[1-9]|1\d|20)$/.test(value.trim())) pairs.push(`${match[1]}:${value.trim()}`);
      }
      return pairs.join(',');
    }
    // Checkboxes with the same name arrive as several values: they are joined.
    const field = name === 'weekdays' ? 'weekday' : name === 'spots' ? 'spot' : name === 'amenities' ? 'srv' : name;
    const values = data.getAll(field).filter((value): value is string => typeof value === 'string');
    return name === 'weekdays' || name === 'gallery' || name === 'spots' || name === 'amenities' ? values.join(',') : (values[0] ?? '');
  };
  const lang = form('lang');
  if (!isLocale(lang)) return bad();

  const outcome = await run(request, form, lang);
  if (outcome instanceof Response) return outcome;
  return redirect(withQuery(outcome.to, { ok: outcome.ok, err: outcome.err }));
}
