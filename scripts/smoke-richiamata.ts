// Il percorso intero del modulo «Ti chiamiamo noi» (D71) come un browser senza
// scripts, nelle due lingue: invio valido con la conferma resa in pagina, convalide
// coi valori ricompilati, campo trappola che non registra nulla, limite di invii,
// elenco riservato dell'amministratore di piattaforma con la marcatura «richiamato»,
// non-admin respinto con la pagina neutra, senza sessione verso l'accesso.
// Serve OMBRE_DEMO_PASSWORD (il gestore dimostrativo fa da non-admin) e
// OMBRE_ADMIN_EMAIL / OMBRE_ADMIN_PASSWORD (l'amministratore creato dal migrate).
// Usage: node scripts/smoke-richiamata.ts [site address]   (default http://127.0.0.1:3210)

const base = (process.argv[2] ?? 'http://127.0.0.1:3210').replace(/\/+$/, '');
const demoPassword = process.env.OMBRE_DEMO_PASSWORD ?? '';
const adminEmail = process.env.OMBRE_ADMIN_EMAIL ?? '';
const adminPassword = process.env.OMBRE_ADMIN_PASSWORD ?? '';
const failures: string[] = [];
let checks = 0;

function check(condition: boolean, message: string): void {
  checks += 1;
  if (!condition) failures.push(message);
}

if (!demoPassword || !adminEmail || !adminPassword) {
  console.error('Set OMBRE_DEMO_PASSWORD, OMBRE_ADMIN_EMAIL and OMBRE_ADMIN_PASSWORD to the values the stack was started with.');
  process.exit(1);
}

/** Un visitatore: conserva i propri cookie come un profilo del browser. */
class Visitor {
  private cookie = '';

  async get(path: string): Promise<{ status: number; html: string; location: string }> {
    const response = await fetch(base + path, { redirect: 'manual', headers: this.cookie ? { Cookie: this.cookie } : {} });
    return { status: response.status, html: (await response.text()).replaceAll('&amp;', '&').replaceAll('&#x27;', "'"), location: response.headers.get('location') ?? '' };
  }

  // Il limite dell'API è per indirizzo X-Forwarded-For: ogni scenario usa il suo,
  // così i conteggi non si inquinano a vicenda.
  async post(action: string, fields: Record<string, string>, address: string): Promise<string> {
    const response = await fetch(`${base}/azioni/${action}`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: base, 'X-Forwarded-For': address, ...(this.cookie ? { Cookie: this.cookie } : {}) },
      body: new URLSearchParams(fields).toString(),
    });
    const set = response.headers.get('set-cookie');
    if (set) this.cookie = set.includes('Max-Age=0') ? '' : (set.split(';')[0] ?? '');
    return response.headers.get('location') ?? `status ${response.status}`;
  }
}

/** La query di un Location, con il percorso risolto come lo risolve il browser. */
function parsed(location: string): { path: string; query: URLSearchParams; hash: string } {
  const url = new URL(location, base);
  return { path: url.pathname, query: url.searchParams, hash: url.hash };
}

const stamp = Date.now().toString(36);
const langs = {
  it: {
    page: '/gestore-stabilimento',
    list: '/area/richieste',
    signIn: '/area/accesso',
    sent: 'Richiesta ricevuta',
    rate: 'Troppi invii',
    listTitle: 'Richieste di richiamata',
  },
  en: {
    page: '/en/beach-manager',
    list: '/en/account/callback-requests',
    signIn: '/en/account/sign-in',
    sent: 'Request received',
    rate: 'Too many submissions',
    listTitle: 'Callback requests',
  },
} as const;
const phone = '+39 0541 123456';
// Gli invii validi del giro, per ritrovarli poi nell'elenco riservato.
const names = { it: `Collaudo IT ${stamp}`, en: `Collaudo EN ${stamp}` } as const;
const beaches = { it: 'Bagno Collaudo', en: 'Collaudo Beach' } as const;
const traps = { it: `Trappola IT ${stamp}`, en: `Trappola EN ${stamp}` } as const;
// Indirizzi distinti per scenario e per lingua: il quarto ottetto distingue la lingua.
const address = (scenario: number, lang: 'it' | 'en') => `203.0.113.${scenario * 10 + (lang === 'it' ? 1 : 2)}`;

