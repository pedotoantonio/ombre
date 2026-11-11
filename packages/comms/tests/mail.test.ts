import { describe, expect, it } from 'vitest';
import { bookingConfirmedMail, formatLongDay } from '../src/index';

const base = { brand: 'Marchio', guestName: 'Ada', beachName: 'Bagno delle Dune', spotCode: 'B02', code: 'OM-270617-001', totalCents: 2700, bookingUrl: 'https://esempio.test/p/1' };

describe('booking confirmation mail', () => {
  it('is written in Italian with the amount and the day as an Italian reader expects', () => {
    const mail = bookingConfirmedMail('ada@example.org', { ...base, locale: 'it', day: formatLongDay('2027-06-17', 'it') });
    expect(mail.subject).toBe('Marchio: prenotazione OM-270617-001 confermata');
    expect(mail.text).toContain('giovedì 17 giugno 2027');
    expect(mail.text.replace(/\s/g, ' ')).toContain('27,00 €');
    expect(mail.text).toContain(base.bookingUrl);
  });

  it('is written in English for an English booking', () => {
    const mail = bookingConfirmedMail('ada@example.org', { ...base, locale: 'en', day: formatLongDay('2027-06-17', 'en') });
    expect(mail.subject).toBe('Marchio: booking OM-270617-001 confirmed');
    expect(mail.text).toMatch(/Thursday,? 17 June 2027/);
    expect(mail.text).toContain('€27.00');
    expect(mail.text).not.toMatch(/prenotazione|Giorno/);
  });
});
