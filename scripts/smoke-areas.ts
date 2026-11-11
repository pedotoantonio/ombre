// Walks the reserved areas of the running site as a browser without scripts:
// guest payment and pass, sign-in, management, front desk, season holder.
// Needs OMBRE_SEED_DEMO=true, OMBRE_DEMO_PASSWORD and the test payment provider switched on.
// Usage: node scripts/smoke-areas.ts [site address]   (default http://127.0.0.1:3210)

const base = (process.argv[2] ?? 'http://127.0.0.1:3210').replace(/\/+$/, '');
const password = process.env.OMBRE_DEMO_PASSWORD ?? '';
const beach = 'bagno-delle-dune';
const day = '2027-06-17';
const failures: string[] = [];
let checks = 0;

function check(condition: boolean, message: string): void {
  checks += 1;
  if (!condition) failures.push(message);
}

/** A visitor: keeps its own cookies, like a browser profile. */
class Visitor {
  private cookie = '';

  async get(path: string): Promise<{ status: number; html: string; location: string }> {
    const response = await fetch(base + path, { redirect: 'manual', headers: this.cookie ? { Cookie: this.cookie } : {} });
    return { status: response.status, html: (await response.text()).replaceAll('&amp;', '&'), location: response.headers.get('location') ?? '' };
  }

  async post(action: string, fields: Record<string, string | string[]>): Promise<string> {
    const body = new URLSearchParams();
    for (const [name, value] of Object.entries(fields)) for (const item of [value].flat()) body.append(name, item);
    const response = await fetch(`${base}/azioni/${action}`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: base, 'X-Forwarded-For': '198.51.100.1', ...(this.cookie ? { Cookie: this.cookie } : {}) },
      body: body.toString(),
    });
    const set = response.headers.get('set-cookie');
    if (set) this.cookie = set.includes('Max-Age=0') ? '' : (set.split(';')[0] ?? '');
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

