// Walks «Al passo con il mercato» (D49–D54) on the running stack, as a browser without
// scripts: amenity filters on the search, the Aurora page with services, rating, reviews
// and named zones, the moderation of the manager (reply and flag), the deposit of Cala
// del Moro with its 72-hour terms, the cancellation from the account on both sides of
// the deadline, the «no profiling» line and the untouched quick path of the Dune.
// What the seeds do not have is created through the product's own paths, like smoke-conto
// does; what the test flags or collects STAYS so: the acceptance stack lives for testing.
// Needs OMBRE_SEED_DEMO=true, OMBRE_SEED_SHOWCASE=true, OMBRE_DEMO_PASSWORD, the test
// payment provider AND OMBRE_OIDC_PROVIDER=test switched on.
// Usage: node scripts/smoke-mercato.ts [site address] [API address]
//        (defaults http://127.0.0.1:3210 and http://127.0.0.1:3211)

const base = (process.argv[2] ?? 'http://127.0.0.1:3210').replace(/\/+$/, '');
const apiBase = (process.argv[3] ?? 'http://127.0.0.1:3211').replace(/\/+$/, '');
const password = process.env.OMBRE_DEMO_PASSWORD ?? '';
const aurora = 'lido-aurora';
const cala = 'cala-del-moro';
const dune = 'bagno-delle-dune';
const managerEmail = 'gestore@bagnodelledune.example';
const reviewerEmail = 'ospite@ombre.example';
const run = Date.now().toString(36);
const guestEmail = `mercato-${run}@example.org`;
const failures: string[] = [];
let checks = 0;

/** Every check is numbered and printed as it runs, so a red run names its exact step. */
function check(condition: boolean, message: string): void {
  checks += 1;
  console.log(`  ${String(checks).padStart(3)}. ${condition ? 'ok ' : 'NO '} ${message}`);
  if (!condition) failures.push(`${checks}. ${message}`);
}

function note(message: string): void {
  console.log(`       nota: ${message}`);
}

/** Days are computed in the clubs' zone: the deadline of D53 lives in Europe/Rome. */
function todayInRome(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
}

function addDays(day: string, amount: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

const today = todayInRome();
const compact = (day: string) => day.slice(2).replaceAll('-', '');

/** A visitor with its own cookie jar, exactly like the one of smoke-conto. */
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
      headers: this.headers({ 'Content-Type': 'application/x-www-form-urlencoded', Origin: base, 'X-Forwarded-For': '198.51.100.9' }),
      body: new URLSearchParams(fields).toString(),
    });
    this.absorb(response);
    return response.headers.get('location') ?? `status ${response.status}`;
  }

  async signIn(email: string, secret = password): Promise<string> {
    return this.post('accesso', { lang: 'it', email, password: secret });
  }
}

/** Plain JSON calls against the API, for availability, sign-in and the reports. */
async function api(method: string, path: string, payload?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(apiBase + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '198.51.100.9', ...headers },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  const text = await response.text();
  return { status: response.status, body: (text ? JSON.parse(text) : {}) as Record<string, unknown> };
}

interface FreeSpot {
  spotId: string;
  code: string;
  priceCents: number;
}

async function freeSpots(slug: string, day: string): Promise<FreeSpot[]> {
  const result = await api('GET', `/v1/beaches/${slug}/availability?day=${day}`);
  return (result.body.spots as FreeSpot[] | undefined) ?? [];
}

