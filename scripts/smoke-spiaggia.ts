// Walks «La spiaggia illustrata e il pianificatore» (D55–D60) on the running stack, as a
// browser without scripts, it and en: the beach-art drawing on the public maps, the console
// and the account passes; the colour+glyph legend identical in the two languages with the
// maintenance state; the planner draft of the manager (single spot, grid with automatic
// numbering, move with the same identity, edits, refusals with the culprit's index, scenery)
// with its word-by-word summary, the layout.saved audit read from the database like the db
// tests do, and the 390 px discipline checked on the served markup and CSS.
// What the suite creates stays where harmless (the acceptance stack lives for testing): its
// spots are never published beyond the one booked day, so the suites that run after are safe.
// Needs OMBRE_SEED_DEMO=true, OMBRE_SEED_SHOWCASE=true, OMBRE_DEMO_PASSWORD and
// OMBRE_SANDBOX_WEBHOOK_SECRET. The audit trail is read through docker compose
// (project ombre-collaudo, or OMBRE_COLLAUDO_PSQL for another command).
// Usage: node scripts/smoke-spiaggia.ts [site address] [API address]
//        (defaults http://127.0.0.1:3210 and http://127.0.0.1:3211)
import { createHmac, randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';

const base = (process.argv[2] ?? 'http://127.0.0.1:3210').replace(/\/+$/, '');
const apiBase = (process.argv[3] ?? 'http://127.0.0.1:3211').replace(/\/+$/, '');
const password = process.env.OMBRE_DEMO_PASSWORD ?? '';
const webhookSecret = process.env.OMBRE_SANDBOX_WEBHOOK_SECRET ?? '';
const psqlCommand = process.env.OMBRE_COLLAUDO_PSQL ?? 'docker compose -p ombre-collaudo exec -T db psql -At -U ombre_owner -d ombre -c';
const aurora = 'lido-aurora';
const cala = 'cala-del-moro';
const dune = 'bagno-delle-dune';
const managerEmail = 'gestore@bagnodelledune.example';
const run = Date.now().toString(36).toUpperCase();
// Un prefisso di sole lettere, nuovo a ogni giro: i codici delle file non si scontrano mai
// con quelli di un collaudo precedente sullo stesso database.
const gridPrefix = `Q${Array.from({ length: 3 }, (_, i) => String.fromCharCode(65 + (Math.floor(Date.now() / 26 ** i) % 26))).join('')}`;
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
const compact = (day: string) => day.slice(2).replaceAll('-', '');

/** A visitor with its own cookie jar, exactly like the one of smoke-conto and smoke-mercato. */
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
      headers: this.headers({ 'Content-Type': 'application/x-www-form-urlencoded', Origin: base, 'X-Forwarded-For': '198.51.100.11' }),
      body: new URLSearchParams(fields).toString(),
    });
    this.absorb(response);
    return response.headers.get('location') ?? `status ${response.status}`;
  }

  async signIn(email: string, secret = password): Promise<string> {
    return this.post('accesso', { lang: 'it', email, password: secret });
  }
}

/** Plain JSON calls against the API: layout, draft, inventory, booking and the scan. */
async function api(method: string, path: string, payload?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(apiBase + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '198.51.100.11', ...headers },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  const text = await response.text();
  return { status: response.status, body: (text ? JSON.parse(text) : {}) as Record<string, unknown> };
}

interface LayoutSpot {
  spotId: string;
  code: string;
  zone: 'riva' | 'ombrelloni' | 'monte';
  rowNumber: number;
  col: number;
  typeId: string;
  maintenance: boolean;
  namedZoneId: string | null;
  sunbeds: number;
}

interface LayoutElement {
  elementId: string;
  kind: string;
  sign: string | null;
  zone: string | null;
  rowNumber: number | null;
  colStart: number | null;
  colEnd: number | null;
}

interface Layout {
  spots: LayoutSpot[];
  elements: LayoutElement[];
}

async function layoutOf(bearer: Record<string, string>): Promise<Layout> {
  const result = await api('GET', `/v1/manage/beaches/${aurora}/layout`, undefined, bearer);
  return result.body as unknown as Layout;
}

/** The first free column of a row, spots and elements both counted, far from the lanes. */
function freeCol(layout: Layout, zone: string, row: number, from = 10): number {
  const taken = new Set<number>();
  for (const spot of layout.spots) if (spot.zone === zone && spot.rowNumber === row) taken.add(spot.col);
  for (const element of layout.elements) {
    if (element.zone !== zone || element.rowNumber !== row || element.colStart === null) continue;
    for (let col = element.colStart; col <= (element.colEnd ?? element.colStart); col += 1) taken.add(col);
  }
  let col = from;
  while (taken.has(col)) col += 1;
  return col;
}