const guest = new Visitor();
for (const lang of ['it', 'en'] as const) {
  const t = langs[lang];

  // L'invio valido: 303 verso ?inviata=1#richiamata e conferma resa al posto del modulo.
  const sent = parsed(await guest.post('richiamata', { lang, name: names[lang], phone, beach: beaches[lang], consent: '1', sito: '' }, address(1, lang)));
  check(sent.path === t.page && sent.query.get('inviata') === '1' && sent.hash === '#richiamata', `${lang}: a valid submission does not land on ${t.page}?inviata=1#richiamata (got ${sent.path}?${sent.query.toString()}${sent.hash})`);
  const confirmed = await guest.get(`${t.page}?inviata=1`);
  check(confirmed.status === 200 && /<p class="alert alert--info" role="status">[^]*?<\/p>/.test(confirmed.html) && confirmed.html.includes(t.sent), `${lang}: the confirmation «${t.sent}» is not rendered in the page`);
  check(!confirmed.html.includes('action="/azioni/richiamata"'), `${lang}: the form is still in the page after a sent request`);
  // Correzioni del gruppo A (D72): la conferma non rimanda più a contatti che la
  // pagina non mostra — «più in basso» / «further down» sono banditi.
  const banished = lang === 'it' ? 'più in basso' : 'further down';
  check(!confirmed.html.includes(banished), `${lang}: the confirmation still points «${banished}» towards contacts the page does not show (gruppo A, D72)`);

  // Nome vuoto: flag enome e gli altri valori ricompilati nella query e nel campo.
  const noName = parsed(await guest.post('richiamata', { lang, name: '', phone, beach: beaches[lang], consent: '1', sito: '' }, address(1, lang)));
  check(noName.query.get('enome') === '1' && noName.hash === '#richiamata', `${lang}: an empty name does not come back with enome=1 on the form anchor`);
  check(noName.query.get('phone') === phone && noName.query.get('beach') === beaches[lang], `${lang}: the phone and beach club values are not recompiled after an empty name`);
  const retyped = await guest.get(`${noName.path}?${noName.query.toString()}`);
  check(retyped.html.includes('id="richiamata-nome-errore"'), `${lang}: the name error is not rendered next to its field`);
  // L'ordine degli attributi è del server: si cerca il tag del campo, poi il valore.
  const phoneField = /<input[^>]*name="phone"[^>]*>/i.exec(retyped.html)?.[0] ?? '';
  check(phoneField.includes(`value="${phone}"`), `${lang}: the phone field lost its value after an empty name`);

  // Telefono corto: flag etel e il nome ricompilato.
  const shortPhone = parsed(await guest.post('richiamata', { lang, name: names[lang], phone: '123', beach: '', consent: '1', sito: '' }, address(1, lang)));
  check(shortPhone.query.get('etel') === '1', `${lang}: a 3-character phone does not come back with etel=1`);
  check(shortPhone.query.get('name') === names[lang], `${lang}: the name is not recompiled after a short phone`);

  // Consenso mancante: flag econsenso e i valori ricompilati.
  const noConsent = parsed(await guest.post('richiamata', { lang, name: names[lang], phone, beach: '', sito: '' }, address(1, lang)));
  check(noConsent.query.get('econsenso') === '1', `${lang}: a missing consent does not come back with econsenso=1`);
  check(noConsent.query.get('name') === names[lang] && noConsent.query.get('phone') === phone, `${lang}: the values are not recompiled after a missing consent`);

  // La trappola compilata: risposta identica a un invio riuscito, nulla in archivio
  // (l'assenza dall'elenco riservato si verifica più sotto, da amministratore).
  const trapped = parsed(await guest.post('richiamata', { lang, name: traps[lang], phone, beach: '', consent: '1', sito: 'https://spam.example' }, address(2, lang)));
  check(trapped.query.get('inviata') === '1', `${lang}: a trapped submission does not answer like a sent one`);

  // Il limite di invii: cinque al minuto per indirizzo, il sesto torna con emodulo=limite.
  const crowd: string[] = [];
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    crowd.push((await guest.post('richiamata', { lang, name: `Limite ${lang} ${attempt} ${stamp}`, phone, beach: '', consent: '1', sito: '' }, address(3, lang))).toString());
  }
  check(crowd.every((location) => parsed(location).query.get('inviata') === '1'), `${lang}: the first five submissions from one address did not all land`);
  const sixth = parsed(await guest.post('richiamata', { lang, name: `Limite ${lang} 6 ${stamp}`, phone, beach: '', consent: '1', sito: '' }, address(3, lang)));
  check(sixth.query.get('emodulo') === 'limite' && sixth.hash === '#richiamata', `${lang}: the sixth submission from one address is not refused with emodulo=limite`);
  const refused = await guest.get(`${sixth.path}?${sixth.query.toString()}`);
  check(refused.html.includes(t.rate) && refused.html.includes('role="alert"'), `${lang}: the rate limit is not explained next to the form`);
}