/** The quick path of the site: hold, checkout and test payment, like smoke-conto. */
async function quickBooking(visitor: Visitor, slug: string, spotId: string, day: string, to: string | null, email: string): Promise<{ code: string; bookingUrl: string; html: string }> {
  const query = `spot=${spotId}&day=${day}${to ? `&to=${to}` : ''}`;
  const summary = await visitor.get(`/bagni/${slug}/prenota?${query}`);
  const key = /name="key" value="(web-[0-9a-f-]{36})"/.exec(summary.html)?.[1] ?? '';
  check(key !== '', `prenotazione ${slug}: il riepilogo porta la chiave della riserva`);
  const fields: Record<string, string> = { lang: 'it', beach: slug, spot: spotId, day, key };
  if (to) fields.to = to;
  const hold = await visitor.post('riserva', fields);
  const holdId = hold.split('?')[0]?.split('/').at(-1) ?? '';
  const bookingUrl = await visitor.post('prenotazione', { lang: 'it', beach: slug, hold: holdId, name: 'Ospite Mercato', email });
  const [, bookingId = '', token = ''] = /\/prenotazione\/([0-9a-f-]{36})\?t=(.+)$/.exec(bookingUrl) ?? [];
  check(bookingId !== '', `prenotazione ${slug}: il checkout risponde con la pagina della prenotazione (${bookingUrl})`);
  await visitor.post('pagamento-prova', { lang: 'it', beach: slug, booking: bookingId, t: token, outcome: 'succeeded' });
  const paid = await visitor.get(bookingUrl);
  const code = new RegExp(`OM-${compact(day)}-\\d{3}`).exec(paid.html)?.[0] ?? '';
  check(code !== '' && paid.html.includes('Prenotazione confermata'), `prenotazione ${slug}: confermata dopo il pagamento di prova (${code || 'codice assente'})`);
  return { code, bookingUrl, html: paid.html };
}

/** The result card of one beach club on the search page, or '' when it is not there. */
function cardOf(html: string, name: string): string {
  return html.split('<li class="card portal-club">').find((part) => part.includes(`<h3>${name}</h3>`)) ?? '';
}

