import { formatMoney, type Locale } from '@ombre/shared';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface MailProvider {
  name: string;
  /** False for providers that only pretend, so nothing is recorded as sent when it was not. */
  delivers: boolean;
  send: (mail: Mail) => Promise<void>;
}

/** Development provider: writes what would be sent to the log and delivers nothing. */
export const logProvider: MailProvider = {
  name: 'log',
  delivers: false,
  send: async (mail) => {
    console.log(`[mail not delivered] to ${mail.to}: ${mail.subject}`);
  },
};

export interface BookingMail {
  brand: string;
  locale: Locale;
  guestName: string;
  beachName: string;
  /** Already written for the reader: the day, or the whole dal–al period written out
   * by formatLongPeriod, for example "da giovedì 17 giugno 2027 a sabato 19 giugno 2027". */
  period: string;
  /** Days of the period: beyond one, the mail speaks of the period and says the count. */
  days: number;
  spotCode: string;
  code: string;
  totalCents: number;
  bookingUrl: string;
}

const dateLocale: Record<Locale, string> = { it: 'it-IT', en: 'en-GB' };

export function formatLongDay(day: string, locale: Locale): string {
  return new Intl.DateTimeFormat(dateLocale[locale], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${day}T00:00:00Z`),
  );
}

/**
 * A dal–al period written out in full (D38): the one day as before, or both ends with
 * their weekday — "da giovedì 17 giugno 2027 a sabato 19 giugno 2027",
 * "from Thursday 17 June 2027 to Saturday 19 June 2027".
 */
export function formatLongPeriod(from: string, to: string, locale: Locale): string {
  if (from === to) return formatLongDay(from, locale);
  if (locale === 'en') return `from ${formatLongDay(from, 'en')} to ${formatLongDay(to, 'en')}`;
  return `da ${formatLongDay(from, 'it')} a ${formatLongDay(to, 'it')}`;
}

/** Days of a dal–al period, boundaries included: what the mails write next to the period. */
export function periodDayCount(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

export interface PaymentRequestMessage {
  brand: string;
  locale: Locale;
  guestName: string;
  beachName: string;
  /** Already written for the reader: the day, or the whole dal–al period from
   * formatLongPeriod — the request always names the full stay, never the first day alone. */
  period: string;
  spotCode: string;
  bookingCode: string;
  amountCents: number;
  /** Public page /paga/{token} where the guest pays with the test provider. */
  payUrl: string;
  /** Deadline already written for the reader, in the beach club's time zone. */
  deadline: string;
}

/**
 * The full text of a payment request (deposit or balance, spec §4.3). It is
 * queued in `notification` when the booking has an email, and in any case it
 * stays readable from the request detail and the «Comunicazioni» page, to be
 * copied by hand into WhatsApp or an email until a real provider exists.
 */
export function paymentRequestMessage(data: PaymentRequestMessage): { subject: string; text: string } {
  const amount = formatMoney(data.amountCents, data.locale);
  if (data.locale === 'en') {
    return {
      subject: `${data.brand}: payment request for booking ${data.bookingCode}`,
      text: [
        `Hello ${data.guestName},`,
        '',
        `${data.beachName} asks you for a payment of ${amount} for your booking ${data.bookingCode} (${data.period}, spot ${data.spotCode}).`,
        '',
        'You can pay securely on this page:',
        data.payUrl,
        '',
        `The link is valid until ${data.deadline}.`,
      ].join('\n'),
    };
  }
  return {
    subject: `${data.brand}: richiesta di pagamento per la prenotazione ${data.bookingCode}`,
    text: [
      `Ciao ${data.guestName},`,
      '',
      `${data.beachName} ti chiede un pagamento di ${amount} per la tua prenotazione ${data.bookingCode} (${data.period}, postazione ${data.spotCode}).`,
      '',
      'Puoi pagare in modo sicuro da questa pagina:',
      data.payUrl,
      '',
      `Il collegamento vale fino al ${data.deadline}.`,
    ].join('\n'),
  };
}

/** Deadline for the reader: date and time in the beach club's time zone. */
export function formatDeadline(instant: Date, locale: Locale, timezone: string): string {
  return new Intl.DateTimeFormat(dateLocale[locale], { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: timezone }).format(instant);
}

export interface AccountCreatedMail {
  brand: string;
  locale: Locale;
  name: string;
  email: string;
  /** The generated password (D44): it travels only in this mail, never in a page. */
  password: string;
  signInUrl: string;
}

/** Platform mail (D45): the new account with its generated password and the sign-in link. */
export function accountCreatedMail(data: AccountCreatedMail): Mail {
  if (data.locale === 'en') {
    return {
      to: data.email,
      subject: `${data.brand}: your account is ready`,
      text: [
        `Hello ${data.name},`,
        '',
        `your ${data.brand} account has been created for the email ${data.email}.`,
        '',
        `Temporary password: ${data.password}`,
        '',
        'Sign in on this page; you will be asked to choose your own password right away:',
        data.signInUrl,
        '',
        'Do not share this email: anyone who reads it can sign in to your account.',
      ].join('\n'),
    };
  }
  return {
    to: data.email,
    subject: `${data.brand}: il tuo conto è pronto`,
    text: [
      `Ciao ${data.name},`,
      '',
      `il tuo conto ${data.brand} è stato creato per l'email ${data.email}.`,
      '',
      `Password provvisoria: ${data.password}`,
      '',
      'Entra da questa pagina; ti verrà chiesto subito di scegliere una password tua:',
      data.signInUrl,
      '',
      'Non condividere questa email: chi la legge può entrare nel tuo conto.',
    ].join('\n'),
  };
}