/** The audit trail, read with the same psql-through-compose the backup scripts use. */
let psqlDown = false;
function trail(query: string): string | null {
  if (psqlDown) return null;
  try {
    return execSync(`${psqlCommand} "${query.replaceAll('"', '\\"')}"`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    psqlDown = true;
    note('scia non raggiungibile via docker compose: i controlli sul registro delle azioni sono saltati');
    return null;
  }
}

/** The ordered states of the first beach-art legend of a page: colour+glyph, never colour alone. */
function legendStates(html: string): string[] {
  const start = html.indexOf('beach-legend__list');
  if (start < 0) return [];
  const block = html.slice(start, html.indexOf('</ul>', start));
  return [...block.matchAll(/beach-art--st-([a-z]+)/g)].map((match) => match[1]!);
}

if (!password || !webhookSecret) {
  console.error('Set OMBRE_DEMO_PASSWORD and OMBRE_SANDBOX_WEBHOOK_SECRET to the values the stack was started with.');
  process.exit(1);
}

// ---- Preparazione: gestore dal sito e dall'API, bozza pulita, scia di partenza ----
const anybody = new Visitor();
const manager = new Visitor();
check((await manager.signIn(managerEmail)).endsWith('/area/profilo'), 'preparazione: il Gestore dimostrativo entra dal sito');
const signedIn = await api('POST', '/v1/auth/login', { email: managerEmail, password });
check(signedIn.status === 200, 'preparazione: il Gestore entra anche dall\'API');
const bearer = { Authorization: `Bearer ${String(signedIn.body.token)}` };
const leftover = await api('POST', `/v1/manage/beaches/${aurora}/layout/draft/discard`, undefined, bearer);
check(leftover.status === 200, 'preparazione: la bozza parte vuota (scartato un eventuale resto)');
const savedBefore = trail("SELECT count(*) FROM audit_event WHERE action = 'layout.saved'");
let savesDone = 0;

// ---- Criterio 1: la grafica beach-art sulle planimetrie pubbliche, in console e sui pass ----
console.log('— Criterio 1: la grafica nuova, dappertutto —');
const publicDay = addDays(today, 3);
const pages: Record<string, string> = {};
for (const [slug, day] of [[aurora, publicDay], [cala, publicDay], [dune, '2027-06-17']] as const) {
  const page = await anybody.get(`/bagni/${slug}?day=${day}`);
  pages[slug] = page.html;
  check(page.status === 200 && page.html.includes('beach-art beach-sea'), `planimetria ${slug}: la fascia del mare illustrata (beach-art beach-sea) è servita`);
  check(page.html.includes('beach-art--sand'), `planimetria ${slug}: la sabbia illustrata (beach-art--sand) fa da fondo alle file`);
  check(page.html.includes('class="beach-art beach-spot'), `planimetria ${slug}: le postazioni sono simboli beach-art in SVG`);
}
for (const sign of ['torretta', 'duna', 'beachvolley', 'bocce', 'pedalo', 'canoa', 'sup'] as const) {
  check(pages[aurora]!.includes(`beach-element--${sign}`), `scenografia Aurora: il soggetto «${sign}» del seme è disegnato`);
}
const auroraEn = await anybody.get(`/en/beach-clubs/${aurora}?day=${publicDay}`);
check(auroraEn.status === 200 && auroraEn.html.includes('beach-art beach-sea') && auroraEn.html.includes('class="beach-art beach-spot'), 'planimetria inglese: la stessa grafica beach-art sulla pagina inglese');
const consoleIt = await manager.get(`/area/gestione/${aurora}/oggi?day=${today}`);
check(consoleIt.status === 200 && consoleIt.html.includes('class="beach-art beach-spot'), 'console «Oggi»: le postazioni della scena usano i simboli beach-art');
check(consoleIt.html.includes('beach-art beach-badge'), 'console «Oggi»: i distintivi colore+glifo (beach-badge) sono in pagina');
const plannerGrid = await manager.get(`/area/gestione/${aurora}/planner`);
check(plannerGrid.status === 200 && plannerGrid.html.includes('beach-art beach-badge'), 'planner del gestionale: le celle portano il distintivo colore+glifo');
// Il pass illustrato si verifica più sotto (criterio 4), su una prenotazione viva del collaudo.

// ---- Criterio 2: legenda identica it/en, manutenzione nel gestionale, M02 fuori vendita ----
console.log('— Criterio 2: stati colore+glifo, legenda e manutenzione —');
const statesIt = legendStates(pages[aurora]!);
const statesEn = legendStates(auroraEn.html);
check(statesIt.length >= 3 && statesIt.join(',') === statesEn.join(','), `legenda pubblica: stessi stati nello stesso ordine nelle due lingue (${statesIt.join(', ')})`);
check(pages[aurora]!.includes('Libera, giornata condivisa') && pages[aurora]!.includes('Non disponibile') && pages[aurora]!.includes('Scelta da te'), 'legenda pubblica it: le etichette degli stati sono scritte');
check(auroraEn.html.includes('Free, shared day') && auroraEn.html.includes('Not available') && auroraEn.html.includes('Your choice'), 'legenda pubblica en: le stesse voci tradotte');
check(pages[aurora]!.includes('plan-legend-narrow'), 'legenda pubblica: al telefono si apre da <details>, senza JavaScript');
const consoleEn = await manager.get(`/en/account/manage/${aurora}/today?day=${today}`);
const opsStatesIt = legendStates(consoleIt.html);
const opsStatesEn = legendStates(consoleEn.html);
check(opsStatesIt.join(',') === 'available,booked,occupied,seasonal,maintenance,unavailable', `legenda del gestionale: i sei stati D56 in ordine (${opsStatesIt.join(', ')})`);
check(opsStatesEn.join(',') === opsStatesIt.join(','), 'legenda del gestionale: identica in inglese, stato per stato');
for (const label of ['Disponibile', 'Prenotata', 'Occupata', 'Stagionale', 'In manutenzione']) check(consoleIt.html.includes(label), `legenda del gestionale it: la voce «${label}» c'è`);
check(consoleEn.html.includes('Under maintenance') && consoleEn.html.includes('Seasonal'), 'legenda del gestionale en: «Under maintenance» e «Seasonal» (mai «subscription»)');
check(consoleIt.html.includes('beach-art--st-maintenance'), 'console: la postazione in manutenzione del seme è disegnata con ambra + chiave inglese');
check(pages[aurora]!.includes('>M02<') && !pages[aurora]!.includes('postazione-M02'), 'M02: disegnata sulla planimetria pubblica ma SENZA link di prenotazione');
const avail = await api('GET', `/v1/beaches/${aurora}/availability?day=${today}`);
const availCodes = ((avail.body.spots as { code: string }[] | undefined) ?? []).map((spot) => spot.code);
check(!availCodes.includes('M02'), 'M02: esclusa dalla disponibilità in vendita');
const startLayout = await layoutOf(bearer);
const m02 = startLayout.spots.find((spot) => spot.code === 'M02');
check(m02 !== undefined && m02.maintenance, 'M02: il gestionale la dice in manutenzione (migrazione 024 e seme)');
if (m02) {
  const refusedDesk = await api('POST', `/v1/manage/beaches/${aurora}/desk-bookings`, { spotId: m02.spotId, day: today, guestName: 'Collaudo Spiaggia' }, bearer);
  check(refusedDesk.status === 409 && (refusedDesk.body.error as { code: string }).code === 'inventory_conflict', 'M02: anche il banco rifiuta la prenotazione (inventory_conflict)');
}

// ---- Criterio 3: bozza che crea una postazione singola e una griglia numerata ----
console.log('— Criterio 3: creare in bozza, anteprima sì, pubblico no —');
const newRow = Math.max(0, ...startLayout.spots.filter((spot) => spot.zone === 'monte').map((spot) => spot.rowNumber), ...startLayout.elements.filter((element) => element.zone === 'monte').map((element) => element.rowNumber ?? 0)) + 3;
const singleCol = freeCol(startLayout, 'monte', newRow);
const common = { lang: 'it', beach: aurora };
const queuedSingle = await manager.post('spiaggia-postazione', { ...common, zone: 'monte', row: String(newRow), col: String(singleCol), code: '', type: '', umbrellas: '', sunbeds: '', guests: '' });
check(queuedSingle.includes('#bozza') && queuedSingle.includes('ok='), `bozza: la postazione singola si accoda dal modulo (${newRow}/${singleCol})`);
check((await manager.get(queuedSingle)).html.includes('Operazione aggiunta alla bozza (n. 1).'), 'bozza: l\'esito dice «Operazione aggiunta alla bozza (n. 1).»');
const queuedGrid = await manager.post('spiaggia-file', { ...common, zone: 'monte', rows: '2', perRow: '2', prefix: gridPrefix, type: '', umbrellas: '', sunbeds: '', guests: '' });
check(queuedGrid.includes('ok='), `bozza: la griglia 2×2 con prefisso ${gridPrefix} si accoda dal modulo delle file`);
const draftView = await api('GET', `/v1/manage/beaches/${aurora}/layout/draft`, undefined, bearer);
const ops = draftView.body.ops as { description: Record<string, unknown> }[];
check(draftView.status === 200 && ops.length === 2, 'bozza: l\'API della bozza elenca le due operazioni');
const singleCode = String(ops[0]?.description.code ?? '');
const gridFirst = String(ops[1]?.description.firstCode ?? '');
const gridLast = String(ops[1]?.description.lastCode ?? '');
check(singleCode !== '' && gridFirst.startsWith(gridPrefix) && gridLast.startsWith(gridPrefix) && gridFirst !== gridLast, `numerazione automatica: codice singolo ${singleCode}, griglia ${gridFirst}–${gridLast}`);
const preview = draftView.body.preview as { spots: { code: string }[] };
check(preview.spots.some((spot) => spot.code === singleCode) && preview.spots.some((spot) => spot.code === gridFirst), 'anteprima: la bozza applicata contiene le postazioni nuove');
const plannerPage = await manager.get(`/area/gestione/${aurora}/spiaggia`);
check(plannerPage.html.includes('La bozza della spiaggia') && plannerPage.html.includes('2 operazioni in bozza'), 'pianificatore: il pannello della bozza conta le due operazioni');
check(plannerPage.html.includes(`Crea la postazione ${singleCode}`) && plannerPage.html.includes('Crea 2 file da 2'), 'pianificatore: le operazioni sono dette in parole, una riga ciascuna');
check(plannerPage.html.includes('Anteprima della bozza — non ancora salvata'), 'pianificatore: l\'anteprima dichiara di mostrare la bozza');
check(plannerPage.html.includes('Solo in bozza'), 'pianificatore: le postazioni nuove portano il distintivo «Solo in bozza»');
const plannerEn = await manager.get(`/en/account/manage/${aurora}/beach-layout`);
check(plannerEn.html.includes('2 operations in the draft') && plannerEn.html.includes('Draft preview — not saved yet'), 'pianificatore inglese: bozza e anteprima con il lessico inglese');
const publicBefore = await anybody.get(`/bagni/${aurora}?day=${publicDay}`);
check(!publicBefore.html.includes(`>${singleCode}<`) && !publicBefore.html.includes(`>${gridFirst}<`), 'pubblico: PRIMA del salvataggio le postazioni in bozza non esistono');

// ---- Criterio 7 (prima parte): riepilogo in parole, conferma, esito coi conteggi ----
console.log('— Criterio 7: riepilogo, conferma, audit e pubblico aggiornato —');
const summaryPage = await manager.get(`/area/gestione/${aurora}/spiaggia?salva=1`);
check(summaryPage.html.includes('Riepilogo del salvataggio') && summaryPage.html.includes('Conferma il salvataggio'), 'salvataggio: il riepilogo in parole viene PRIMA della conferma');
check(summaryPage.html.includes(`Crea la postazione ${singleCode}`) && summaryPage.html.includes(`codici ${gridFirst}`), 'salvataggio: il riepilogo elenca le operazioni con codici e celle');
const savedOnce = await manager.post('spiaggia-bozza-salva', common);
savesDone += 1;
const savedOncePage = await manager.get(savedOnce);
check(savedOncePage.html.includes('Spiaggia salvata: 2 operazioni applicate.'), 'salvataggio: l\'esito conta le operazioni applicate');
check(savedOncePage.html.includes('postazioni create') && savedOncePage.html.includes('file generate'), 'salvataggio: l\'esito dice i generi applicati (postazioni create, file generate)');
let layoutNow = await layoutOf(bearer);
// Le postazioni nate da QUESTO giro: su un database già collaudato i codici CQ proseguono.
const createdIds = new Set(layoutNow.spots.filter((spot) => !startLayout.spots.some((old) => old.spotId === spot.spotId)).map((spot) => spot.spotId));
const createdCodes = layoutNow.spots.filter((spot) => createdIds.has(spot.spotId)).map((spot) => spot.code);
check(createdIds.size === 5 && createdCodes.includes(singleCode) && createdCodes.includes(gridFirst) && createdCodes.includes(gridLast), `salvataggio: le cinque postazioni nuove esistono davvero nel disegno (${createdCodes.join(', ')})`);
const publicAfter = await anybody.get(`/bagni/${aurora}?day=${publicDay}`);
check(publicAfter.html.includes(`>${singleCode}<`), 'pubblico: subito dopo il salvataggio la planimetria pubblica mostra la postazione nuova');
const savedCount = trail("SELECT count(*) FROM audit_event WHERE action = 'layout.saved'");
if (savedBefore !== null && savedCount !== null) {
  check(Number(savedCount) === Number(savedBefore) + 1, `audit: una voce layout.saved in più nella scia (${savedBefore} → ${savedCount})`);
  const detail = trail("SELECT detail::text FROM audit_event WHERE action = 'layout.saved' ORDER BY created_at DESC LIMIT 1") ?? '';
  check(detail.includes('"total": 2') && detail.includes('"create_spot": 1') && detail.includes('"create_grid": 1'), `audit: la voce porta il conto delle operazioni (${detail})`);
}

// ---- Criterio 4: spostare una postazione con prenotazione, identità intatta ----
console.log('— Criterio 4: spostamento via modulo, stessa prenotazione, stesso pass —');
const moved = layoutNow.spots.find((spot) => spot.code === gridFirst)!;
const published = await api('POST', `/v1/manage/beaches/${aurora}/inventory/publish`, { day: today, priceCents: 2500, spotIds: [moved.spotId] }, bearer);
check(published.status === 200, `banco di prova: la giornata di oggi va in vendita sulla ${gridFirst}`);
const held = await api('POST', '/v1/holds', { beachSlug: aurora, spotId: moved.spotId, day: today }, { 'Idempotency-Key': `spiaggia-${randomUUID()}` });
check(held.status === 201, `prenotazione: la riserva su ${gridFirst} per oggi riesce`);
const checkout = await api('POST', '/v1/checkouts', { beachSlug: aurora, holdId: held.body.holdId, guestName: 'Ospite del Pianificatore', guestEmail: `spiaggia-${run.toLowerCase()}@example.org`, locale: 'it' });
check(checkout.status === 201, 'prenotazione: il checkout risponde');
const guestAuth = { Authorization: `Bearer ${String(checkout.body.accessToken)}` };
const reference = (checkout.body.payment as { reference: string }).reference;
const raw = JSON.stringify({ eventId: `evt_${randomUUID()}`, reference, outcome: 'succeeded' });
const signature = createHmac('sha256', webhookSecret).update(raw).digest('hex');
const paid = await fetch(`${apiBase}/v1/payment-webhooks/sandbox`, { method: 'POST', headers: { 'X-Ombre-Signature': signature }, body: raw });
check(((await paid.json()) as { result: string }).result === 'confirmed', 'prenotazione: il pagamento di prova conferma');
const bookingPath = `/v1/beaches/${aurora}/bookings/${String(checkout.body.bookingId)}`;
const booked = (await api('GET', bookingPath, undefined, guestAuth)).body as { code: string; passCredential: string | null; spot: { code: string } };
check(new RegExp(`^OM-${compact(today)}-\\d{3}$`).test(booked.code) && typeof booked.passCredential === 'string', `prenotazione: confermata con pass (${booked.code}) sulla ${booked.spot.code}`);
layoutNow = await layoutOf(bearer);
const targetCol = freeCol(layoutNow, moved.zone, moved.rowNumber, moved.col + 7);
const queuedMove = await manager.post('spiaggia-sposta', { ...common, spot: moved.spotId, zone: moved.zone, row: String(moved.rowNumber), col: String(targetCol) });
check(queuedMove.includes('#sposta') && queuedMove.includes('ok='), 'spostamento: il modulo fascia/fila/colonna accoda l\'operazione (senza JavaScript)');
const moveSummary = await manager.get(`/area/gestione/${aurora}/spiaggia?salva=1`);
check(moveSummary.html.includes(`Sposta la postazione ${gridFirst}`), 'spostamento: il riepilogo lo dice in parole, da cella a cella');
const movedSave = await manager.get(await manager.post('spiaggia-bozza-salva', common));
savesDone += 1;
check(movedSave.html.includes('Spiaggia salvata: 1 operazione applicata.'), 'spostamento: il salvataggio applica la mossa');
layoutNow = await layoutOf(bearer);
const afterMove = layoutNow.spots.find((spot) => spot.spotId === moved.spotId);
check(afterMove !== undefined && afterMove.code === gridFirst && afterMove.col === targetCol && afterMove.rowNumber === moved.rowNumber, `spostamento: stesso id e stesso codice ${gridFirst}, nuova cella (colonna ${targetCol})`);
check(!layoutNow.spots.some((spot) => spot.zone === moved.zone && spot.rowNumber === moved.rowNumber && spot.col === moved.col), 'spostamento: la vecchia cella è rimasta libera');
const rebooked = (await api('GET', bookingPath, undefined, guestAuth)).body as { code: string; status: string; passCredential: string | null; spot: { code: string } };
check(rebooked.status === 'confirmed' && rebooked.code === booked.code && rebooked.spot.code === gridFirst, 'spostamento: la prenotazione è la stessa, sullo stesso codice');
check(rebooked.passCredential === booked.passCredential, 'spostamento: il pass non è cambiato di un byte');
const scanned = await api('POST', `/v1/manage/beaches/${aurora}/access-events`, { credential: booked.passCredential, kind: 'entry' }, bearer);
check(scanned.status === 201 && (scanned.body as { spotCode?: string }).spotCode === gridFirst, `biglietto: il pass scandito al banco apre l'ingresso di oggi sulla ${gridFirst}`);
// Il conto dell'Ospite (criterio 1, chiusura): «Entra con Google» di prova sulla stessa email
// ricollega il soggiorno, e accanto al pass la postazione è il piccolo simbolo beach-art.
const passHolder = new Visitor();
const avvio = await passHolder.get('/azioni/oidc-avvio?lang=it');
const consent = await passHolder.get(avvio.location);
const state = /name="state" value="([^"]+)"/.exec(consent.html)?.[1] ?? '';
await passHolder.get(await passHolder.post('oidc-consenso', { lang: 'it', state, email: `spiaggia-${run.toLowerCase()}@example.org`, name: 'Ospite del Pianificatore' }));
const passHome = await passHolder.get('/area/profilo');
check(passHome.status === 200 && passHome.html.includes(booked.code), 'conto: la prenotazione del collaudo è ricollegata al conto dell\'Ospite');
check(passHome.html.includes('class="beach-art beach-spot'), 'conto: accanto al pass la postazione è il simbolo beach-art (criterio 1)');
const dragScript = await fetch(`${base}/pianificatore.js`);
const dragSource = await dragScript.text();
check(dragScript.status === 200 && dragSource.includes('modulo-sposta'), 'trascinamento: /pianificatore.js è servito e compila il modulo di spostamento');
check(plannerPage.html.includes('src="/pianificatore.js"'), 'trascinamento: la pagina del pianificatore carica lo script in modo progressivo');
note('il trascinamento vero con JavaScript è provato con Playwright dal frontend: prova esterna a questa suite');