/** The account panel of one booking group: id="prenotazione-{groupId}" holds the code. */
function panelOf(html: string, code: string): { groupId: string; panel: string } {
  const part = html.split('id="prenotazione-').find((piece) => piece.slice(0, 5000).includes(code)) ?? '';
  return { groupId: /^([0-9a-f-]{36})"/.exec(part)?.[1] ?? '', panel: part };
}

if (!password) {
  console.error('Set OMBRE_DEMO_PASSWORD to the value the stack was started with.');
  process.exit(1);
}

// ---- 1. Ricerca ombrellone: le caselle dei servizi filtrano e restano spuntate (D49) ----
console.log('— Criterio 1: filtri per servizi sulla Ricerca ombrellone —');
const anybody = new Visitor();
const search = await anybody.get('/ricerca-ombrellone?srv=wifi&srv=bar');
check(search.status === 200, 'ricerca: la pagina con ?srv=wifi&srv=bar risponde 200');
const wifiBox = /<input[^>]*id="cerca-srv-wifi"[^>]*>/.exec(search.html)?.[0] ?? '';
const barBox = /<input[^>]*id="cerca-srv-bar"[^>]*>/.exec(search.html)?.[0] ?? '';
const petsBox = /<input[^>]*id="cerca-srv-pets"[^>]*>/.exec(search.html)?.[0] ?? '';
check(wifiBox.includes('checked') && barBox.includes('checked'), 'ricerca: le caselle Wi-Fi e Bar restano spuntate dopo l\'invio');
check(petsBox !== '' && !petsBox.includes('checked'), 'ricerca: una casella non chiesta non è spuntata');
check(search.html.includes('Mostra solo gli stabilimenti che hanno tutti i servizi scelti.'), 'ricerca: la frase d\'aiuto dice che servono TUTTI i servizi scelti');
for (const name of ['Lido Aurora', 'Cala del Moro', 'Bagno delle Dune']) {
  check(cardOf(search.html, name) !== '', `ricerca wifi+bar: «${name}» è tra i risultati (li ha entrambi)`);
}
const auroraCard = cardOf(search.html, 'Lido Aurora');
check((auroraCard.match(/<li class="badge">/g) ?? []).length === 5 && auroraCard.includes('+4'), 'ricerca: la carta dell\'Aurora mostra quattro distintivi e «+4» (otto servizi)');
check(auroraCard.includes('class="rating-line"') && auroraCard.includes('su 5 · 3 recensioni'), 'ricerca: la carta dell\'Aurora porta il voto «su 5 · 3 recensioni»');
check(auroraCard.includes('4,3'), 'ricerca: la media dell\'Aurora è 4,3 (5+4+4 su tre soggiorni)');
const narrow = await anybody.get('/ricerca-ombrellone?srv=restaurant');
check(cardOf(narrow.html, 'Lido Aurora') !== '', 'ricerca ristorante: l\'Aurora resta (ce l\'ha)');
check(cardOf(narrow.html, 'Cala del Moro') === '' && cardOf(narrow.html, 'Bagno delle Dune') === '', 'ricerca ristorante: Cala e Dune spariscono (non ce l\'hanno)');
const accessible = await anybody.get('/ricerca-ombrellone?srv=accessible');
check(cardOf(accessible.html, 'Bagno delle Dune') !== '' && cardOf(accessible.html, 'Lido Aurora') === '', 'ricerca accesso disabili: resta solo la Dune');
const searchEn = await anybody.get('/en/umbrella-search?srv=wifi&srv=bar');
check(searchEn.status === 200 && cardOf(searchEn.html, 'Lido Aurora').includes('out of 5 · 3 reviews'), 'ricerca inglese: la carta dell\'Aurora porta «out of 5 · 3 reviews»');
check(cardOf(searchEn.html, 'Lido Aurora').includes('Bar and kiosk'), 'ricerca inglese: i distintivi usano il lessico inglese («Bar and kiosk»)');

// ---- 2. La scheda dell'Aurora: servizi con icone, voto in testa, recensioni, zone (D49–D51) ----
console.log('— Criterio 2 e 3 (lato pubblico): scheda dell\'Aurora —');
const auroraPage = await anybody.get(`/bagni/${aurora}`);
check(auroraPage.html.includes('Servizi dello stabilimento'), 'scheda Aurora: la sezione «Servizi dello stabilimento» c\'è');
check((auroraPage.html.match(/class="amenity-icon"/g) ?? []).length === 8, 'scheda Aurora: otto servizi elencati, ciascuno con la sua icona in linea');
check(auroraPage.html.includes('class="rating-line"') && auroraPage.html.includes('4,3') && auroraPage.html.includes('su 5 · 3 recensioni'), 'scheda Aurora: il voto medio sta in testa alla pagina');
check(auroraPage.html.includes('Le recensioni degli Ospiti'), 'scheda Aurora: la sezione «Le recensioni degli Ospiti» c\'è');
check((auroraPage.html.match(/<article class="review-card"/g) ?? []).length === 3, 'scheda Aurora: le tre recensioni del seme sono tutte visibili');
check(auroraPage.html.includes('Recensione verificata: soggiorno reale.'), 'scheda Aurora: ogni recensione dichiara il soggiorno verificato');
check(auroraPage.html.includes('Risposta dello stabilimento') && auroraPage.html.includes('Grazie di cuore! Vi aspettiamo di nuovo in prima fila.'), 'scheda Aurora: la replica del Gestore compare sotto la recensione');
check(auroraPage.html.includes('Ospite dimostrativo') && !auroraPage.html.includes(reviewerEmail), 'scheda Aurora: compare il nome del conto, mai l\'email');
const auroraDay = addDays(today, 5);
const auroraFrees = await freeSpots(aurora, auroraDay);
const auroraA = auroraFrees.find((spot) => spot.code.startsWith('A'));
check(auroraA !== undefined, `scheda Aurora: una postazione di fila A libera il ${auroraDay}`);
if (auroraA) {
  const plan = await anybody.get(`/bagni/${aurora}?day=${auroraDay}&spot=${auroraA.spotId}`);
  check(plan.html.includes('Zona Prima fila'), 'planimetria Aurora: la carta della postazione porta «Zona Prima fila»');
  check(plan.html.includes('zona Prima fila'), 'planimetria Aurora: la barra di selezione nomina la zona della postazione scelta');
  const summary = await anybody.get(`/bagni/${aurora}/prenota?spot=${auroraA.spotId}&day=${auroraDay}`);
  check(summary.html.includes('>Zona<') && summary.html.includes('Prima fila'), 'riepilogo Aurora: la riga «Zona · Prima fila» sta nel riepilogo di prenotazione');
  check(!summary.html.includes('Caparra adesso'), 'riepilogo Aurora: senza caparra impostata non compare nessuna riga di acconto');
}
const auroraEn = await anybody.get(`/en/beach-clubs/${aurora}`);
check(auroraEn.html.includes('Services at this beach club') && auroraEn.html.includes('Guest reviews'), 'scheda Aurora inglese: servizi e recensioni con il lessico inglese');
check(auroraEn.html.includes('Reply from the beach club') && auroraEn.html.includes('out of 5 · 3 reviews'), 'scheda Aurora inglese: replica e voto medio tradotti');
check(auroraEn.html.includes('Zone Prima fila') || auroraEn.html.includes('Prima fila'), 'scheda Aurora inglese: il nome proprio della zona resta identico');

// ---- 3. Recensioni: chi ha già recensito, il gruppo non concluso, replica e segnalazione (D51) ----
console.log('— Criterio 3: recensioni, replica e segnalazione —');
const reviewer = new Visitor();
check((await reviewer.signIn(reviewerEmail)).endsWith('/area/profilo'), 'recensioni: l\'ospite dimostrativo entra con la password demo');
const reviewerHome = await reviewer.get('/area/profilo');
check(reviewerHome.html.includes('La tua recensione'), 'recensioni: il soggiorno già recensito mostra «La tua recensione», non il modulo');
check(!reviewerHome.html.includes('action="/azioni/conto-recensione"'), 'recensioni: nessun modulo di recensione resta offerto sui soggiorni già recensiti');
const reviewedPanel = reviewerHome.html.split('id="prenotazione-').find((piece) => piece.includes('La tua recensione')) ?? '';
const reviewedGroup = /^([0-9a-f-]{36})"/.exec(reviewedPanel)?.[1] ?? '';
check(reviewedGroup !== '', 'recensioni: il gruppo già recensito si riconosce dalla pagina');
const doubled = await reviewer.post('conto-recensione', { lang: 'it', group: reviewedGroup, rating: '5', body: 'Doppione di collaudo' });
check(doubled.includes('err=review_exists'), 'recensioni: ripetere la recensione dello stesso soggiorno è rifiutato (review_exists)');
check((await reviewer.get(doubled)).html.includes('Hai già recensito questo soggiorno.'), 'recensioni: la pagina lo dice con le parole scritte, «Hai già recensito questo soggiorno.»');

// The manager of the demo accounts also runs Lido Aurora: reply, then flag.
const manager = new Visitor();
check((await manager.signIn(managerEmail)).endsWith('/area/profilo'), 'moderazione: il Gestore dimostrativo entra');
let moderation = await manager.get(`/area/gestione/${aurora}/recensioni`);
check(moderation.status === 200 && moderation.html.includes('Recensioni degli Ospiti'), 'moderazione: la sottopagina «recensioni» dell\'Aurora risponde');
check(moderation.html.includes('Una recensione segnalata resta visibile finché la piattaforma non decide.'), 'moderazione: l\'avvertenza sta sulla pagina PRIMA del bottone');
const replyIds = [...moderation.html.matchAll(/action="\/azioni\/recensione-replica"[^]*?name="recensione" value="([0-9a-f-]{36})"/g)].map((match) => match[1]!);
check(replyIds.length === 3, 'moderazione: ogni recensione ha il suo modulo di replica');
const replyText = `Grazie della visita, torneremo a leggervi. (replica di collaudo ${run})`;
const replied = await manager.post('recensione-replica', { lang: 'it', beach: aurora, recensione: replyIds.at(-1) ?? '', reply: replyText });
check(replied.includes('ok='), `moderazione: la replica è pubblicata (${replied})`);
check((await manager.get(`/area/gestione/${aurora}/recensioni`)).html.includes(replyText), 'moderazione: la replica appena scritta si rilegge nel gestionale');
check((await anybody.get(`/bagni/${aurora}`)).html.includes(replyText), 'moderazione: la replica compare anche sulla scheda pubblica');
const flagIds = [...moderation.html.matchAll(/action="\/azioni\/recensione-segnala"[^]*?name="recensione" value="([0-9a-f-]{36})"/g)].map((match) => match[1]!);
if (flagIds.length > 0) {
  const flagged = await manager.post('recensione-segnala', { lang: 'it', beach: aurora, recensione: flagIds.at(-1) ?? '', reason: 'Collaudo: motivo di prova della segnalazione' });
  check(flagged.includes('ok=1'), `moderazione: la segnalazione con motivo è registrata (${flagged})`);
  moderation = await manager.get(`/area/gestione/${aurora}/recensioni`);
  check(moderation.html.includes('Segnalata il') && moderation.html.includes('Collaudo: motivo di prova della segnalazione'), 'moderazione: data e motivo della segnalazione restano scritti nel gestionale');
} else {
  note('nessuna recensione ancora pubblicata da segnalare: giro ripetuto sullo stesso database, resta la verifica pubblica');
}
const flaggedPublic = await anybody.get(`/bagni/${aurora}`);
check((flaggedPublic.html.match(/<article class="review-card"/g) ?? []).length === 3, 'moderazione: la recensione segnalata RESTA visibile sulla scheda (sono sempre tre)');
check(flaggedPublic.html.includes('Segnalata alla piattaforma.'), 'moderazione: la scheda pubblica porta la nota «Segnalata alla piattaforma.»');
const moderationEn = await manager.get(`/en/account/manage/${aurora}/reviews`);
check(moderationEn.status === 200 && moderationEn.html.includes('Guest reviews') && moderationEn.html.includes('Report to the platform'), 'moderazione: la pagina esiste anche in inglese');

// ---- 4. La caparra di Cala del Moro: riepilogo, pagamento 30%, conto, residuo (D52) ----
console.log('— Criterio 4: caparra su Cala del Moro —');
const calaFrom = addDays(today, 7);
const calaTo = addDays(today, 8);
const calaA = (await freeSpots(cala, calaFrom)).find((spot) => spot.code.startsWith('A'));
const calaA2 = calaA ? (await freeSpots(cala, calaTo)).find((spot) => spot.spotId === calaA.spotId) : undefined;
check(calaA !== undefined && calaA2 !== undefined, `caparra: una postazione di fila A della Cala libera il ${calaFrom} e il ${calaTo}`);
const guest = new Visitor();
let calaCode = '';
if (calaA && calaA2) {
  const calaSummary = await guest.get(`/bagni/${cala}/prenota?spot=${calaA.spotId}&day=${calaFrom}&to=${calaTo}`);
  check(calaSummary.html.includes('Caparra adesso') && calaSummary.html.includes('21,00'), 'caparra: il riepilogo mostra «Caparra adesso» 21,00 (30% di 70,00)');
  check(calaSummary.html.includes('Saldo allo stabilimento') && calaSummary.html.includes('49,00'), 'caparra: il riepilogo mostra «Saldo allo stabilimento» 49,00');
  check(calaSummary.html.includes('Paghi 21,00') && calaSummary.html.includes('li saldi allo stabilimento'), 'caparra: la frase spiega l\'acconto prima di pagare');
  check(calaSummary.html.includes('Condizioni di annullamento') && calaSummary.html.includes('Annullamento gratuito fino a 72 ore prima del giorno di arrivo'), 'condizioni: il testo proprio della Cala (72 ore) sta nel riepilogo PRIMA del pagamento');
  check(calaSummary.html.includes('Annullamento gratuito fino al'), 'condizioni: il termine calcolato per il giorno d\'arrivo è scritto');
  check(calaSummary.html.includes('>Zona<') && calaSummary.html.includes('Prima fila'), 'caparra: anche alla Cala il riepilogo porta la zona con nome');
  const calaSummaryEn = await guest.get(`/en/beach-clubs/${cala}/book?spot=${calaA.spotId}&day=${calaFrom}&to=${calaTo}`);
  check(calaSummaryEn.html.includes('Deposit now') && calaSummaryEn.html.includes('Balance at the beach club'), 'caparra inglese: «Deposit now» e «Balance at the beach club»');
  check(calaSummaryEn.html.includes('Free cancellation up to 72 hours before the arrival day'), 'condizioni inglesi: il testo inglese della Cala è servito sulla pagina inglese');
  const booked = await quickBooking(guest, cala, calaA.spotId, calaFrom, calaTo, guestEmail);
  calaCode = booked.code;
  check(booked.html.includes('Parziale'), 'caparra: la pagina pubblica della prenotazione dice pagamento «Parziale»');
}

// The cart of the Cala shows deposit and terms before «Conferma e paga» (D52, D53).
const cartDay = addDays(today, 9);
const cartSpot = (await freeSpots(cala, cartDay)).find((spot) => spot.code.startsWith('A'));
check(cartSpot !== undefined, `carrello: una postazione di fila A della Cala libera il ${cartDay}`);
if (cartSpot) {
  const shopper = new Visitor();
  check((await shopper.post('carrello-aggiungi', { lang: 'it', beach: cala, spot: cartSpot.spotId, day: cartDay })) === `/bagni/${cala}/carrello`, 'carrello: la voce della Cala si aggiunge');
  const cartView = await shopper.get(`/bagni/${cala}/carrello`);
  check(cartView.html.includes('Caparra adesso') && cartView.html.includes('10,50') && cartView.html.includes('Saldo allo stabilimento') && cartView.html.includes('24,50'), 'carrello: caparra 10,50 e saldo 24,50 sul totale di 35,00');
  check(cartView.html.includes('Annullamento gratuito fino a 72 ore prima del giorno di arrivo'), 'carrello: le condizioni della Cala stanno prima di «Conferma e paga»');
  const conditionsIndex = cartView.html.indexOf('Annullamento gratuito fino a 72 ore');
  const confirmIndex = cartView.html.indexOf('action="/azioni/carrello-conferma"');
  check(conditionsIndex > -1 && confirmIndex > conditionsIndex, 'carrello: il blocco delle condizioni viene PRIMA del modulo «Conferma e paga»');
  check(cartView.html.includes('Zona Prima fila'), 'carrello: la voce porta la zona con nome, con le stesse parole');
}

// ---- 5. Condizioni e annullamento dal conto: entro il termine e oltre (D53) ----
console.log('— Criterio 5: annullamento dal conto —');
const lateDay = addDays(today, 1);
const lateSpot = (await freeSpots(cala, lateDay)).find((spot) => spot.code.startsWith('B')) ?? (await freeSpots(cala, lateDay))[0];
check(lateSpot !== undefined, `annullamento: una postazione della Cala libera domani (${lateDay})`);
let lateCode = '';
if (lateSpot) {
  const booked = await quickBooking(guest, cala, lateSpot.spotId, lateDay, null, guestEmail);
  lateCode = booked.code;
}
// «Entra con Google» on the test provider with the same email: the two stays are relinked.
const avvio = await guest.get('/azioni/oidc-avvio?lang=it');
const consent = await guest.get(avvio.location);
const state = /name="state" value="([^"]+)"/.exec(consent.html)?.[1] ?? '';
await guest.get(await guest.post('oidc-consenso', { lang: 'it', state, email: guestEmail, name: 'Ospite Mercato' }));
const myAccount = await guest.get('/area/profilo');
check(myAccount.status === 200 && myAccount.html.includes(calaCode) && myAccount.html.includes(lateCode), 'conto: le due prenotazioni della Cala sono ricollegate all\'email del conto');
const { groupId: futureGroup, panel: futurePanel } = panelOf(myAccount.html, calaCode);
check(futureGroup !== '', 'conto: il gruppo futuro si riconosce dal pannello');
check(futurePanel.includes('Parziale') && futurePanel.includes('Pagato adesso') && futurePanel.includes('21,00') && futurePanel.includes('residuo 49,00'), 'conto: stato «Parziale», pagato adesso 21,00 e residuo 49,00 (criterio 4)');
check(futurePanel.includes('Zona Prima fila'), 'conto: la zona con nome accompagna la prenotazione anche qui');
check(futurePanel.includes('Annullamento gratuito fino al') && futurePanel.includes(`conferma=${futureGroup}`), 'conto: entro il termine il gesto «Annulla la prenotazione» è offerto col suo termine');
const { groupId: lateGroup, panel: latePanel } = panelOf(myAccount.html, lateCode);
check(lateGroup !== '', 'conto: anche il gruppo di domani si riconosce');
check(latePanel.includes('Il termine per annullare gratis è passato. Rivolgiti allo stabilimento'), 'conto: oltre il termine (72h) la pagina rimanda allo stabilimento');
check(!latePanel.includes(`conferma=${lateGroup}`) && !latePanel.includes('action="/azioni/conto-annulla"'), 'conto: oltre il termine il bottone di annullamento NON c\'è');

