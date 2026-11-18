// Walks the guest account of the running site as a browser without scripts (D44–D48):
// «Crea un conto» with its neutral answer, the sign-in with the TEST Google provider,
// «Il mio conto» with the history relinked by email, and the cart of one beach club
// from two items with different periods and holders up to the paid order with its passes.
// Needs OMBRE_SEED_DEMO=true, OMBRE_DEMO_PASSWORD, the test payment provider AND
// OMBRE_OIDC_PROVIDER=test switched on.
// Usage: node scripts/smoke-conto.ts [site address]   (default http://127.0.0.1:3210)

const base = (process.argv[2] ?? 'http://127.0.0.1:3210').replace(/\/+$/, '');
const password = process.env.OMBRE_DEMO_PASSWORD ?? '';
const beach = 'bagno-delle-dune';
// A fresh pair of addresses per run: the suite can repeat on the same database.
const run = Date.now().toString(36);
const googleEmail = `google-${run}@example.org`;
const failures: string[] = [];
let checks = 0;

function check(condition: boolean, message: string): void {
  checks += 1;
  if (!condition) failures.push(message);
}

/**
 * A visitor: keeps its own cookies, like a browser profile. The account flows lay more
 * than one cookie at a time (session, cart ticket), so the jar holds them by name; and
 * «oidc-ritorno» lays the session on a GET, so both verbs absorb what the server sets.
 */
class Visitor {
  private jar = new Map<string, string>();

