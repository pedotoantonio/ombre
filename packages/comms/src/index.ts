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
  /** Already written for the reader, for example "giovedì 17 giugno 2027". */
  day: string;
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

export interface PaymentRequestMessage {
  brand: string;
  locale: Locale;
  guestName: string;
  beachName: string;
  /** Already written for the reader, for example "giovedì 17 giugno 2027". */
  day: string;
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
        `${data.beachName} asks you for a payment of ${amount} for your booking ${data.bookingCode} (${data.day}, spot ${data.spotCode}).`,
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
      `${data.beachName} ti chiede un pagamento di ${amount} per la tua prenotazione ${data.bookingCode} (${data.day}, postazione ${data.spotCode}).`,
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

export function bookingConfirmedMail(to: string, data: BookingMail): Mail {
  const total = formatMoney(data.totalCents, data.locale);
  if (data.locale === 'en') {
    return {
      to,
      subject: `${data.brand}: booking ${data.code} confirmed`,
      text: [
        `Hello ${data.guestName},`,
        '',
        `your booking at ${data.beachName} is confirmed.`,
        '',
        `Day: ${data.day}`,
        `Spot: ${data.spotCode}`,
        `Booking code: ${data.code}`,
        `Total paid: ${total}`,
        '',
        'Your pass, with the QR code to show at the front desk, is on this page:',
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
      `Giorno: ${data.day}`,
      `Postazione: ${data.spotCode}`,
      `Codice prenotazione: ${data.code}`,
      `Totale pagato: ${total}`,
      '',
      'Il tuo pass, con il codice QR da mostrare alla reception, è in questa pagina:',
      data.bookingUrl,
      '',
      'Non condividere questo collegamento: chi lo possiede può vedere il pass.',
    ].join('\n'),
  };
}