// The error path of the review (criterion 3): a stay that is not over yet cannot be reviewed.
const notAllowed = await guest.post('conto-recensione', { lang: 'it', group: futureGroup, rating: '5', body: 'Troppo presto' });
check(notAllowed.includes('err=review_not_allowed'), 'recensioni: recensire un soggiorno futuro è rifiutato (review_not_allowed)');
check((await guest.get(notAllowed)).html.includes('Puoi recensire solo un soggiorno concluso.'), 'recensioni: la pagina spiega «Puoi recensire solo un soggiorno concluso.»');

// The cancellation itself: confirmation step, then the group is cancelled with its refund.
const confirmPage = await guest.get(`/area/profilo?conferma=${futureGroup}`);
check(confirmPage.html.includes('Annullare davvero? Perdi le postazioni e ti rimborsiamo 21,00'), 'annullamento: la conferma dice l\'importo del rimborso (la caparra pagata)');
const cancelled = await guest.get(await guest.post('conto-annulla', { lang: 'it', group: futureGroup, paid: '2100' }));
check(cancelled.html.includes('Prenotazione annullata. Ti rimborsiamo 21,00'), 'annullamento: esito con il rimborso pieno di quanto pagato');
check(panelOf(cancelled.html, calaCode).panel.includes('Annullata'), 'annullamento: il gruppo risulta «Annullata» nel conto');
const freedAgain = await freeSpots(cala, calaFrom);
check(calaA !== undefined && freedAgain.some((spot) => spot.spotId === calaA.spotId), 'annullamento: le giornate annullate tornano in vendita');

