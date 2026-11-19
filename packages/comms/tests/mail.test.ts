import { describe, expect, it } from 'vitest';
import { bookingConfirmedMail, formatLongPeriod, paymentRequestMessage, periodDayCount } from '../src/index';

const base = { brand: 'Marchio', guestName: 'Ada', beachName: 'Bagno delle Dune', spotCode: 'B02', code: 'OM-270617-001', totalCents: 2700, paidCents: 2700, bookingUrl: 'https://esempio.test/p/1' };
const oneDay = { period: formatLongPeriod('2027-06-17', '2027-06-17', 'it'), days: 1 };

describe('booking confirmation mail', () => {
  it('is written in Italian with the amount and the day as an Italian reader expects', () => {
    const mail = bookingConfirmedMail('ada@example.org', { ...base, locale: 'it', ...oneDay });
    expect(mail.subject).toBe('Marchio: prenotazione OM-270617-001 confermata');
    expect(mail.text).toContain('Giorno: giovedì 17 giugno 2027');
    expect(mail.text.replace(/\s/g, ' ')).toContain('Totale: 27,00 €');
    expect(mail.text.replace(/\s/g, ' ')).toContain('Pagato adesso: 27,00 €');
    expect(mail.text).toContain('Nulla da saldare.');
    expect(mail.text).toContain(base.bookingUrl);
  });

  it('is written in English for an English booking', () => {
    const mail = bookingConfirmedMail('ada@example.org', { ...base, locale: 'en', period: formatLongPeriod('2027-06-17', '2027-06-17', 'en'), days: 1 });
    expect(mail.subject).toBe('Marchio: booking OM-270617-001 confirmed');
    expect(mail.text).toMatch(/Day: Thursday,? 17 June 2027/);
    expect(mail.text).toContain('Total: €27.00');
    expect(mail.text).toContain('Paid now: €27.00');
    expect(mail.text).toContain('Nothing left to pay.');
    expect(mail.text).not.toMatch(/prenotazione|Giorno/);
  });

  // The dal–al period (D38): the mail names the whole stay and the pass valid every day.
  it('names the whole dal–al period, its days and the single pass of the stay', () => {
    const period = formatLongPeriod('2027-06-17', '2027-06-19', 'it');
    expect(period).toBe('da giovedì 17 giugno 2027 a sabato 19 giugno 2027');
    const mail = bookingConfirmedMail('ada@example.org', { ...base, locale: 'it', totalCents: 9000, paidCents: 9000, period, days: periodDayCount('2027-06-17', '2027-06-19') });
    expect(mail.text).toContain('Periodo: da giovedì 17 giugno 2027 a sabato 19 giugno 2027 (3 giornate)');
    expect(mail.text).toContain('unico per tutto il soggiorno e valido ogni giornata');
    expect(mail.text).not.toContain('Giorno:');
    const english = bookingConfirmedMail('ada@example.org', { ...base, locale: 'en', totalCents: 9000, paidCents: 9000, period: formatLongPeriod('2027-06-17', '2027-06-19', 'en'), days: 3 });
    expect(english.text).toMatch(/Period: from Thursday,? 17 June 2027 to Saturday,? 19 June 2027 \(3 days\)/);
    expect(english.text).toContain('one for the whole stay and valid on every day');
  });

  // D52: the mail stops saying «Totale pagato» when it is not true.
  it('says total, paid now and the balance to settle after a deposit, exactly as written', () => {
    const mail = bookingConfirmedMail('ada@example.org', { ...base, locale: 'it', totalCents: 10000, paidCents: 3000, ...oneDay });
    expect(mail.text.replace(/\s/g, ' ')).toContain('Totale: 100,00 €');
    expect(mail.text.replace(/\s/g, ' ')).toContain('Pagato adesso: 30,00 €');
    expect(mail.text.replace(/\s/g, ' ')).toContain("Da saldare all'arrivo: 70,00 €");
    expect(mail.text).not.toContain('Totale pagato');
    const english = bookingConfirmedMail('ada@example.org', { ...base, locale: 'en', totalCents: 10000, paidCents: 3000, period: formatLongPeriod('2027-06-17', '2027-06-17', 'en'), days: 1 });
    expect(english.text).toContain('Total: €100.00');
    expect(english.text).toContain('Paid now: €30.00');
    expect(english.text).toContain('To pay on arrival: €70.00');
  });

  // The desk's «da incassare» was lied about by «Totale pagato»: written correction.
  it('says «Da incassare all\'arrivo» for a desk booking with nothing paid yet', () => {
    const mail = bookingConfirmedMail('ada@example.org', { ...base, locale: 'it', totalCents: 2700, paidCents: 0, ...oneDay });
    expect(mail.text.replace(/\s/g, ' ')).toContain("Da incassare all'arrivo: 27,00 €");
    expect(mail.text).not.toContain('Pagato adesso');
    expect(mail.text).not.toContain('Totale pagato');
    const english = bookingConfirmedMail('ada@example.org', { ...base, locale: 'en', totalCents: 2700, paidCents: 0, period: formatLongPeriod('2027-06-17', '2027-06-17', 'en'), days: 1 });
    expect(english.text).toContain('To be collected on arrival: €27.00');
  });
});

describe('payment request message', () => {
  const request = {
    brand: 'Marchio',
    guestName: 'Ada',
    beachName: 'Bagno delle Dune',
    spotCode: 'B02',
    bookingCode: 'OM-270617-001',
    amountCents: 7000,
    payUrl: 'https://esempio.test/paga/abc',
    deadline: '19 giugno 2027, 10:00',
  };

  it('cites the whole dal–al period instead of the first day alone', () => {
    const message = paymentRequestMessage({ ...request, locale: 'it', period: formatLongPeriod('2027-06-17', '2027-06-19', 'it') });
    expect(message.text).toContain('(da giovedì 17 giugno 2027 a sabato 19 giugno 2027, postazione B02)');
    expect(message.text).toContain(request.payUrl);
  });

  it('keeps the single day as it was', () => {
    const message = paymentRequestMessage({ ...request, locale: 'it', period: formatLongPeriod('2027-06-17', '2027-06-17', 'it') });
    expect(message.text).toContain('(giovedì 17 giugno 2027, postazione B02)');
  });
});
