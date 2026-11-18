import { describe, expect, it } from 'vitest';
import { accountCreatedMail, accountExistsMail } from '../src/index';

const base = { brand: 'Marchio', name: 'Ada', email: 'ada@example.org', signInUrl: 'https://esempio.test/it/area/accesso' };

describe('account created mail', () => {
  it('carries the generated password, the sign-in link and the warning, in Italian', () => {
    const mail = accountCreatedMail({ ...base, locale: 'it', password: 'xkcd2345abcd6789' });
    expect(mail.to).toBe('ada@example.org');
    expect(mail.subject).toBe('Marchio: il tuo conto è pronto');
    expect(mail.text).toContain("Parola d'ordine provvisoria: xkcd2345abcd6789");
    expect(mail.text).toContain(base.signInUrl);
    expect(mail.text).toContain('Non condividere questa email');
  });

  it('is written in English for an English registration', () => {
    const mail = accountCreatedMail({ ...base, locale: 'en', password: 'xkcd2345abcd6789' });
    expect(mail.subject).toBe('Marchio: your account is ready');
    expect(mail.text).toContain('Temporary password: xkcd2345abcd6789');
    expect(mail.text).toContain('Do not share this email');
    expect(mail.text).not.toMatch(/parola|Ciao/);
  });
});

describe('account exists mail', () => {
  it('says the account already exists without changing anything, in Italian', () => {
    const mail = accountExistsMail({ ...base, locale: 'it' });
    expect(mail.subject).toBe('Marchio: hai già un conto');
    expect(mail.text).toContain('esiste già');
    expect(mail.text).toContain('il tuo conto non è cambiato');
    expect(mail.text).toContain(base.signInUrl);
    expect(mail.text).not.toContain("provvisoria");
  });

  it('is written in English for an English registration', () => {
    const mail = accountExistsMail({ ...base, locale: 'en' });
    expect(mail.subject).toBe('Marchio: you already have an account');
    expect(mail.text).toContain('already exists');
    expect(mail.text).toContain('your account has not changed');
    expect(mail.text).not.toMatch(/conto|Ciao/);
  });
});