// ---- Criterio 5: modifiche in bozza; eliminazione rifiutata e accettata ----
console.log('— Criterio 5: tipo, dotazione, codice, zona, manutenzione; eliminare —');
const edited = layoutNow.spots.find((spot) => spot.code === gridLast)!;
const types = (await api('GET', `/v1/manage/beaches/${aurora}/types`, undefined, bearer)).body.types as { typeId: string; name: string }[];
const otherType = types.find((type) => type.typeId !== edited.typeId)!;
const zones = (await api('GET', `/v1/manage/beaches/${aurora}/zones`, undefined, bearer)).body.zones as { zoneId: string; name: string }[];
const zone = zones[0];
check(otherType !== undefined && zone !== undefined, `modifica: un altro tipo («${otherType?.name}») e una zona con nome («${zone?.name}») sono a disposizione`);
check((await manager.post('spiaggia-tipo', { ...common, spot: edited.spotId, type: otherType.typeId })).includes('ok='), 'modifica: il cambio di tipo si accoda alla bozza');
const newCode = `CX${run.slice(-4)}`;
const queuedEdit = await manager.post('spiaggia-modifica', { ...common, spot: edited.spotId, code: newCode, umbrellas: '1', sunbeds: '2', guests: '3', maintenance: 'yes', rentalType: '', rentalNotes: '', namedZone: zone!.zoneId });
check(queuedEdit.includes('ok='), 'modifica: codice, dotazione, zona e manutenzione viaggiano in un solo modulo');
const editSummary = await manager.get(`/area/gestione/${aurora}/spiaggia?salva=1`);
check(editSummary.html.includes(`Modifica la postazione ${gridLast}`) && editSummary.html.includes(`codice ${newCode}`), 'modifica: il riepilogo nomina la postazione e il codice nuovo');
check(editSummary.html.includes('in manutenzione') && editSummary.html.includes(`zona ${zone!.name}`), 'modifica: il riepilogo dice anche manutenzione e zona con nome');
const editSave = await manager.get(await manager.post('spiaggia-bozza-salva', common));
savesDone += 1;
check(editSave.html.includes('Spiaggia salvata: 2 operazioni applicate.'), 'modifica: il salvataggio applica tipo e modifica insieme');
layoutNow = await layoutOf(bearer);
const afterEdit = layoutNow.spots.find((spot) => spot.spotId === edited.spotId);
check(afterEdit !== undefined && afterEdit.code === newCode && afterEdit.typeId === otherType.typeId, `modifica: la postazione ora si chiama ${newCode} col tipo «${otherType.name}»`);
check(afterEdit !== undefined && afterEdit.maintenance && afterEdit.namedZoneId === zone!.zoneId && afterEdit.sunbeds === 2, 'modifica: manutenzione accesa, zona assegnata, dotazione aggiornata');

