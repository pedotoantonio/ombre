// Walks «La scheda della postazione» (D61–D63) on the running stack, as a browser
// without scripts, it and en: the card reached from the REAL links of the pages
// (panel, list, selection bar, summary, hold, cart) with the exact «torna» return;
// the platform default card of a Bagno delle Dune type with the editor's exact text
// and the registered photograph; the customization from the manager's «Postazioni»
// sub-page (form, preview identical to the public page, reset with confirmation,
// API refusals for pictures outside the library and for seven of them); the visible
// difference between the curated Aurora and the default Dune; the licence register
// of the eleven type photographs; and a light «nothing broke» pass on quick booking,
// cart and planner. What the suite saves it resets (the custom card ends default);
// the one hold it takes on the Aurora expires on its own and the day belongs to no
// later suite, so smoke:booking, smoke:api and smoke:2fa stay safe.
// Needs OMBRE_SEED_DEMO=true, OMBRE_SEED_SHOWCASE=true and OMBRE_DEMO_PASSWORD.
// Usage: node scripts/smoke-schede.ts [site address] [API address]
//        (defaults http://127.0.0.1:3210 and http://127.0.0.1:3211)
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const base = (process.argv[2] ?? 'http://127.0.0.1:3210').replace(/\/+$/, '');
const apiBase = (process.argv[3] ?? 'http://127.0.0.1:3211').replace(/\/+$/, '');
const password = process.env.OMBRE_DEMO_PASSWORD ?? '';
const aurora = 'lido-aurora';
const dune = 'bagno-delle-dune';
const managerEmail = 'gestore@bagnodelledune.example';
const failures: string[] = [];
let checks = 0;

/** Every check is numbered and printed as it runs, so a red run names its exact step. */
function check(condition: boolean, message: string): void {
  checks += 1;
  console.log(`  ${String(checks).padStart(3)}. ${condition ? 'ok ' : 'NO '} ${message}`);
  if (!condition) failures.push(`${checks}. ${message}`);
}

/** Days are computed in the clubs' zone: the stack lives in Europe/Rome. */
function todayInRome(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
}

function addDays(day: string, amount: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

const today = todayInRome();
// Un giorno pubblicato dal seme della vetrina, lo stesso che usa smoke-spiaggia.
const publicDay = addDays(today, 3);

/**
 * The entities React escapes and the comment markers it leaves between adjacent
 * text nodes are undone once here, so every exact-phrase check reads plain text.
 */
function plain(html: string): string {
  return html.replaceAll('<!-- -->', '').replaceAll('&#x27;', "'").replaceAll('&#39;', "'").replaceAll('&quot;', '"').replaceAll('&amp;', '&');
}

/** A visitor with its own cookie jar, exactly like the one of smoke-conto and smoke-spiaggia. */
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
    return { status: response.status, html: plain(await response.text()), location: response.headers.get('location') ?? '' };
  }

  /** Posts a form; list values repeat the field, like the checkboxes of a real form. */
  async post(action: string, fields: Record<string, string | string[]>): Promise<string> {
    const body = new URLSearchParams();
    for (const [name, value] of Object.entries(fields)) {
      for (const entry of Array.isArray(value) ? value : [value]) body.append(name, entry);
    }
    const response = await fetch(`${base}/azioni/${action}`, {
      method: 'POST',
      redirect: 'manual',
      headers: this.headers({ 'Content-Type': 'application/x-www-form-urlencoded', Origin: base, 'X-Forwarded-For': '198.51.100.12' }),
      body: body.toString(),
    });
    this.absorb(response);
    return response.headers.get('location') ?? `status ${response.status}`;
  }

  async signIn(email: string, secret = password): Promise<string> {
    return this.post('accesso', { lang: 'it', email, password: secret });
  }
}

/** Plain JSON calls against the API: types, cards, holds and the light regression pass. */
async function api(method: string, path: string, payload?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(apiBase + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '198.51.100.12', ...headers },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  const text = await response.text();
  return { status: response.status, body: (text ? JSON.parse(text) : {}) as Record<string, unknown> };
}

interface PublicType {
  typeId: string;
  name: string;
  mark: string;
  customized: boolean;
}

async function typesOf(slug: string): Promise<PublicType[]> {
  const result = await api('GET', `/v1/beaches/${slug}/spot-types`);
  return ((result.body.types as PublicType[] | undefined) ?? []);
}