  private absorb(response: Response): void {
    for (const line of response.headers.getSetCookie()) {
      const pair = line.split(';')[0] ?? '';
      const cut = pair.indexOf('=');
      if (cut < 1) continue;
      const name = pair.slice(0, cut);
      if (/max-age=0/i.test(line)) this.jar.delete(name);
      else this.jar.set(name, pair.slice(cut + 1));
    }
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const cookie = [...this.jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
    return cookie ? { Cookie: cookie, ...extra } : extra;
  }

  async get(path: string): Promise<{ status: number; html: string; location: string }> {
    const response = await fetch(base + path, { redirect: 'manual', headers: this.headers() });
    this.absorb(response);
    return { status: response.status, html: (await response.text()).replaceAll('&amp;', '&'), location: response.headers.get('location') ?? '' };
  }

  async post(action: string, fields: Record<string, string>): Promise<string> {
    const response = await fetch(`${base}/azioni/${action}`, {
      method: 'POST',
      redirect: 'manual',
      headers: this.headers({ 'Content-Type': 'application/x-www-form-urlencoded', Origin: base, 'X-Forwarded-For': '198.51.100.7' }),
      body: new URLSearchParams(fields).toString(),
    });
    this.absorb(response);
    return response.headers.get('location') ?? `status ${response.status}`;
  }

  async signIn(email: string, secret = password): Promise<string> {
    return this.post('accesso', { lang: 'it', email, password: secret });
  }
}

if (!password) {
  console.error('Set OMBRE_DEMO_PASSWORD to the value the stack was started with.');
  process.exit(1);
}

// ---- «Crea un conto»: the page in both languages, the neutral answer (D44) ----
const anybody = new Visitor();
const registerIt = await anybody.get('/area/registrazione');
check(registerIt.status === 200 && /<h1[^>]*>Crea un conto<\/h1>/.test(registerIt.html), 'register: the Italian page has no «Crea un conto» heading');
check(registerIt.html.includes('action="/azioni/registrazione"') && registerIt.html.includes('name="name"') && registerIt.html.includes('name="email"'), 'register: no form with name and email');
check(!registerIt.html.includes('name="password"'), 'register: the page asks for a password, which the system must generate');
check(/<meta name="robots" content="noindex/.test(registerIt.html), 'register: must not be indexable');
const registerEn = await anybody.get('/en/account/register');
check(registerEn.status === 200 && /<h1[^>]*>Create an account<\/h1>/.test(registerEn.html), 'register: the English page has no «Create an account» heading');
check(registerEn.html.includes('action="/azioni/registrazione"'), 'register: the English page has no registration form');

// New email and existing email must get the same answer, byte for byte (no enumeration).
const freshEmail = `conto-${run}@example.org`;
const firstAnswer = await anybody.post('registrazione', { lang: 'it', name: 'Ospite del Conto', email: freshEmail });
check(firstAnswer.startsWith('/area/accesso?ok='), `register: a new email answered ${firstAnswer}`);
const secondAnswer = await anybody.post('registrazione', { lang: 'it', name: 'Ospite del Conto', email: freshEmail });
check(secondAnswer === firstAnswer, 'register: the answer for an existing email differs from the one for a new email');
check((await anybody.get(firstAnswer)).html.includes('Richiesta registrata.'), 'register: the neutral notice is not shown on the sign-in page');

// ---- The sign-in page offers the test provider, in both languages (D48) ----
const signInIt = await new Visitor().get('/area/accesso');
check(signInIt.html.includes('href="/azioni/oidc-avvio?lang=it"') && signInIt.html.includes('Entra con Google (fornitore di prova)'), 'sign-in: no «Entra con Google (fornitore di prova)» anchor with the test provider on');
check(signInIt.html.includes('Chi entra con Google non ha una password locale da gestire'), 'sign-in: the page does not say that Google users have no local password');
const signInEn = await new Visitor().get('/en/account/sign-in');
check(signInEn.html.includes('href="/azioni/oidc-avvio?lang=en"') && signInEn.html.includes('Sign in with Google (test provider)'), 'sign-in: the English page has no test provider anchor');

// ---- The manager prepares the ground: three July days and one extra service ----
const manager = new Visitor();
check((await manager.signIn('gestore@bagnodelledune.example')).endsWith('/area/profilo'), 'setup: manager not signed in');
const days = ['2027-07-14', '2027-07-15', '2027-07-16'] as const;
for (const day of days) {
  check((await manager.post('gestione-pubblica', { lang: 'it', beach, day, price: '30,00' })).includes('ok=1'), `setup: the day ${day} was not published`);
}
// The demo seeds publish no extra services: the suite creates one through the owner
// path (the manager's extras page), once — later runs find it already there.
const extrasPage = await manager.get(`/area/gestione/${beach}/extra`);
if (!extrasPage.html.includes('Telo mare (collaudo)')) {
  check((await manager.post('extra-salva', { lang: 'it', beach, service: '', nameIt: 'Telo mare (collaudo)', nameEn: 'Beach towel (test)', price: '5,00', position: '' })).includes('ok=1'), 'setup: the extra service was not created');
}

// ---- The quick path first (criterion 7), with the email the Google sign-in will use ----
const guest = new Visitor();
const quickDay = days[2];
const club = await guest.get(`/bagni/${beach}?day=${quickDay}`);
const quickLink = new RegExp(`href="(/bagni/${beach}/prenota\\?spot=([0-9a-f-]{36})&day=${quickDay})"`).exec(club.html);
check(quickLink !== null, 'beach page: no free spot on the suite day');
const summary = await guest.get(quickLink![1]!);
check(summary.html.includes('action="/azioni/riserva"') && summary.html.includes('Riserva la postazione'), 'summary: the quick no-account path is not offered as before');
check(summary.html.includes('action="/azioni/carrello-aggiungi"'), 'summary: «Aggiungi al carrello» is not next to the quick path');
const quickKey = /name="key" value="(web-[0-9a-f-]{36})"/.exec(summary.html)?.[1] ?? '';
const quickHold = await guest.post('riserva', { lang: 'it', beach, spot: quickLink![2]!, day: quickDay, key: quickKey });
const quickBookingUrl = await guest.post('prenotazione', { lang: 'it', beach, hold: quickHold.split('/').at(-1)!, name: 'Ospite Google', email: googleEmail });
const [, quickBookingId = '', quickToken = ''] = /\/prenotazione\/([0-9a-f-]{36})\?t=(.+)$/.exec(quickBookingUrl) ?? [];
check(quickBookingId !== '', `quick path: checkout answered ${quickBookingUrl}`);
await guest.post('pagamento-prova', { lang: 'it', beach, booking: quickBookingId, t: quickToken, outcome: 'succeeded' });
const quickPaid = await guest.get(quickBookingUrl);
const quickCode = /OM-270716-\d{3}/.exec(quickPaid.html)?.[0] ?? '';
check(quickCode !== '' && quickPaid.html.includes('Prenotazione confermata'), 'quick path: the booking without an account was not confirmed');

// ---- «Entra con Google» on the test provider: start, consent, return (D48) ----
const avvio = await guest.get('/azioni/oidc-avvio?lang=it');
check(avvio.status === 303 && avvio.location.startsWith('/area/consenso?state='), `oidc: the start answered ${avvio.status} ${avvio.location}`);
const consent = await guest.get(avvio.location);
check(consent.status === 200 && /<h1[^>]*>Consenso del fornitore di prova<\/h1>/.test(consent.html), 'oidc: no local consent page of the test provider');
check(consent.html.includes('action="/azioni/oidc-consenso"'), 'oidc: the consent page has no form');
const state = /name="state" value="([^"]+)"/.exec(consent.html)?.[1] ?? '';
check(state !== '', 'oidc: the consent page carries no state');
const ritorno = await guest.post('oidc-consenso', { lang: 'it', state, email: googleEmail, name: 'Ospite Google' });
check(ritorno.startsWith('/azioni/oidc-ritorno?'), `oidc: the consent answered ${ritorno}`);
const landed = await guest.get(ritorno);
check(landed.status === 303 && landed.location.endsWith('/area/profilo'), `oidc: the return answered ${landed.status} ${landed.location}`);