// Il pennello di zona (D59) accoda un'assegnazione; «Annulla l'ultima operazione» la toglie.
const brushSpot = layoutNow.spots.find((spot) => spot.code === singleCode)!;
const queuedBrush = await manager.post('spiaggia-pennello', { ...common, postazione: brushSpot.spotId, pennello: zone!.zoneId });
check(queuedBrush.includes('ok=') && queuedBrush.includes(`pennello=${zone!.zoneId}`), 'pennello di zona: il tocco accoda l\'assegnazione e il pennello resta in mano');
check((await manager.get(`/area/gestione/${aurora}/spiaggia`)).html.includes(`Assegna la postazione ${singleCode} alla zona ${zone!.name}`), 'pennello di zona: l\'operazione è detta in parole nella bozza');
const undone = await manager.get(await manager.post('spiaggia-bozza-annulla', common));
check(undone.html.includes('Ultima operazione annullata: la bozza è vuota.'), 'bozza: «Annulla l\'ultima operazione» svuota la bozza');

// Eliminare la postazione prenotata è rifiutato al salvataggio, con l'indice della colpevole.
check((await manager.post('spiaggia-elimina', { ...common, spot: moved.spotId })).includes('ok='), 'eliminazione: la richiesta sulla postazione prenotata si accoda (i veri guardiani parlano al salvataggio)');
const refusedSave = await manager.post('spiaggia-bozza-salva', common);
check(refusedSave.includes('salva=1') && refusedSave.includes('fallita=0') && refusedSave.includes('motivo=spot_has_future_bookings'), 'eliminazione: il salvataggio rifiuta e indica operazione e motivo nella rotta');
const refusedPage = await manager.get(refusedSave);
check(refusedPage.html.includes('operazione n. 1 ha impedito il salvataggio.'), 'eliminazione: il riepilogo segna l\'operazione colpevole con il suo indice');
check(refusedPage.html.includes('La postazione ha prenotazioni future'), 'eliminazione: il motivo è detto in parole (prenotazioni future)');
check(refusedPage.html.includes('Niente è stato applicato'), 'eliminazione: niente è stato applicato, la spiaggia salvata è intatta');
layoutNow = await layoutOf(bearer);
check(layoutNow.spots.some((spot) => spot.spotId === moved.spotId), 'eliminazione: la postazione prenotata esiste ancora');
check((await manager.get(await manager.post('spiaggia-bozza-annulla', common))).html.includes('Ultima operazione annullata: la bozza è vuota.'), 'eliminazione: l\'operazione rifiutata si toglie e la bozza torna vuota');
// Una postazione mai usata invece si elimina: in bozza, poi col salvataggio.
const deleted = layoutNow.spots.find((spot) => createdIds.has(spot.spotId) && spot.spotId !== moved.spotId && spot.spotId !== edited.spotId && spot.code !== singleCode)!;
check((await manager.post('spiaggia-elimina', { ...common, spot: deleted.spotId })).includes('ok='), `eliminazione: la ${deleted.code}, mai usata, si accoda`);
const deleteSave = await manager.get(await manager.post('spiaggia-bozza-salva', common));
savesDone += 1;
check(deleteSave.html.includes('Spiaggia salvata: 1 operazione applicata.') && deleteSave.html.includes('eliminazioni'), 'eliminazione: il salvataggio la applica e l\'esito dice «eliminazioni»');
layoutNow = await layoutOf(bearer);
check(!layoutNow.spots.some((spot) => spot.spotId === deleted.spotId), `eliminazione: la ${deleted.code} non c'è più`);

