import { accountCreatedMail, accountExistsMail, bookingConfirmedMail, formatLongPeriod, periodDayCount, type MailProvider } from '@ombre/comms';
import { bookingAccessToken, bookingMailData, recordNotification, recordPlatformNotification, type Database, type OutboxHandler, type OutboxItem } from '@ombre/db';
import { accountPath, bookingPath, type Locale } from '@ombre/shared';

export interface HandlerOptions {
  db: Database;
  brand: string;
  siteUrl: string;
  signingSecret: string;
  /** Without a provider nothing is sent, and the notification is recorded as skipped. */
  mail: MailProvider | null;
}

export function createHandler({ db, brand, siteUrl, signingSecret, mail }: HandlerOptions): OutboxHandler {
  /** Platform mails of the account (D45): no beach club, recipient straight from the payload. */
  async function handleAccountMail(item: OutboxItem): Promise<void> {
    const { email, name, password } = item.payload;
    if (!email || !name) throw new Error(`${item.kind} without recipient`);
    if (item.kind === 'account.created' && !password) throw new Error('account.created without password');
    const locale: Locale = item.payload.locale === 'en' ? 'en' : 'it';
    const signInUrl = `${siteUrl}${accountPath(locale, 'signIn')}`;
    const message =
      item.kind === 'account.created'
        ? accountCreatedMail({ brand, locale, name, email, password: password!, signInUrl })
        : accountExistsMail({ brand, locale, name, email, signInUrl });
    if (mail) await mail.send(message);
    await recordPlatformNotification(db, {
      template: item.kind === 'account.created' ? 'account_created' : 'account_exists',
      locale,
      recipient: email,
      status: mail?.delivers ? 'sent' : 'skipped',
      provider: mail?.name ?? 'none',
      body: message.text,
    });
  }

  return async (item) => {
    if (item.kind === 'account.created' || item.kind === 'account.exists') return handleAccountMail(item);
    if (item.kind !== 'booking.confirmed') return;
    const bookingId = item.payload.bookingId;
    if (!bookingId) throw new Error('booking.confirmed without bookingId');
    // Platform work (NULL beach, D45) never carries this kind.
    if (!item.beachId) throw new Error('booking.confirmed without beach club');
    const data = await bookingMailData(db, item.beachId, bookingId);
    if (!data) throw new Error('booking not found');
    // A booking taken at the front desk has no address to write to.
    if (!data.guestEmail) return;

    const bookingUrl = `${siteUrl}${bookingPath(data.locale, data.beachSlug, data.bookingId)}?t=${bookingAccessToken(signingSecret, data.bookingId)}`;
    const message = bookingConfirmedMail(data.guestEmail, {
      brand,
      locale: data.locale,
      guestName: data.guestName,
      beachName: data.beachName,
      // The whole dal–al period of the group (D38), written out; one day reads as before.
      period: formatLongPeriod(data.from, data.to, data.locale),
      days: periodDayCount(data.from, data.to),
      spotCode: data.spotCode,
      code: data.code,
      totalCents: data.totalCents,
      bookingUrl,
    });
    if (mail) await mail.send(message);
    await recordNotification(db, item.beachId, {
      bookingId: data.bookingId,
      template: 'booking_confirmed',
      locale: data.locale,
      recipient: data.guestEmail,
      status: mail?.delivers ? 'sent' : 'skipped',
      provider: mail?.name ?? 'none',
      // The «Comunicazioni» page shows the text to copy by hand (spec §4.3).
      body: message.text,
    });
  };
}