// ---- «Il mio conto»: the home of the guest, with the booking relinked by email (D47) ----
const myAccount = await guest.get('/area/profilo');
check(/<h1[^>]*>Il mio conto<\/h1>/.test(myAccount.html), 'my account: the guest overview is not «Il mio conto»');
check(myAccount.html.includes('class="account-bar"') && myAccount.html.includes('Ospite Google'), 'my account: no bar with the name of who is signed in');
check(myAccount.html.includes('Le mie prenotazioni') && myAccount.html.includes('Prossimi arrivi'), 'my account: no bookings list or arrivals summary');
check(myAccount.html.includes(quickCode), 'my account: the booking made before the sign-in is not relinked by email (criterion 4)');
check(myAccount.html.includes('shape-rendering="crispEdges"'), 'my account: the pass of the relinked booking is missing');
check(myAccount.html.includes('30,00'), 'my account: the spending summary does not carry the booking total');
check(myAccount.html.includes('Aggiungi un altro periodo') && myAccount.html.includes('Aggiungi servizi'), 'my account: no «Aggiungi un altro periodo» or «Aggiungi servizi» on the booking (criterion 5)');
check(myAccount.html.includes(`?day=${quickDay}`), 'my account: «Aggiungi un altro periodo» does not point at the beach page with the day precompiled');
check(myAccount.html.includes('action="/azioni/conto-extra"'), 'my account: «Aggiungi servizi» has no form of its own');
const myAccountEn = await guest.get('/en/account/overview');
check(/<h1[^>]*>My account<\/h1>/.test(myAccountEn.html) && myAccountEn.html.includes('My bookings'), 'my account: not available in English');

// A second Google sign-in enters the same account: no duplicate, history intact.
const again = new Visitor();
const avvioAgain = await again.get('/azioni/oidc-avvio?lang=it');
const consentAgain = await again.get(avvioAgain.location);
const stateAgain = /name="state" value="([^"]+)"/.exec(consentAgain.html)?.[1] ?? '';
await again.get(await again.post('oidc-consenso', { lang: 'it', state: stateAgain, email: googleEmail, name: 'Ospite Google' }));
check((await again.get('/area/profilo')).html.includes(quickCode), 'oidc: a second sign-in with the same email does not find the same history');