// Senza sessione la pagina riservata manda all'accesso, in entrambe le lingue.
for (const lang of ['it', 'en'] as const) {
  const anonymous = await new Visitor().get(langs[lang].list);
  check(anonymous.status >= 300 && anonymous.status < 400 && parsed(anonymous.location).path === langs[lang].signIn, `${lang}: ${langs[lang].list} without a session does not redirect to the sign-in`);
}

// Un conto senza ruolo di piattaforma riceve la pagina neutra di pagina non trovata.
const manager = new Visitor();
const managerIn = await manager.post('accesso', { lang: 'it', email: 'gestore@bagnodelledune.example', password: demoPassword }, '198.51.100.31');
check(!managerIn.includes('err='), `non-admin: the demonstration manager could not sign in (${managerIn})`);
for (const lang of ['it', 'en'] as const) {
  check((await manager.get(langs[lang].list)).status === 404, `non-admin: ${langs[lang].list} does not answer 404 to a signed-in manager`);
}

// L'amministratore di piattaforma: elenco con data, nome, telefono e stabilimento.
const admin = new Visitor();
const adminIn = await admin.post('accesso', { lang: 'it', email: adminEmail, password: adminPassword }, '198.51.100.32');
check(!adminIn.includes('err='), `admin: the platform administrator could not sign in (${adminIn})`);
const list = await admin.get(langs.it.list);
check(list.status === 200 && list.html.includes(langs.it.listTitle), `admin: ${langs.it.list} does not show «${langs.it.listTitle}» (status ${list.status})`);
const rowOf = (html: string, name: string) => (html.match(/<tr role="row"[^]*?<\/tr>/g) ?? []).find((row) => row.includes(name)) ?? '';
const itRow = rowOf(list.html, names.it);
check(itRow !== '', `admin: the Italian submission «${names.it}» is not in the reserved list`);
check(itRow.includes(phone), 'admin: the row of the Italian submission lost its phone number');
check(itRow.includes(beaches.it), 'admin: the row of the Italian submission lost its beach club name');
check(/data-label="Data">[^<]*\d/.test(itRow), 'admin: the row of the Italian submission has no date');
check(itRow.includes('Nuova'), 'admin: a fresh request is not marked «Nuova»');
const requestId = /name="id" value="([0-9a-f-]{36})"/.exec(itRow)?.[1] ?? '';
check(itRow.includes('action="/azioni/richiamata-fatta"') && requestId !== '', 'admin: the row of a fresh request has no «Segna come richiamato» form with its id');
check(rowOf(list.html, names.en) !== '', `admin: the English submission «${names.en}» is not in the reserved list`);
// Il bot non impara niente e l'archivio nemmeno: le richieste trappola non esistono.
check(!list.html.includes(traps.it) && !list.html.includes(traps.en), 'admin: a trapped submission was recorded in the archive');

// La marcatura «richiamato»: ok=1, il modulo sparisce, e rifarla non cambia nulla.
const marked = parsed(await admin.post('richiamata-fatta', { lang: 'it', id: requestId }, '198.51.100.32'));
check(marked.path === langs.it.list && marked.query.get('ok') === '1', `admin: marking as called does not come back to ${langs.it.list}?ok=1`);
const afterMark = rowOf((await admin.get(langs.it.list)).html, names.it);
check(afterMark.includes('Richiamato') && !afterMark.includes('Nuova'), 'admin: the marked request is not shown as «Richiamato»');
check(!afterMark.includes('action="/azioni/richiamata-fatta"'), 'admin: the marked request still offers the «Segna come richiamato» form');
const markedAgain = parsed(await admin.post('richiamata-fatta', { lang: 'it', id: requestId }, '198.51.100.32'));
check(markedAgain.path === langs.it.list && markedAgain.query.get('ok') === '1', 'admin: marking twice is not idempotent for the page');
const afterSecondMark = rowOf((await admin.get(langs.it.list)).html, names.it);
check(afterSecondMark.includes('Richiamato') && !afterSecondMark.includes('action="/azioni/richiamata-fatta"'), 'admin: the second marking changed the row');

// La gemella inglese della pagina riservata mostra lo stesso archivio.
const listEn = await admin.get(langs.en.list);
check(listEn.status === 200 && listEn.html.includes(langs.en.listTitle), `admin: ${langs.en.list} does not show «${langs.en.listTitle}» (status ${listEn.status})`);
check(rowOf(listEn.html, names.it) !== '' && rowOf(listEn.html, names.en) !== '', 'admin: the English reserved page does not show the recorded requests');

if (failures.length > 0) {
  console.error(`${failures.length} of ${checks} checks failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`All ${checks} checks passed on ${base} (callback form, D71).`);
