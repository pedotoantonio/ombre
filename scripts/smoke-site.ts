// Walks the beach club website editor on the running site: draft, preview, publication,
// second language, template change, conflict between editors, restore.
// Needs OMBRE_SEED_DEMO=true and OMBRE_DEMO_PASSWORD.
// Usage: node scripts/smoke-site.ts [site address]   (default http://127.0.0.1:3210)

const base = (process.argv[2] ?? 'http://127.0.0.1:3210').replace(/\/+$/, '');
const password = process.env.OMBRE_DEMO_PASSWORD ?? '';
const beach = 'bagno-delle-dune';
const editor = `/area/sito/${beach}`;
const failures: string[] = [];
let checks = 0;

function check(condition: boolean, message: string): void {
  checks += 1;
  if (!condition) failures.push(message);
}

class Visitor {
  private cookie = '';

  async get(path: string): Promise<string> {
    const response = await fetch(base + path, { redirect: 'manual', headers: this.cookie ? { Cookie: this.cookie } : {} });
    return (await response.text()).replaceAll('&amp;', '&').replaceAll('&#x27;', "'");
  }

  async post(action: string, fields: Record<string, string>): Promise<string> {
    const response = await fetch(`${base}/azioni/${action}`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: base, 'X-Forwarded-For': '198.51.100.2', ...(this.cookie ? { Cookie: this.cookie } : {}) },
      body: new URLSearchParams(fields).toString(),
    });
    const set = response.headers.get('set-cookie');
    if (set) this.cookie = set.split(';')[0] ?? '';
    return response.headers.get('location') ?? `status ${response.status}`;
  }
}

if (!password) {
  console.error('Set OMBRE_DEMO_PASSWORD to the value the stack was started with.');
  process.exit(1);
}

const italian = {
  it_tagline: 'Tra le dune e il mare, dal 1962',
  it_description: 'Stabilimento a conduzione familiare con spiaggia di sabbia fine e pineta alle spalle.',
  it_services: 'Bar e ristoro\nDocce calde\nArea giochi',
  it_openingPeriod: 'Dal 15 maggio al 20 settembre',
  it_openingHours: 'Tutti i giorni dalle 8:30 alle 19:30',
  it_address: 'Viale Mare Adriatico 1, Lido di Pomposa',
  it_phone: '+39 0533 000000',
  it_accessibility: 'Passerella fino alla prima fila e sedia da mare su richiesta.',
};
const blankEnglish = { en_tagline: '', en_description: '', en_services: '', en_openingPeriod: '', en_openingHours: '', en_address: '', en_phone: '', en_accessibility: '' };
const english = { ...blankEnglish, en_tagline: 'Between the dunes and the sea, since 1962', en_description: 'A family-run beach club with fine sand and a pine wood behind it.', en_services: 'Bar\nHot showers' };

const manager = new Visitor();
await manager.post('accesso', { lang: 'it', email: 'gestore@bagnodelledune.example', password });
const version = async (visitor: Visitor) => /name="version" value="(\d*)"/.exec(await visitor.get(editor))?.[1] ?? '';

const opened = await manager.get(editor);
const brand = process.env.OMBRE_BRAND_NAME?.trim() || 'Ombrè';
// The demo beach club starts with its seeded, published website (D43) and no draft.
check(opened.includes('Nessuna bozza in corso'), 'editor: does not open without a draft');
check((await manager.get(`/bagni/${beach}`)).includes('site-cover'), 'public page: the seeded website has no cover picture');
check((/<title>([^<]*)<\/title>/.exec(opened)?.[1] ?? '') === `Sito dello stabilimento · Bagno delle Dune | ${brand}`, 'editor: the page has no title naming the beach club');
check(opened.includes('<legend>Testi in inglese</legend>') && opened.includes('Facoltativi: se li lasci vuoti'), 'editor: the English group has a long legend, or its note is missing');
// La libreria del sito ora porta anche le foto dei tipi (D62), servite da /demo/tipi/.
check((opened.match(/<img class="checks__thumb" src="\/demo\/(?:tipi\/)?[a-z]+\.jpg"/g) ?? []).length === (opened.match(/name="gallery"/g) ?? []).length && opened.includes('name="gallery"'), 'editor: a gallery option has no thumbnail');
// The editor lives in the application frame of the management area (D36): the top bar
// says who is signed in and offers the way out.
check(opened.includes('class="manage-top"') && opened.includes('Gestore dimostrativo') && opened.includes('action="/azioni/uscita"'), 'editor: no bar with who is signed in');
const fields = { lang: 'it', beach, template: 'riviera', ...italian, ...blankEnglish };
check((await manager.post('sito-salva', { ...fields, version: '' })).includes('ok=1'), 'editor: the first draft was not saved');