// ---- The cart (criteria 1–2): two items, different periods and holders, one payment ----
const emptyIt = await new Visitor().get(`/bagni/${beach}/carrello`);
check(emptyIt.status === 200 && /<h1[^>]*>Il carrello<\/h1>/.test(emptyIt.html) && emptyIt.html.includes('Il carrello è vuoto'), 'cart: the empty Italian page does not render');
check(/<meta name="robots" content="noindex/.test(emptyIt.html), 'cart: must not be indexable');
const emptyEn = await new Visitor().get(`/en/beach-clubs/${beach}/cart`);
check(emptyEn.status === 200 && /<h1[^>]*>Your cart<\/h1>/.test(emptyEn.html) && emptyEn.html.includes('The cart is empty'), 'cart: the empty English page does not render');

const shopper = new Visitor();
const periodClub = await shopper.get(`/bagni/${beach}?day=${days[0]}&to=${days[1]}`);
const firstSpot = new RegExp(`href="/bagni/${beach}/prenota\\?spot=([0-9a-f-]{36})&day=${days[0]}&to=${days[1]}"`).exec(periodClub.html)?.[1] ?? '';
check(firstSpot !== '', 'cart: no free spot for the period item');
check((await shopper.post('carrello-aggiungi', { lang: 'it', beach, spot: firstSpot, day: days[0], to: days[1] })) === `/bagni/${beach}/carrello`, 'cart: the period item was not added');
const dayClub = await shopper.get(`/bagni/${beach}?day=${quickDay}`);
const secondSpot = [...dayClub.html.matchAll(new RegExp(`href="/bagni/${beach}/prenota\\?spot=([0-9a-f-]{36})&day=${quickDay}"`, 'g'))].map((match) => match[1]!).find((spot) => spot !== firstSpot) ?? '';
check(secondSpot !== '', 'cart: no second free spot for the single-day item');
check((await shopper.post('carrello-aggiungi', { lang: 'it', beach, spot: secondSpot, day: quickDay })) === `/bagni/${beach}/carrello`, 'cart: the single-day item was not added');

let cartView = await shopper.get(`/bagni/${beach}/carrello`);
const cartId = /name="cart" value="([0-9a-f-]{36})"/.exec(cartView.html)?.[1] ?? '';
check(cartId !== '', 'cart: the page carries no cart id');
check((cartView.html.match(/action="\/azioni\/carrello-voce"/g) ?? []).length === 2, 'cart: expected exactly two items on the page');
check(cartView.html.includes('Dal 14 al 15 luglio 2027, 2 giornate') && cartView.html.includes('16 luglio 2027'), 'cart: the two different periods are not both written');
check(cartView.html.includes('Totale del carrello') && cartView.html.includes('90,00'), 'cart: the grand total of the two items is not 90,00');
// «Per chi è», item by item: the period panel and the single-day panel get their own holder.
const panelOf = (html: string, marker: string): string => html.split('<div class="panel">').find((part) => part.includes(marker)) ?? '';
const itemOf = (html: string, marker: string): string => /name="item" value="([0-9a-f-]{36})"/.exec(panelOf(html, marker))?.[1] ?? '';
const serviceId = /name="extra-([0-9a-f-]{36})"/.exec(cartView.html)?.[1] ?? '';
check(serviceId !== '', 'cart: the extra service of the club is not offered on the items');
const periodItem = itemOf(cartView.html, '2 giornate');
const itemIds = [...new Set([...cartView.html.matchAll(/name="item" value="([0-9a-f-]{36})"/g)].map((match) => match[1]!))];
const singleItem = itemIds.find((id) => id !== periodItem) ?? '';
check(periodItem !== '' && singleItem !== '' && periodItem !== singleItem, 'cart: the two items cannot be told apart');
check((await shopper.post('carrello-voce', { lang: 'it', beach, cart: cartId, item: periodItem, name: 'Prima Intestataria', [`extra-${serviceId}`]: '2' })).includes('ok=1'), 'cart: holder and extras of the period item not saved');
check((await shopper.post('carrello-voce', { lang: 'it', beach, cart: cartId, item: singleItem, name: 'Secondo Intestatario' })).includes('ok=1'), 'cart: holder of the single-day item not saved');
cartView = await shopper.get(`/bagni/${beach}/carrello`);
check(cartView.html.includes('value="Prima Intestataria"') && cartView.html.includes('value="Secondo Intestatario"'), 'cart: the two holders are not kept item by item');
check(cartView.html.includes('Telo mare (collaudo)') && cartView.html.includes('10,00'), 'cart: the extra line with its price is missing');
check(cartView.html.includes('100,00'), 'cart: the grand total does not follow the extras');

// «Conferma e paga»: one order, one payment, one booking with its pass per item (D46).
const orderUrl = await shopper.post('carrello-conferma', { lang: 'it', beach, cart: cartId, name: 'Ordinante di Prova', email: `ordine-${run}@example.org` });
check(new RegExp(`^/bagni/${beach}/ordine/[0-9a-f-]{36}\\?t=`).test(orderUrl), `order: the confirmation answered ${orderUrl}`);
const [, orderId = '', orderToken = ''] = /\/ordine\/([0-9a-f-]{36})\?t=(.+)$/.exec(orderUrl) ?? [];
const pendingOrder = await shopper.get(orderUrl);
check(/<h1[^>]*>Ordine ORD-\d{6}-\d{3}<\/h1>/.test(pendingOrder.html), 'order: no single order code in the heading');
check(pendingOrder.html.includes('Pagamento di prova') && pendingOrder.html.includes('action="/azioni/ordine-prova"'), 'order: the test payment of the order is not offered');
check(/<meta name="robots" content="noindex/.test(pendingOrder.html), 'order: must not be indexable');
check((await shopper.get(orderUrl.replace(/\?t=.*/, '?t=token-inventato-abbastanza-lungo'))).status === 404, 'order: opened with a wrong token');
await shopper.post('ordine-prova', { lang: 'it', beach, order: orderId, t: orderToken, outcome: 'succeeded' });
const paidOrder = await shopper.get(orderUrl);
check(paidOrder.html.includes('Ordine pagato'), 'order: not marked as paid after the test payment');
const orderCodes = [...new Set(paidOrder.html.match(/OM-2707\d{2}-\d{3}/g) ?? [])];
check(orderCodes.length === 2, `order: expected one booking per item, found the codes ${orderCodes.join(', ') || 'none'}`);
// The QR codes only: the shell carries its own svg marks (logo, icons).
check((paidOrder.html.match(/shape-rendering="crispEdges"/g) ?? []).length === 2, 'order: expected one pass per item');
check(paidOrder.html.includes('Prima Intestataria') && paidOrder.html.includes('Secondo Intestatario'), 'order: the holders of the items are not on their bookings');
check(paidOrder.html.includes('100,00') && paidOrder.html.includes('Saldata'), 'order: no single total or settled payment state');
const paidOrderEn = await shopper.get(orderUrl.replace('/bagni/', '/en/beach-clubs/').replace('/ordine/', '/order/'));
check(paidOrderEn.html.includes('Order paid'), 'order: not available in English');
// The anonymous ticket is spent with the cart: the page is empty again.
check((await shopper.get(`/bagni/${beach}/carrello`)).html.includes('Il carrello è vuoto'), 'cart: the confirmed cart still hangs on the ticket cookie');

// ---- The three role names and nothing else (D42) on the new public pages ----
const banishedNames = [
  'per gli stabilimenti',
  'per gli stagionali',
  'condividi giornate',
  'condividi le giornate',
  'area gestore',
  'for beach clubs',
  'for season holders',
  'share days',
  'share your days',
  'manager area',
];
const namePages: { path: string; html: string }[] = [
  { path: '/area/registrazione', html: registerIt.html },
  { path: '/en/account/register', html: registerEn.html },
  { path: `/bagni/${beach}/carrello`, html: emptyIt.html },
  { path: `/en/beach-clubs/${beach}/cart`, html: emptyEn.html },
  { path: avvio.location, html: consent.html },
  { path: '/area/profilo (Ospite)', html: myAccount.html },
  { path: '/en/account/overview (Ospite)', html: myAccountEn.html },
];
for (const page of namePages) {
  const html = page.html.toLowerCase();
  for (const formula of banishedNames) {
    check(!html.includes(formula), `${page.path}: the banished formula "${formula}" is still in the page`);
  }
}

if (failures.length > 0) {
  console.error(`${failures.length} of ${checks} checks failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`All ${checks} checks passed on ${base}: registration, Google test sign-in with ${quickCode} relinked, and order with bookings ${orderCodes.join(' and ')} paid.`);