// ---- Criterio 6: la scenografia si aggiunge, si sposta e si toglie; registro fermo ----
console.log('— Criterio 6: scenografia senza effetti su prenotazioni e registro —');
const reportBefore = (await api('GET', `/v1/manage/beaches/${aurora}/reports/summary?from=${addDays(today, -30)}&to=${addDays(today, 30)}`, undefined, bearer)).body;
const palmsBefore = (publicAfter.html.match(/beach-element--palma/g) ?? []).length;
const palmRow = newRow + 1;
const palmCol = freeCol(layoutNow, 'monte', palmRow, 30);
const queuedPalm = await manager.post('spiaggia-disegno', { ...common, strumento: 'decorazione', cella: `monte/${palmRow}/${palmCol}`, segno: 'palma', etichetta: '' });
check(queuedPalm.includes('ok='), 'scenografia: una palma si accoda dalla griglia del disegno');
const palmSave = await manager.get(await manager.post('spiaggia-bozza-salva', common));
savesDone += 1;
check(palmSave.html.includes('Spiaggia salvata: 1 operazione applicata.') && palmSave.html.includes('scenografia aggiunta'), 'scenografia: il salvataggio la applica («scenografia aggiunta»)');
// Nel documento servito ogni classe compare anche nel flusso RSC in coda alla pagina:
// il conteggio si confronta quindi in termini relativi, mai come «+1» assoluto.
const withPalm = await anybody.get(`/bagni/${aurora}?day=${publicDay}`);
check((withPalm.html.match(/beach-element--palma/g) ?? []).length > palmsBefore, 'scenografia: la palma nuova è subito sulla planimetria pubblica');
layoutNow = await layoutOf(bearer);
const palm = layoutNow.elements.find((element) => element.sign === 'palma' && element.zone === 'monte' && element.rowNumber === palmRow && element.colStart === palmCol)!;
check(palm !== undefined, 'scenografia: la palma ha il suo posto nel disegno del gestionale');
check((await manager.post('spiaggia-elemento-sposta', { ...common, elemento: palm.elementId, zone: 'monte', row: String(palmRow), col: String(palmCol + 1) })).includes('ok='), 'scenografia: lo spostamento della palma si accoda dal modulo della carta');
const palmMoveSave = await manager.get(await manager.post('spiaggia-bozza-salva', common));
savesDone += 1;
check(palmMoveSave.html.includes('scenografia spostata'), 'scenografia: il salvataggio sposta la palma («scenografia spostata»)');
layoutNow = await layoutOf(bearer);
check(layoutNow.elements.some((element) => element.elementId === palm.elementId && element.colStart === palmCol + 1), 'scenografia: la palma sta nella cella accanto');
check((await manager.post('spiaggia-disegno', { ...common, strumento: 'gomma', elemento: palm.elementId })).includes('ok='), 'scenografia: la gomma accoda la rimozione');
const palmGoneSave = await manager.get(await manager.post('spiaggia-bozza-salva', common));
savesDone += 1;
check(palmGoneSave.html.includes('scenografia tolta'), 'scenografia: il salvataggio la toglie («scenografia tolta»)');
const withoutPalm = await anybody.get(`/bagni/${aurora}?day=${publicDay}`);
check((withoutPalm.html.match(/beach-element--palma/g) ?? []).length === palmsBefore, 'scenografia: il pubblico torna al conto di palme di prima');
const reportAfter = (await api('GET', `/v1/manage/beaches/${aurora}/reports/summary?from=${addDays(today, -30)}&to=${addDays(today, 30)}`, undefined, bearer)).body;
check(JSON.stringify(reportAfter.grossCents) === JSON.stringify(reportBefore.grossCents) && JSON.stringify(reportAfter.byParty) === JSON.stringify(reportBefore.byParty), 'registro: tre salvataggi di scenografia non muovono un centesimo (lordo e ripartizioni identici)');
const rebookedAgain = (await api('GET', bookingPath, undefined, guestAuth)).body as { code: string };
check(rebookedAgain.code === booked.code, 'scenografia: la prenotazione del collaudo è rimasta intonsa');