// ---- 4bis. Il banco e il registro: caparra all'Aurora, incasso del saldo, quadratura ----
console.log('— Criterio 4 (banco e registro): incasso del saldo e quadratura —');
// Cala del Moro has no demo credentials, by design: the desk collection and the economic
// register are exercised at Lido Aurora, whose manager is the demo account. The suite
// switches the Aurora to the deposit THROUGH THE MANAGER'S OWN FORM, books, pays the 30%,
// restores full payment at once, then collects the balance at the desk and checks the sums.
const depositDay = addDays(today, 6);
const settingsDone = await manager.post('gestione-pagamenti', { lang: 'it', beach: aurora, day: depositDay, mode: 'deposit', percent: '30' });
check(settingsDone.includes('ok=1'), `banco: l'Aurora passa alla caparra dal pannello del Gestore (${settingsDone})`);
const depositSpot = (await freeSpots(aurora, depositDay))[0];
check(depositSpot !== undefined, `banco: una postazione dell'Aurora libera il ${depositDay}`);
let auroraCode = '';
if (depositSpot) {
  const auroraTotal = depositSpot.priceCents;
  const dueNow = Math.round((auroraTotal * 30) / 100);
  const summary = await (new Visitor()).get(`/bagni/${aurora}/prenota?spot=${depositSpot.spotId}&day=${depositDay}`);
  check(summary.html.includes('Caparra adesso'), 'banco: con la caparra accesa il riepilogo dell\'Aurora la mostra');
  const buyer = new Visitor();
  const booked = await quickBooking(buyer, aurora, depositSpot.spotId, depositDay, null, `banco-${run}@example.org`);
  auroraCode = booked.code;
  // Back to full payment at once: the demo showcase keeps its usual setting.
  const restored = await manager.post('gestione-pagamenti', { lang: 'it', beach: aurora, day: depositDay, mode: 'full', percent: '30' });
  check(restored.includes('ok=1'), 'banco: l\'Aurora torna subito al pagamento intero');
  const collectPage = await manager.get(`/area/gestione/${aurora}/incassi?code=${auroraCode}`);
  const residualEuro = ((auroraTotal - dueNow) / 100).toFixed(2).replace('.', ',');
  check(collectPage.html.includes('Parziale') && collectPage.html.includes(residualEuro), `banco: la scheda incassi mostra «Parziale» col residuo ${residualEuro}`);
  const collected = await manager.post('banco-incassa', { lang: 'it', beach: aurora, code: auroraCode, amount: residualEuro });
  check(collected.includes('ok='), `banco: il saldo è incassato al banco (${collected})`);
  const after = await manager.get(`/area/gestione/${aurora}/incassi?code=${auroraCode}`);
  check(after.html.includes('Saldata') && after.html.includes('0,00'), 'banco: dopo l\'incasso la prenotazione è «Saldata», residuo 0,00');
}
// The economic register balances: the sum of the allocations equals the gross of the sales.
const signedIn = await api('POST', '/v1/auth/login', { email: managerEmail, password });
check(signedIn.status === 200, 'registro: il Gestore entra anche dall\'API');
const bearer = { Authorization: `Bearer ${String(signedIn.body.token)}` };
const report = await api('GET', `/v1/manage/beaches/${aurora}/reports/summary?from=${addDays(today, -5)}&to=${addDays(today, 25)}`, undefined, bearer);
check(report.status === 200, 'registro: il riepilogo economico dell\'Aurora risponde');
const summaryBody = report.body as unknown as { grossCents: { shared: number; ordinary: number }; byParty: Record<string, { expected: number; accrued: number; other: number }> };
const gross = summaryBody.grossCents.shared + summaryBody.grossCents.ordinary;
const allocated = Object.values(summaryBody.byParty).reduce((sum, part) => sum + part.expected + part.accrued + part.other, 0);
check(gross > 0 && allocated === gross, `registro: somma delle ripartizioni ${allocated} = lordo delle vendite ${gross} (caparra compresa: le quote restano sul totale)`);