/** Spots drawn on the map of the public page: links for the free ones, plain marks for the others. */
async function mapOf(onDay: string): Promise<{ free: number; taken: number }> {
  const html = (await new Visitor().get(`/bagni/${beach}?day=${onDay}`)).html;
  return { free: (html.match(/<a class="plan-spot /g) ?? []).length, taken: (html.match(/class="plan-spot plan-spot--taken"/g) ?? []).length };
}

// ---- Guest: hold, details, test payment, pass ----
const guest = new Visitor();
const club = await guest.get(`/bagni/${beach}`);
check(/<a class="plan-spot plan-spot--shared"[^>]*>(?:(?!<\/a>)[^])*>B02</.test(club.html), 'public page: B02 is not drawn as a shared day on the map');
// B02 is the shared spot of the demo: buying it also exercises the season holder share.
const card = club.html.split('<li class="spot">').find((part) => part.startsWith('<span class="spot__code">B02<')) ?? '';
const link = /href="(\/bagni\/bagno-delle-dune\/prenota\?spot=([0-9a-f-]{36})&day=2027-06-17)"/.exec(card);
if (!link) {
  console.error('No free spot on the demo day: start from a fresh database.');
  process.exit(1);
}
const spotId = link[2]!;
const summary = await guest.get(`${link[1]}&promo=MARE10`);
const key = /name="key" value="(web-[0-9a-f-]{36})"/.exec(summary.html)?.[1] ?? '';
const holdUrl = await guest.post('riserva', { lang: 'it', beach, spot: spotId, day, promo: 'MARE10', key });
const holdPage = await guest.get(holdUrl);
check(holdPage.html.includes('name="email"') && holdPage.html.includes('Vai al pagamento'), 'hold page: no form for the guest details');

const holdId = holdUrl.split('/').at(-1)!;
const bookingUrl = await guest.post('prenotazione', { lang: 'it', beach, hold: holdId, name: 'Ospite di Prova', email: 'ospite@example.org' });
check(/\/prenotazione\/[0-9a-f-]{36}\?t=[A-Za-z0-9_-]{40,}$/.test(bookingUrl), `checkout: redirected to ${bookingUrl}`);
const pending = await guest.get(bookingUrl);
check(pending.html.includes('Pagamento di prova') && !pending.html.includes('Il tuo pass'), 'booking page: test payment not offered, or pass shown before payment');
check(/<meta name="robots" content="noindex/.test(pending.html), 'booking page: must not be indexable');
check((await guest.get(bookingUrl.replace(/\?t=.*/, '?t=token-inventato-abbastanza-lungo'))).status === 404, 'booking page: opened with a wrong token');

const [, bookingId = '', token = ''] = /\/prenotazione\/([0-9a-f-]{36})\?t=(.+)$/.exec(bookingUrl) ?? [];
await guest.post('pagamento-prova', { lang: 'it', beach, booking: bookingId, t: token, outcome: 'succeeded' });
const paid = await guest.get(bookingUrl);
const code = /OM-270617-\d{3}/.exec(paid.html)?.[0] ?? '';
check(paid.html.includes('Prenotazione confermata') && paid.html.includes('Il tuo pass') && /<svg[^>]*viewBox/.test(paid.html), 'booking page: no confirmation or no QR after payment');
check(code !== '' && paid.html.includes('27,00'), 'booking page: no short code or wrong total');
check(!paid.html.includes('Pagamento di prova'), 'booking page: payment still offered after confirmation');
const english = await guest.get(bookingUrl.replace('/bagni/', '/en/beach-clubs/').replace('/prenotazione/', '/booking/'));
check(english.html.includes('Booking confirmed') && english.html.includes('Your pass'), 'booking page: not available in English');

// ---- Sign-in ----
const manager = new Visitor();
check((await manager.get(`/area/gestione/${beach}`)).location.endsWith('/area/accesso'), 'management: reachable without signing in');
check((await manager.signIn('gestore@bagnodelledune.example', 'password-sbagliata')).includes('err=invalid_credentials'), 'sign-in: wrong password not refused');
check((await manager.signIn('gestore@bagnodelledune.example')).endsWith('/area/profilo'), 'sign-in: manager not signed in');
const overview = await manager.get('/area/profilo');
check(overview.html.includes('Bagno delle Dune') && overview.html.includes('Gestore'), 'overview: beach club and role not shown');
check((await manager.get('/en/account/overview')).html.includes('Your area'), 'overview: not available in English');

// ---- Manager: the day just sold, then a new day ----
const sold = await manager.get(`/area/gestione/${beach}?day=${day}`);
check(sold.html.includes(code) && sold.html.includes('Venduta') && sold.html.includes('Ospite di Prova'), 'management: the confirmed booking is not shown');
check(sold.html.includes('Riepilogo economico') && sold.html.includes('Stagionali'), 'management: the financial summary is missing');

const newDay = '2027-06-20';
check((await manager.post('gestione-pubblica', { lang: 'it', beach, day: newDay, price: '32,50' })).includes('ok=1'), 'management: the day was not published');
check((await manager.post('gestione-pubblica', { lang: 'it', beach, day: newDay, price: 'trenta' })).includes('err=invalid_request'), 'management: a price in words was accepted');
const published = await manager.get(`/area/gestione/${beach}?day=${newDay}`);
check((published.html.match(/Libera/g) ?? []).length >= 8 && published.html.includes('32,50'), 'management: published spots not listed as free at 32,50');
const firstSpot = /name="spot" value="([0-9a-f-]{36})"/.exec(published.html)?.[1] ?? '';
check((await manager.post('gestione-blocco', { lang: 'it', beach, day: newDay, spot: firstSpot, blocked: 'yes' })).includes('ok=1'), 'management: the spot was not blocked');
check((await manager.get(`/area/gestione/${beach}?day=${newDay}`)).html.includes('Bloccata'), 'management: the block is not shown');
check(((await guest.get(`/bagni/${beach}?day=${newDay}`)).html.match(/class="spot__code"/g) ?? []).length === 7, 'public page: a blocked spot is still on sale');
check(JSON.stringify(await mapOf(newDay)) === JSON.stringify({ free: 7, taken: 1 }), 'public page: the map does not draw the blocked spot as unavailable');
check(JSON.stringify(await mapOf('2027-06-21')) === JSON.stringify({ free: 0, taken: 8 }), 'public page: a day never published is not drawn as fully unavailable');

// ---- Front desk: can check passes, cannot change prices ----
const reception = new Visitor();
await reception.signIn('reception@bagnodelledune.example');
const desk = await reception.get(`/area/gestione/${beach}?day=${day}`);
check(desk.html.includes('Verifica del pass') && !desk.html.includes('Cambia prezzo') && !desk.html.includes('Riepilogo economico'), 'front desk: sees more or less than its role allows');
check((await reception.post('gestione-prezzo', { lang: 'it', beach, day, spot: spotId, price: '1' })).includes('err=forbidden'), 'front desk: was allowed to change a price');
const scan = await reception.post('reception-accesso', { lang: 'it', beach, day, credential: code, kind: 'entry' });
check(scan.includes('err=wrong_day'), `front desk: a pass for ${day} was accepted today (${scan})`);
check((await reception.get(scan)).html.includes('Questa prenotazione è per un altro giorno'), 'front desk: the refusal is not explained');

// ---- Front desk booking, move, cancellation by the manager ----
const deskPage = await reception.get(`/area/gestione/${beach}?day=${newDay}`);
const freeSpot = /id="banco-postazione"[^>]*>\s*<option value="([0-9a-f-]{36})"/.exec(deskPage.html)?.[1] ?? '';
const booked = await reception.post('banco-prenota', { lang: 'it', beach, day: newDay, spot: freeSpot, name: 'Cliente al banco' });
const deskCode = /OM-270620-\d{3}/.exec(decodeURIComponent(booked))?.[0] ?? '';
check(deskCode !== '', `front desk: the desk booking was not registered (${booked})`);
check(((await guest.get(`/bagni/${beach}?day=${newDay}`)).html.match(/class="spot__code"/g) ?? []).length === 6, 'public page: a spot booked at the desk is still on sale');
check(JSON.stringify(await mapOf(newDay)) === JSON.stringify({ free: 6, taken: 2 }), 'public page: the map still offers the spot booked at the desk');

const afterDesk = await reception.get(`/area/gestione/${beach}?day=${newDay}`);
const otherSpot = new RegExp(`name="code" value="${deskCode}"[^]*?<option value="([0-9a-f-]{36})"`).exec(afterDesk.html)?.[1] ?? '';
check((await reception.post('banco-sposta', { lang: 'it', beach, day: newDay, code: deskCode, spot: otherSpot })).includes('ok=1'), 'front desk: the booking was not moved');
check(((await guest.get(`/bagni/${beach}?day=${newDay}`)).html.match(/class="spot__code"/g) ?? []).length === 6, 'public page: moving a booking changed the number of free spots');
check((await reception.post('gestione-annulla', { lang: 'it', beach, day: newDay, code: deskCode })).includes('err=forbidden'), 'front desk: was allowed to cancel a booking');
check((await manager.post('gestione-annulla', { lang: 'it', beach, day: newDay, code: deskCode })).includes('ok=1'), 'management: the booking was not cancelled');
check(((await guest.get(`/bagni/${beach}?day=${newDay}`)).html.match(/class="spot__code"/g) ?? []).length === 7, 'public page: a cancelled booking did not free its spot');
check((await manager.get(`/area/gestione/${beach}?day=${newDay}`)).html.includes('Annullata'), 'management: the cancellation is not shown');

// ---- Season holder: propose, wait for approval, withdraw ----
const holder = new Visitor();
await holder.signIn('stagionale@bagnodelledune.example');
// The holder may have season passes in other beach clubs too: take the one of this beach club.
const passCard = (await holder.get('/area/profilo')).html.split('<li class="card"').find((part) => part.includes('Bagno delle Dune') && part.includes('/area/stagionale/')) ?? '';
const seasonUrl = /href="(\/area\/stagionale\/[0-9a-f-]{36})"/.exec(passCard)?.[1] ?? '';
check(seasonUrl !== '', 'season holder: the season pass is not listed');
const proposed = await holder.post('stagionale-proponi', { lang: 'it', contract: seasonUrl.split('/').at(-1)!, from: '2027-07-05', to: '2027-07-11', weekday: ['2', '4'] });
check(decodeURIComponent(proposed.replaceAll('+', ' ')).includes('Aggiunte 2'), `season holder: proposal summary is "${proposed}"`);
const statement = await holder.get(seasonUrl);
check((statement.html.match(/<td>In attesa<\/td>/g) ?? []).length === 2, 'season holder: the two proposed days are not waiting');
check(statement.html.includes('13,50') && !statement.html.includes('Ospite di Prova') && !statement.html.includes('example.org'), 'season holder: share missing or guest data visible');

const waiting = await manager.get(`/area/gestione/${beach}?day=${day}`);
const proposal = /name="proposal" value="([0-9a-f-]{36})"/.exec(waiting.html)?.[1] ?? '';
check((await manager.post('gestione-proposta', { lang: 'it', beach, day, proposal, approve: 'yes' })).includes('ok=1'), 'management: the proposal was not approved');
check((await holder.get(seasonUrl)).html.includes('Autorizzata'), 'season holder: the approval is not shown');
check((await guest.get(`/bagni/${beach}?day=2027-07-06`)).html.includes('Giornata condivisa'), 'public page: the approved shared day is not on sale');
check((await guest.get('/esplora?day=2027-07-06&guests=2&shared=1')).html.includes('1 postazione libera<'), 'explore: the approved shared day is not found by the search');
check((await holder.post('stagionale-ritira', { lang: 'it', contract: seasonUrl.split('/').at(-1)!, day: '2027-07-06' })).includes('ok=1'), 'season holder: could not withdraw a free day');
check(!(await guest.get(`/bagni/${beach}?day=2027-07-06`)).html.includes('class="spot__code"'), 'public page: a withdrawn day is still on sale');
check(JSON.stringify(await mapOf('2027-07-06')) === JSON.stringify({ free: 0, taken: 8 }), 'public page: the map still offers a withdrawn day');

// ---- Sign-out and other roles ----
await manager.post('uscita', { lang: 'it' });
check((await manager.get('/area/profilo')).location.endsWith('/area/accesso'), 'sign-out: the area is still reachable');
check((await holder.get(`/area/gestione/${beach}`)).status === 404, 'season holder: reached the management of the beach club');

if (failures.length > 0) {
  console.error(`${failures.length} of ${checks} checks failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`All ${checks} checks passed on ${base}: booking ${code} paid and passed, management, front desk and season holder areas.`);
