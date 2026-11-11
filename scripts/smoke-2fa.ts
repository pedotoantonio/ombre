// Switches two-step verification on for the demo accounting sign-in, through the site,
// then signs in again with and without the code. Run it last: that account then needs a code.
// Needs OMBRE_SEED_DEMO=true and OMBRE_DEMO_PASSWORD.
// Usage: node scripts/smoke-2fa.ts [site address]   (default http://127.0.0.1:3210)
import { createHmac } from 'node:crypto';

const base = (process.argv[2] ?? 'http://127.0.0.1:3210').replace(/\/+$/, '');
const password = process.env.OMBRE_DEMO_PASSWORD ?? '';
const email = 'contabilita@bagnodelledune.example';
const failures: string[] = [];
let checks = 0;
let cookie = '';

function check(condition: boolean, message: string): void {
  checks += 1;
  if (!condition) failures.push(message);
}

function decodeBase32(text: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const letter of text) {
    value = (value << 5) | alphabet.indexOf(letter);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function totp(secret: string, offsetSteps = 0): string {
  const step = Buffer.alloc(8);
  step.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000) + offsetSteps));
  const digest = createHmac('sha1', decodeBase32(secret)).update(step).digest();
  const offset = digest[19]! & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

async function get(path: string): Promise<{ html: string; location: string }> {
  const response = await fetch(base + path, { redirect: 'manual', headers: cookie ? { Cookie: cookie } : {} });
  return { html: await response.text(), location: response.headers.get('location') ?? '' };
}

async function post(action: string, fields: Record<string, string>): Promise<string> {
  const response = await fetch(`${base}/azioni/${action}`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: base, 'X-Forwarded-For': '198.51.100.4', ...(cookie ? { Cookie: cookie } : {}) },
    body: new URLSearchParams(fields).toString(),
  });
  const set = response.headers.get('set-cookie');
  if (set) cookie = set.includes('Max-Age=0') ? '' : (set.split(';')[0] ?? '');
  return response.headers.get('location') ?? `status ${response.status}`;
}

if (!password) {
  console.error('Set OMBRE_DEMO_PASSWORD to the value the stack was started with.');
  process.exit(1);
}

check((await post('accesso', { lang: 'it', email, password })).endsWith('/area/profilo'), 'sign-in: the demo accounting sign-in does not work (already protected by a code?)');
check((await get('/area/profilo')).html.includes('Attiva la verifica in due passaggi'), 'overview: two-step verification is not offered');

const setup = await get('/area/verifica');
const secret = (/<code>([A-Z2-7 ]{32,48})<\/code>/.exec(setup.html)?.[1] ?? '').replaceAll(' ', '');
check(secret.length === 32 && /<svg[^>]*viewBox/.test(setup.html), 'setup: no key or no QR code');
check((await post('verifica-conferma', { lang: 'it', code: '000000' })).includes('err=totp_invalid'), 'setup: a wrong code switched it on');

// Each visit of the setup page issues a new key: read the one that is current.
const again = await get('/area/verifica');
const current = (/<code>([A-Z2-7 ]{32,48})<\/code>/.exec(again.html)?.[1] ?? '').replaceAll(' ', '');
check(current !== secret, 'setup: the key did not change on a new visit');
check((await post('verifica-conferma', { lang: 'it', code: totp(current) })).includes('/area/profilo'), 'setup: the right code did not switch it on');
check((await get('/area/profilo')).html.includes('Attiva: a ogni accesso'), 'overview: two-step verification is not shown as on');
check((await get('/area/verifica')).location.endsWith('/area/profilo'), 'setup: still reachable once switched on');

await post('uscita', { lang: 'it' });
check((await post('accesso', { lang: 'it', email, password })).includes('err=totp_required'), 'sign-in: the password alone was enough');
check((await post('accesso', { lang: 'it', email, password, code: totp(current) })).includes('err=invalid_credentials'), 'sign-in: a code already used was accepted');
check((await post('accesso', { lang: 'it', email, password, code: totp(current, 1) })).endsWith('/area/profilo'), 'sign-in: password and a fresh code were refused');

if (failures.length > 0) {
  console.error(`${failures.length} of ${checks} checks failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log(`All ${checks} checks passed on ${base}: two-step verification switched on and required at sign-in.`);