type Locale = 'it' | 'en';
const beachPath = (locale: Locale, slug: string) => (locale === 'en' ? `/en/beach-clubs/${slug}` : `/bagni/${slug}`);
const cardSegment: Record<Locale, string> = { it: 'postazioni', en: 'spot-types' };
const backLabel: Record<Locale, string> = { it: 'Torna a dove eri', en: 'Back to where you were' };

/** The card links a page REALLY carries: address and decoded «torna», never built by hand. */
function cardLinks(html: string, locale: Locale, slug: string): { href: string; torna: string }[] {
  const re = new RegExp(`href="(${beachPath(locale, slug).replaceAll('/', '\\/')}\\/${cardSegment[locale]}\\/[0-9a-f-]{36}\\?torna=([^"&]+))"`, 'g');
  return [...html.matchAll(re)].map((match) => ({ href: match[1]!, torna: decodeURIComponent(match[2]!) }));
}

/**
 * Follows one REAL entry link: opens the entry page, finds the card link whose
 * «torna» is EXACTLY the starting page (query and anchor included), opens the card
 * from that very link, reads the back button, and goes back to the starting page.
 */
async function entryToCard(visitor: Visitor, locale: Locale, slug: string, entry: string, anchor: string | null, what: string, expectOnReturn?: string): Promise<string> {
  const want = anchor ? `${entry}#${anchor}` : entry;
  const page = await visitor.get(entry);
  check(page.status === 200, `${what}: la pagina d'ingresso risponde (${entry})`);
  const link = cardLinks(page.html, locale, slug).find((candidate) => candidate.torna === want);
  check(link !== undefined, `${what}: il collegamento vero alla scheda porta il ritorno esatto (${want})`);
  if (!link) return '';
  const card = await visitor.get(link.href);
  check(card.status === 200 && card.html.includes('site-gallery type-photos'), `${what}: la scheda si apre dal collegamento e mostra le fotografie`);
  check(card.html.includes(`href="${want}"`) && card.html.includes(backLabel[locale]), `${what}: in fondo «${backLabel[locale]}» punta ESATTAMENTE a ${want}`);
  const again = await visitor.get(entry);
  const anchorOk = anchor === null || again.html.includes(`id="${anchor}"`);
  const contentOk = expectOnReturn === undefined || again.html.includes(expectOnReturn);
  check(again.status === 200 && anchorOk && contentOk, `${what}: il ritorno riapre la pagina di partenza${anchor ? ` con l'àncora «${anchor}»` : ''}`);
  return card.html;
}

/**
 * The body of a rendered card, read field by field from the SAME markup the public
 * page and the manager's preview share (TypeCardView): photographs with alt and
 * caption, description, the equipment line, the note under it, the tip, the details
 * and the «Scheda del lido» notice. Comparing two bodies compares the whole card.
 */
function cardBody(html: string): Record<string, unknown> {
  const galleryStart = html.indexOf('site-gallery type-photos');
  if (galleryStart < 0) return { missing: true };
  const galleryEnd = html.indexOf('</ul>', galleryStart);
  const gallery = html.slice(galleryStart, galleryEnd);
  const after = html.slice(galleryEnd);
  const detailsBlock = after.includes('</dl>') ? after.slice(0, after.indexOf('</dl>') + 5) : '';
  return {
    clubNote: html.slice(Math.max(0, galleryStart - 600), galleryStart).includes('class="type-note"'),
    photos: [...gallery.matchAll(/<img src="([^"]+)" alt="([^"]*)"/g)].map((match) => ({ src: match[1], alt: match[2] })),
    captions: [...gallery.matchAll(/<figcaption>([^<]*)<\/figcaption>/g)].map((match) => match[1]),
    description: /<p class="prose">([^<]+)<\/p>/.exec(after)?.[1] ?? '',
    equipment: /<strong>([^<]+)<\/strong>/.exec(after)?.[1] ?? '',
    note: /<p class="prose type-note">([^<]+)<\/p>/.exec(after)?.[1] ?? '',
    details: [...detailsBlock.matchAll(/<dt>([^<]*)<\/dt>\s*<dd>([^<]*)<\/dd>/g)].map((match) => [match[1], match[2]]),
  };
}

if (!password) {
  console.error('Set OMBRE_DEMO_PASSWORD to the value the stack was started with.');
  process.exit(1);
}

// ---- Preparazione: gestore dal sito e dall'API, tipi dei due lidi, terreno pulito ----
const anybody = new Visitor();
const manager = new Visitor();
check((await manager.signIn(managerEmail)).endsWith('/area/profilo'), 'preparazione: il Gestore dimostrativo entra dal sito');
const signedIn = await api('POST', '/v1/auth/login', { email: managerEmail, password });
check(signedIn.status === 200, 'preparazione: il Gestore entra anche dall\'API');
const bearer = { Authorization: `Bearer ${String(signedIn.body.token)}` };
const duneTypes = await typesOf(dune);
const duneUmbrella = duneTypes.find((type) => type.mark === 'umbrella');
check(duneUmbrella !== undefined, 'preparazione: la Dune offre il tipo Ombrellone al pubblico');
// Il Lettino singolo della Dune non ha postazioni in vendita: sta nell'elenco del
// gestore ma non in quello pubblico, e la sua scheda resta raggiungibile per indirizzo.
const duneManagerTypes = await api('GET', `/v1/manage/beaches/${dune}/type-cards`, undefined, bearer);
const duneSunbed = ((duneManagerTypes.body.types as PublicType[] | undefined) ?? []).find((type) => type.mark === 'sunbed');
check(duneSunbed !== undefined && duneSunbed.name === 'Lettino singolo', 'preparazione: il gestionale elenca anche il Lettino singolo, senza postazioni in vendita');
// Il tipo che il collaudo personalizza parte predefinito anche dopo un giro interrotto.
if (duneUmbrella) {
  const cleaned = await api('DELETE', `/v1/manage/beaches/${dune}/type-cards/${duneUmbrella.typeId}`, undefined, bearer);
  check(cleaned.status === 204, 'preparazione: la scheda dell\'Ombrellone della Dune parte predefinita');
}
const auroraTypes = await typesOf(aurora);
const auroraUmbrella = auroraTypes.find((type) => type.mark === 'umbrella');
check(auroraUmbrella !== undefined && auroraUmbrella.customized, 'preparazione: nel seme l\'Ombrellone dell\'Aurora ha la scheda personalizzata');
const avail = await api('GET', `/v1/beaches/${aurora}/availability?day=${publicDay}`);
const freeSpots = ((avail.body.spots as { spotId: string }[] | undefined) ?? []).map((spot) => spot.spotId);
check(freeSpots.length >= 3, `preparazione: l'Aurora ha postazioni libere il ${publicDay} (${freeSpots.length})`);
const [spotBar, spotHold, spotCart] = freeSpots;

// ---- Criterio 2: la predefinita della Dune, testo del redattore e foto registrata ----
console.log('— Criterio 2: la scheda predefinita esiste comunque, onesta e fotografata —');
const umbrellaCardPath = `/bagni/${dune}/${cardSegment.it}/${duneUmbrella!.typeId}`;
const defaultIt = await anybody.get(umbrellaCardPath);
check(defaultIt.status === 200, 'predefinita: la scheda dell\'Ombrellone della Dune risponde');
check(/<h1[^>]*>Ombrellone<\/h1>/.test(defaultIt.html), 'predefinita: il titolo è il nome del tipo («Ombrellone»)');
check(
  defaultIt.html.includes('Una postazione con un ombrellone, che fa ombra a chi sta sotto. È la stessa per tutta la prenotazione, anche se scegli un periodo di più giornate.'),
  'predefinita: la descrizione è la frase ESATTA del redattore (testi-schede-tipi.md)',
);
check(defaultIt.html.includes('Di norma un ombrellone con lettini o sdraio, come indicato nella dotazione della postazione.'), 'predefinita: la nota di dotazione vagliata, parola per parola');
check(defaultIt.html.includes('src="/demo/tipi/umbrella.jpg"'), 'predefinita: la fotografia è quella di repertorio /demo/tipi/umbrella.jpg');
check(!defaultIt.html.includes('Scheda del lido'), 'predefinita: NESSUNA nota «Scheda del lido» (la predefinita non si vanta)');
check(defaultIt.html.includes(`href="${beachPath('it', dune)}"`) && defaultIt.html.includes('Torna alla scheda del lido'), 'predefinita: senza «torna» il ritorno è la scheda del lido');
const defaultEn = await anybody.get(`/en/beach-clubs/${dune}/${cardSegment.en}/${duneUmbrella!.typeId}`);
check(defaultEn.status === 200 && /<h1[^>]*>Ombrellone<\/h1>/.test(defaultEn.html), 'predefinita inglese: stessa scheda su /en/…/spot-types con il nome del tipo');
check(
  defaultEn.html.includes('A spot with an umbrella, giving shade to those underneath. It is the same spot for the whole booking, even if you choose a period of several days.'),
  'predefinita inglese: la descrizione ESATTA del redattore in inglese',
);
check(!defaultEn.html.includes('The beach club\'s card'), 'predefinita inglese: nessuna nota del lido nemmeno in inglese');

// ---- Criterio 5: le undici fotografie servite e registrate in immagini-reali.md ----
console.log('— Criterio 5: foto servite e registro delle licenze —');
const marks = ['umbrella', 'sunbed', 'deckchair', 'gazebo', 'tent', 'daybed', 'canopy', 'canoe', 'sup', 'pedalo', 'jetski'] as const;
for (const mark of marks) {
  const photo = await fetch(`${base}/demo/tipi/${mark}.jpg`);
  check(photo.status === 200 && (photo.headers.get('content-type') ?? '').startsWith('image/'), `foto: /demo/tipi/${mark}.jpg è servita come immagine (HTTP ${photo.status})`);
  await photo.arrayBuffer();
}
const register = readFileSync(join(import.meta.dirname, '..', 'docs', 'immagini-reali.md'), 'utf8');
for (const mark of marks) {
  const row = register.split('\n').find((line) => line.includes(`\`tipi/${mark}.jpg\``));
  check(row !== undefined && /\]\(https?:\/\//.test(row) && row.includes('License'), `registro: immagini-reali.md registra tipi/${mark}.jpg con fonte e licenza`);
}

// ---- Criterio 1: la scheda raggiunta dai collegamenti VERI, col ritorno esatto ----
console.log('— Criterio 1: gli ingressi dell\'Aurora, in italiano —');
await entryToCard(anybody, 'it', aurora, `/bagni/${aurora}?day=${publicDay}`, 'tipi-postazione', 'riquadro «I tipi di postazione»');
const listPage = await anybody.get(`/bagni/${aurora}?day=${publicDay}`);
check(listPage.html.includes('Vedi la scheda'), 'elenco: le postazioni libere portano «Vedi la scheda» col nome del tipo');
await entryToCard(anybody, 'it', aurora, `/bagni/${aurora}?day=${publicDay}`, 'elenco', 'elenco delle postazioni');
await entryToCard(anybody, 'it', aurora, `/bagni/${aurora}?day=${publicDay}&spot=${spotBar}`, 'scelta', 'barra di selezione');
await entryToCard(anybody, 'it', aurora, `/bagni/${aurora}/prenota?spot=${spotBar}&day=${publicDay}`, null, 'riepilogo prima di pagare', 'Tipo di postazione');
const held = await api('POST', '/v1/holds', { beachSlug: aurora, spotId: spotHold, day: publicDay }, { 'Idempotency-Key': `schede-${randomUUID()}` });
check(held.status === 201, `riserva: una riserva di prova sull'Aurora per il ${publicDay} riesce`);
const holdId = String(held.body.holdId ?? '');
await entryToCard(anybody, 'it', aurora, `/bagni/${aurora}/riserva/${holdId}`, null, 'pagina della riserva', 'Riserva attiva');
// Il carrello: una voce vera, aggiunta dal modulo della pagina, poi tolta a fine giro.
const shopper = new Visitor();
check((await shopper.post('carrello-aggiungi', { lang: 'it', beach: aurora, spot: spotCart!, day: publicDay })) === `/bagni/${aurora}/carrello`, 'carrello: la voce di prova si aggiunge dal modulo');
const cartView = await shopper.get(`/bagni/${aurora}/carrello`);
const cartId = /name="cart" value="([0-9a-f-]{36})"/.exec(cartView.html)?.[1] ?? '';
const itemId = /name="item" value="([0-9a-f-]{36})"/.exec(cartView.html)?.[1] ?? '';
check(cartId !== '' && itemId !== '', 'carrello: la pagina porta carrello e voce');
await entryToCard(shopper, 'it', aurora, `/bagni/${aurora}/carrello`, `voce-${itemId}`, 'voce del carrello');

console.log('— Criterio 7: gli stessi ingressi, speculari in inglese —');
await entryToCard(anybody, 'en', aurora, `/en/beach-clubs/${aurora}?day=${publicDay}`, 'tipi-postazione', 'riquadro inglese («Spot types»)');
const listPageEn = await anybody.get(`/en/beach-clubs/${aurora}?day=${publicDay}`);
check(listPageEn.html.includes('See the card'), 'elenco inglese: «See the card» accanto ai tipi');
await entryToCard(anybody, 'en', aurora, `/en/beach-clubs/${aurora}?day=${publicDay}`, 'elenco', 'elenco inglese');
await entryToCard(anybody, 'en', aurora, `/en/beach-clubs/${aurora}?day=${publicDay}&spot=${spotBar}`, 'scelta', 'barra inglese');
await entryToCard(anybody, 'en', aurora, `/en/beach-clubs/${aurora}/book?spot=${spotBar}&day=${publicDay}`, null, 'riepilogo inglese', 'Spot type');
await entryToCard(anybody, 'en', aurora, `/en/beach-clubs/${aurora}/hold/${holdId}`, null, 'riserva inglese', 'Hold active');
await entryToCard(shopper, 'en', aurora, `/en/beach-clubs/${aurora}/cart`, `voce-${itemId}`, 'carrello inglese');
// Pulizia del carrello: la voce di prova se ne va e il carrello resta come prima.
check((await shopper.post('carrello-rimuovi', { lang: 'it', beach: aurora, cart: cartId, item: itemId })).includes('ok=1'), 'carrello: la voce di prova si toglie');

// ---- Criterio 4: la differenza Aurora/Dune si vede a occhio ----
console.log('— Criterio 4: Aurora personalizzata, Dune predefinita —');
const auroraCard = await anybody.get(`/bagni/${aurora}/${cardSegment.it}/${auroraUmbrella!.typeId}`);
check(auroraCard.status === 200 && /<h1[^>]*>Gli ombrelloni dell'Aurora<\/h1>/.test(auroraCard.html), 'Aurora: la scheda dell\'ombrellone porta il titolo proprio del lido');
check(auroraCard.html.includes('Scheda del lido'), 'Aurora: la nota sobria «Scheda del lido» dichiara la cura');
const auroraBody = cardBody(auroraCard.html);
check((auroraBody.photos as unknown[]).length >= 2, `Aurora: la galleria ha più foto (${(auroraBody.photos as unknown[]).length})`);
check((auroraBody.captions as string[]).includes('Un ombrellone della prima fila'), 'Aurora: le didascalie del seme sono mostrate');
check((auroraBody.details as string[][]).some((pair) => pair[0] === 'Distanza tra le file'), 'Aurora: i dettagli etichetta/valore del seme ci sono');
const auroraCardEn = await anybody.get(`/en/beach-clubs/${aurora}/${cardSegment.en}/${auroraUmbrella!.typeId}`);
check(auroraCardEn.html.includes('The beach club\'s card') && cardBody(auroraCardEn.html).captions !== undefined && (cardBody(auroraCardEn.html).captions as string[]).includes('An umbrella in the first row'), 'Aurora inglese: nota del lido e didascalie inglesi');
const duneBody = cardBody(defaultIt.html);
check((duneBody.photos as unknown[]).length === 1 && duneBody.clubNote === false && (duneBody.details as unknown[]).length === 0, 'Dune: una foto di repertorio, nessuna nota del lido, nessun dettaglio: la differenza si vede');

// ---- Criterio 3: personalizzare dal gestionale, anteprima identica, ripristino ----
console.log('— Criterio 3: la sottopagina «Postazioni» del gestionale della Dune —');
const managePath = `/area/gestione/${dune}/postazioni`;
const manageList = await manager.get(managePath);
check(manageList.status === 200 && /<h1[^>]*>Postazioni di Bagno delle Dune<\/h1>/.test(manageList.html), 'gestionale: la sottopagina «Postazioni» risponde con il suo titolo');
check(manageList.html.includes('Predefinita di Ombrè') && manageList.html.includes('Modifica') && manageList.html.includes('Vedi l\'anteprima'), 'gestionale: l\'elenco dei tipi dice lo stato e offre modifica e anteprima');
check(manageList.html.includes('Senza postazioni in vendita il tipo non compare al pubblico; la scheda resta pronta.'), 'gestionale: il Lettino singolo senza postazioni resta in elenco con la sua nota');
const manageListEn = await manager.get(`/en/account/manage/${dune}/spot-types`);
check(manageListEn.status === 200 && /<h1[^>]*>Spot types of Bagno delle Dune<\/h1>/.test(manageListEn.html) && manageListEn.html.includes('Ombrè default'), 'gestionale inglese: la stessa sottopagina su /spot-types');
const curatedId = duneUmbrella!.typeId;
const formPage = await manager.get(`${managePath}?tipo=${curatedId}`);
check(formPage.html.includes('action="/azioni/tipo-scheda-salva"') && formPage.html.includes('Scheda di Ombrellone'), 'gestionale: il modulo di modifica dell\'Ombrellone si apre');
check(formPage.html.includes('name="photos" value="tipo-sunbed"'), 'gestionale: le foto si scelgono dalla libreria del sito (caselle, non indirizzi)');
const savedTo = await manager.post('tipo-scheda-salva', {
  lang: 'it',
  beach: dune,
  type: curatedId,
  title: 'Gli ombrelloni del collaudo',
  description_it: 'Dieci ombrelloni sulla sabbia fine, descritti dal collaudo notturno.',
  description_en: 'Ten umbrellas on fine sand, described by the acceptance run.',
  photos: ['tipo-sunbed', 'riva'],
  'caption_it_tipo-sunbed': 'Un lettino davanti al mare (collaudo)',
  'caption_en_tipo-sunbed': 'A sunbed facing the sea (test)',
  equipment_it: 'Di norma un ombrellone del collaudo, con il suo telo.',
  capacity_it: 'Controlla la capienza prima di prenotare (collaudo).',
  detail_label_it_1: 'Telo mare',
  detail_value_it_1: 'A noleggio al chiosco',
});
check(savedTo.includes('ok=1') && savedTo.includes('#scheda'), 'salvataggio: titolo, foto, note e dettaglio passano dal modulo senza JavaScript');
const manageAfter = await manager.get(managePath);
check(manageAfter.html.includes('>Personalizzata<'), 'salvataggio: lo stato del tipo passa a «Personalizzata»');
check(manageAfter.html.includes('Torna alla predefinita'), 'salvataggio: compare «Torna alla predefinita» accanto al tipo curato');
// L'anteprima è IDENTICA al pubblico: stesso componente, stesso corpo, campo per campo.
const preview = await manager.get(`${managePath}?anteprima=${curatedId}`);
check(preview.html.includes('Anteprima: Ombrellone') && preview.html.includes('Identica alla pagina pubblica: stesso componente, stessi dati salvati.'), 'anteprima: il pannello si apre e si dichiara');
const publicCustom = await anybody.get(`/bagni/${dune}/${cardSegment.it}/${curatedId}`);
check(publicCustom.status === 200 && /<h1[^>]*>Gli ombrelloni del collaudo<\/h1>/.test(publicCustom.html), 'pubblico: la scheda salvata è subito sulla pagina pubblica col titolo nuovo');
const previewTitle = /id="anteprima"[\s\S]*?<h3>([^<]+)<\/h3>/.exec(preview.html)?.[1] ?? '';
check(previewTitle === 'Gli ombrelloni del collaudo', `anteprima: lo stesso titolo del pubblico («${previewTitle}»)`);
check(JSON.stringify(cardBody(preview.html)) === JSON.stringify(cardBody(publicCustom.html)), 'anteprima: il corpo della scheda è IDENTICO al pubblico, foto, testi, note e dettagli');
check(publicCustom.html.includes('Scheda del lido') && publicCustom.html.includes('src="/demo/riva.jpg"') && publicCustom.html.includes('Un lettino davanti al mare (collaudo)'), 'pubblico: nota del lido, seconda foto della libreria e didascalia');
check(publicCustom.html.includes('Di norma un ombrellone del collaudo, con il suo telo.'), 'pubblico: la nota di dotazione personalizzata sostituisce la predefinita, campo per campo');
// I rifiuti dell'API: foto fuori repertorio e sette foto; la scheda salvata non si muove.
const outside = await api('PUT', `/v1/manage/beaches/${dune}/type-cards/${curatedId}`, { content: { photos: [{ id: 'foto-fuori-repertorio' }] } }, bearer);
check(outside.status === 409 && (outside.body.error as { code?: string } | undefined)?.code === 'invalid_state', 'API: una foto fuori dalla libreria è rifiutata (409 invalid_state)');
const seven = await api('PUT', `/v1/manage/beaches/${dune}/type-cards/${curatedId}`, { content: { photos: Array.from({ length: 7 }, () => ({ id: 'riva' })) } }, bearer);
check(seven.status === 400, 'API: sette fotografie sono rifiutate (massimo 6, 400)');
check(/<h1[^>]*>Gli ombrelloni del collaudo<\/h1>/.test((await anybody.get(`/bagni/${dune}/${cardSegment.it}/${curatedId}`)).html), 'API: dopo i rifiuti la scheda salvata è intatta');
// Il ripristino chiede conferma sulla stessa pagina, senza JavaScript, poi torna predefinita.
const confirmPage = await manager.get(`${managePath}?ripristina=${curatedId}`);
check(confirmPage.html.includes('Confermi il ripristino della scheda di Ombrellone? I testi, le foto e i dettagli personalizzati si perdono.'), 'ripristino: la conferma dice che cosa si perde');
check(confirmPage.html.includes('Sì, torna alla predefinita') && confirmPage.html.includes('action="/azioni/tipo-scheda-ripristina"'), 'ripristino: conferma e annulla sono moduli e collegamenti, senza JavaScript');
const resetTo = await manager.post('tipo-scheda-ripristina', { lang: 'it', beach: dune, type: curatedId });
check(resetTo.includes('ok='), 'ripristino: il modulo di conferma riporta alla sottopagina con l\'esito');
const manageReset = await manager.get(resetTo);
check(manageReset.html.includes('Scheda riportata alla predefinita.') && !manageReset.html.includes('>Personalizzata<'), 'ripristino: l\'esito è detto e lo stato torna predefinito');
const publicReset = await anybody.get(`/bagni/${dune}/${cardSegment.it}/${curatedId}`);
check(/<h1[^>]*>Ombrellone<\/h1>/.test(publicReset.html) && publicReset.html.includes('Una postazione con un ombrellone, che fa ombra a chi sta sotto.'), 'ripristino: il pubblico torna alla predefinita del redattore');
check(!publicReset.html.includes('Scheda del lido') && publicReset.html.includes('src="/demo/tipi/umbrella.jpg"'), 'ripristino: niente nota del lido, di nuovo la foto di repertorio');

// ---- Criterio 6: niente rotture — prenotazione rapida, carrello, pianificatore ----
console.log('— Criterio 6: i percorsi di prima rispondono come prima —');
const duneAvail = await api('GET', `/v1/beaches/${dune}/availability?day=2027-06-17`);
const duneFree = ((duneAvail.body.spots as { spotId: string }[] | undefined) ?? []);
check(duneAvail.status === 200 && duneFree.length > 0, 'prenotazione rapida: il giorno del seme della Dune è ancora in vendita per le suite che seguono');
const quickSummary = await anybody.get(`/bagni/${dune}/prenota?spot=${duneFree[0]!.spotId}&day=2027-06-17`);
check(quickSummary.status === 200 && quickSummary.html.includes('Tipo di postazione'), 'prenotazione rapida: il riepilogo della Dune risponde, col tipo in collegamento');
check((await shopper.get(`/bagni/${aurora}/carrello`)).html.includes('Il carrello è vuoto'), 'carrello: dopo la pulizia il carrello dell\'Aurora è di nuovo vuoto');
const plannerPage = await manager.get(`/area/gestione/${dune}/spiaggia`);
check(plannerPage.status === 200 && plannerPage.html.includes('La bozza della spiaggia'), 'pianificatore: la pagina della spiaggia della Dune risponde col pannello della bozza');
const duneDraft = await api('GET', `/v1/manage/beaches/${dune}/layout/draft`, undefined, bearer);
check(duneDraft.status === 200 && ((duneDraft.body.ops as unknown[] | undefined) ?? []).length === 0, 'pianificatore: la bozza del gestore della Dune è vuota, come prima');

if (failures.length > 0) {
  console.error(`${failures.length} of ${checks} checks failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(
  `All ${checks} checks passed on ${base}: la scheda del tipo raggiunta dai collegamenti veri (riquadro, elenco, barra, riepilogo, riserva, carrello) col ritorno esatto, it e en; predefinita della Dune con i testi del redattore e la foto registrata; personalizzazione dal gestionale con anteprima identica al pubblico, rifiuti dell'API e ripristino confermato; Aurora e Dune distinguibili a occhio; le undici foto servite e registrate; prenotazione rapida, carrello e pianificatore come prima.`,
);