// ---- Criterio 7 (chiusura): tutte le voci layout.saved della suite stanno nella scia ----
const savedFinal = trail("SELECT count(*) FROM audit_event WHERE action = 'layout.saved'");
if (savedBefore !== null && savedFinal !== null) {
  check(Number(savedFinal) === Number(savedBefore) + savesDone, `audit: ${savesDone} salvataggi della suite, ${savesDone} voci layout.saved in più (${savedBefore} → ${savedFinal})`);
  const lastDetail = trail("SELECT detail::text FROM audit_event WHERE action = 'layout.saved' ORDER BY created_at DESC LIMIT 1") ?? '';
  check(lastDetail.includes('"remove_element": 1'), `audit: l'ultima voce porta il genere giusto (${lastDetail})`);
}

// ---- Criterio 8: 390 px — niente scorrimento orizzontale del documento ----
console.log('— Criterio 8: la pagina regge i 390 px —');
const finalPublic = withoutPalm.html;
check(finalPublic.includes('name="viewport" content="width=device-width'), '390px: il viewport è width=device-width');
check(finalPublic.includes('plan__scroll') && finalPublic.includes('role="region"'), '390px: la planimetria scorre dentro la sua regione, mai la pagina');
const artSvgs = [...finalPublic.matchAll(/<svg class="beach-art[^>]*>/g)].map((match) => match[0]);
check(artSvgs.length > 0 && artSvgs.every((tag) => tag.includes('viewBox=')), '390px: ogni SVG beach-art scala col viewBox');
const fixedWide = artSvgs.filter((tag) => { const w = /width="(\d+)"/.exec(tag); return w !== null && Number(w[1]) > 64; });
check(fixedWide.length === 0, '390px: nessun simbolo beach-art dichiara larghezze fisse oltre la cella da 64');
const styleLinks = [...finalPublic.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((match) => match[1]!);
let css = '';
for (const href of styleLinks) css += await (await fetch(base + href)).text();
check(styleLinks.length > 0 && /\.plan__scroll\{[^}]*overflow-x:auto/.test(css), '390px: il CSS servito fa scorrere la mappa dentro .plan__scroll (overflow-x:auto)');
const beachRules = [...css.matchAll(/\.beach-[a-z-]+[^{]*\{[^}]*\}/g)].map((match) => match[0]);
const wideRules = beachRules.filter((rule) => [...rule.matchAll(/[^-]width:([0-9.]+)px/g)].some((match) => Number(match[1]) > 390));
check(beachRules.length > 0 && wideRules.length === 0, '390px: nessuna regola beach-* fissa larghezze oltre i 390 px');
check(plannerPage.html.includes('plan__scroll'), '390px: anche l\'anteprima del pianificatore scorre nella sua regione');
note('la prova visiva a 390 px è delle schermate del frontend: qui si controllano markup e CSS serviti');

// ---- Pulizia: la bozza resta vuota; le postazioni del collaudo restano, innocue ----
const leftovers = await api('GET', `/v1/manage/beaches/${aurora}/layout/draft`, undefined, bearer);
const leftoverOps = (leftovers.body.ops as unknown[] | undefined) ?? [];
if (leftoverOps.length > 0) {
  await api('POST', `/v1/manage/beaches/${aurora}/layout/draft/discard`, undefined, bearer);
  note(`bozza scartata a fine suite (${leftoverOps.length} operazioni rimaste)`);
}
check(((await api('GET', `/v1/manage/beaches/${aurora}/layout/draft`, undefined, bearer)).body.ops as unknown[]).length === 0, 'pulizia: la bozza resta vuota a fine collaudo');
const duneAfter = await api('GET', `/v1/beaches/${dune}/availability?day=2027-06-17`);
check(duneAfter.status === 200 && ((duneAfter.body.spots as unknown[]) ?? []).length > 0, 'pulizia: il giorno del seme della Dune è ancora in vendita per le suite che seguono');

if (failures.length > 0) {
  console.error(`${failures.length} of ${checks} checks failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`All ${checks} checks passed on ${base}: beach-art su pubblico, console e pass; legenda identica it/en con la manutenzione; bozza che crea ${singleCode} e ${gridFirst}–${gridLast}, sposta ${gridFirst} con la prenotazione ${booked.code} e il pass intatti, modifica ${newCode}, rifiuta e poi applica l'eliminazione; scenografia senza movimenti economici; ${savesDone} salvataggi con riepilogo, esito e audit layout.saved.`);