export interface AccountExistsMail {
  brand: string;
  locale: Locale;
  name: string;
  email: string;
  signInUrl: string;
}

/** Platform mail (D45): the address already has an account; the answer on the page said nothing. */
export function accountExistsMail(data: AccountExistsMail): Mail {
  if (data.locale === 'en') {
    return {
      to: data.email,
      subject: `${data.brand}: you already have an account`,
      text: [
        `Hello ${data.name},`,
        '',
        `someone — probably you — asked to create a ${data.brand} account for the email ${data.email}, but an account with this email already exists.`,
        '',
        'You can sign in on this page with your password:',
        data.signInUrl,
        '',
        'If the request was not yours you can ignore this email: your account has not changed.',
      ].join('\n'),
    };
  }
  return {
    to: data.email,
    subject: `${data.brand}: hai già un conto`,
    text: [
      `Ciao ${data.name},`,
      '',
      `qualcuno — probabilmente tu — ha chiesto di creare un conto ${data.brand} per l'email ${data.email}, ma un conto con questa email esiste già.`,
      '',
      'Puoi entrare da questa pagina con la tua password:',
      data.signInUrl,
      '',
      'Se la richiesta non è tua puoi ignorare questa email: il tuo conto non è cambiato.',
    ].join('\n'),
  };
}

export function bookingConfirmedMail(to: string, data: BookingMail): Mail {
  const total = formatMoney(data.totalCents, data.locale);
  // Beyond one day the mail names the whole dal–al period (D38), with the count of days,
  // and says that the one pass is valid on every day of the stay.
  const period = data.days > 1;
  if (data.locale === 'en') {
    return {
      to,
      subject: `${data.brand}: booking ${data.code} confirmed`,
      text: [
        `Hello ${data.guestName},`,
        '',
        `your booking at ${data.beachName} is confirmed.`,
        '',
        period ? `Period: ${data.period} (${data.days} days)` : `Day: ${data.period}`,
        `Spot: ${data.spotCode}`,
        `Booking code: ${data.code}`,
        `Total paid: ${total}`,
        '',
        period
          ? 'Your pass, one for the whole stay and valid on every day, with the QR code to show at the front desk, is on this page:'
          : 'Your pass, with the QR code to show at the front desk, is on this page:',
        data.bookingUrl,
        '',
        'Keep this link to yourself: anyone who has it can see the pass.',
      ].join('\n'),
    };
  }
  return {
    to,
    subject: `${data.brand}: prenotazione ${data.code} confermata`,
    text: [
      `Ciao ${data.guestName},`,
      '',
      `la tua prenotazione presso ${data.beachName} è confermata.`,
      '',
      period ? `Periodo: ${data.period} (${data.days} giornate)` : `Giorno: ${data.period}`,
      `Postazione: ${data.spotCode}`,
      `Codice prenotazione: ${data.code}`,
      `Totale pagato: ${total}`,
      '',
      period
        ? 'Il tuo pass, unico per tutto il soggiorno e valido ogni giornata, con il codice QR da mostrare alla reception, è in questa pagina:'
        : 'Il tuo pass, con il codice QR da mostrare alla reception, è in questa pagina:',
      data.bookingUrl,
      '',
      'Non condividere questo collegamento: chi lo possiede può vedere il pass.',
    ].join('\n'),
  };
}