// ---- 6. «Niente profilazione»: piè di pagina e Assistenza, it e en (D54) ----
console.log('— Criterio 6: niente profilazione —');
const home = await anybody.get('/');
check(home.html.includes('Niente cookie di profilazione né pubblicità: solo cookie tecnici, per sessione, carrello e lingua.'), 'piè di pagina: la riga «Niente cookie di profilazione» sta sulla home');
const homeEn = await anybody.get('/en');
check(homeEn.html.includes('No profiling cookies and no advertising: only technical cookies, for your session, cart and language.'), 'piè di pagina: la riga inglese sta sulla home inglese');
const help = await anybody.get('/assistenza');
check(help.html.includes('Ombrè mi traccia o mi mostra pubblicità?'), 'assistenza: la domanda nuova delle FAQ c\'è');
check(help.html.includes('Per questo non vedi nessun banner dei cookie.'), 'assistenza: la risposta spiega anche l\'assenza del banner');
const helpEn = await anybody.get('/en/help');
check(helpEn.html.includes('Does Ombrè track me or show ads?') && helpEn.html.includes('That is why you see no cookie banner.'), 'assistenza inglese: domanda e risposta tradotte');

// ---- 7. La prenotazione rapida della Dune è INVARIATA: nessuna caparra (criterio 7) ----
console.log('— Criterio 7: Bagno delle Dune invariato —');
const duneDay = '2027-06-17';
const duneSpot = (await freeSpots(dune, duneDay))[0];
check(duneSpot !== undefined, `Dune: una postazione libera il ${duneDay} (il giorno del seme demo)`);
if (duneSpot) {
  const duneSummary = await anybody.get(`/bagni/${dune}/prenota?spot=${duneSpot.spotId}&day=${duneDay}`);
  check(duneSummary.html.includes('action="/azioni/riserva"') && duneSummary.html.includes('Riserva la postazione'), 'Dune: il percorso rapido è offerto come prima');
  check(!duneSummary.html.includes('Caparra adesso') && !duneSummary.html.includes('li saldi allo stabilimento'), 'Dune: il riepilogo NON mostra caparra (pagamento intero, come prima)');
  check(duneSummary.html.includes('Condizioni di annullamento') && duneSummary.html.includes('fino a 48 ore prima'), 'Dune: valgono il blocco delle condizioni e il predefinito di piattaforma (48 ore)');
}

// ---- 8. Conto in inglese: le pagine toccate rispondono anche in en (criterio 8) ----
console.log('— Criterio 8: inglese —');
const myAccountEn = await guest.get('/en/account/overview');
check(myAccountEn.status === 200 && myAccountEn.html.includes('Cancelled') && myAccountEn.html.includes('Zone Prima fila'), 'conto inglese: stati e zona con nome anche in inglese');
const emptyCartEn = await (new Visitor()).get(`/en/beach-clubs/${cala}/cart`);
check(emptyCartEn.status === 200 && emptyCartEn.html.includes('The cart is empty'), 'carrello inglese: la pagina della Cala risponde anche vuota');

if (failures.length > 0) {
  console.error(`${failures.length} of ${checks} checks failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`All ${checks} checks passed on ${base}: filtri per servizi, zone con nome, recensioni con replica e segnalazione, caparra ${calaCode} con annullamento rimborsato, saldo incassato su ${auroraCode}, registro in quadratura.`);