const drafted = await manager.get(editor);
check(drafted.includes('Bozza numero 2') && drafted.includes('Anteprima della bozza') && drafted.includes(italian.it_tagline), 'editor: no preview of the draft');
check(!(await manager.get(`/bagni/${beach}`)).includes(italian.it_tagline), 'public page: shows a draft that was never published');

check((await manager.post('sito-pubblica', { lang: 'it', beach, version: await version(manager) })).includes('ok=1'), 'editor: the draft was not published');
const published = await manager.get(`/bagni/${beach}`);
check(published.includes(italian.it_tagline) && published.includes('Docce calde') && published.includes(italian.it_address), 'public page: published texts are missing');
check(published.includes('tpl-riviera') && !published.includes('"LocalBusiness"'), 'public page: wrong template, or structured data on a demo beach club');
const untranslated = await manager.get(`/en/beach-clubs/${beach}`);
check(!untranslated.includes(italian.it_tagline) && !untranslated.includes('Docce calde'), 'english page: shows Italian texts');

// Second draft: other template and English. An editor with a stale version must be stopped.
check((await manager.post('sito-salva', { ...fields, ...english, template: 'boutique', version: '' })).includes('ok=1'), 'editor: the second draft was not saved');
const stale = await manager.post('sito-salva', { ...fields, it_tagline: 'Modifica vecchia', version: '' });
check(stale.includes('err=version_conflict'), `editor: a stale save was accepted (${stale})`);
check((await manager.get(stale)).includes('Qualcun altro ha modificato la bozza'), 'editor: the conflict is not explained');
check((await manager.post('sito-salva', { ...fields, it_description: 'Ciao <b>mare</b>', version: await version(manager) })).includes('err=invalid_request'), 'editor: markup was accepted');
await manager.post('sito-pubblica', { lang: 'it', beach, version: await version(manager) });

const restyled = await manager.get(`/bagni/${beach}`);
check(restyled.includes('tpl-boutique') && restyled.includes(italian.it_tagline) && restyled.includes('Area giochi'), 'public page: template change lost content');
const translated = await manager.get(`/en/beach-clubs/${beach}`);
check(translated.includes(english.en_tagline) && translated.includes('Hot showers') && !translated.includes('Docce calde'), 'english page: English texts missing or mixed');

// Restore the first revision: a new draft, history untouched.
const history = await manager.get(editor);
const firstRevision = [...history.matchAll(/name="revision" value="([0-9a-f-]{36})"/g)].at(-1)?.[1] ?? '';
check((await manager.post('sito-ripristina', { lang: 'it', beach, revision: firstRevision })).includes('ok=1'), 'editor: the revision was not restored');
const restored = await manager.get(editor);
check(restored.includes('Bozza numero 4') && (restored.match(/<td[^>]*>Archiviata<\/td>/g) ?? []).length === 2, 'editor: restore did not create draft 4 or changed the history');
check((await manager.get(`/bagni/${beach}`)).includes('tpl-boutique'), 'public page: a restore changed the site before publication');

const reception = new Visitor();
await reception.post('accesso', { lang: 'it', email: 'reception@bagnodelledune.example', password });
const readOnly = await reception.get(editor);
check(readOnly.includes('Revisioni') && !readOnly.includes('Salva la bozza'), 'front desk: can edit the website, or cannot read it');
check((await reception.post('sito-salva', { ...fields, version: await version(manager) })).includes('err=forbidden'), 'front desk: was allowed to save the website');
check(((await fetch(base + editor, { redirect: 'manual' })).headers.get('location') ?? '').endsWith('/area/accesso'), 'editor: reachable without signing in');

if (failures.length > 0) {
  console.error(`${failures.length} of ${checks} checks failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`All ${checks} checks passed on ${base}: draft, preview, publication, English, template change, conflict, restore.`);
