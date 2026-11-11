import { bookingConfirmedMail, formatLongDay, type MailProvider } from '@ombre/comms';
import { bookingAccessToken, bookingMailData, recordNotification, type Database, type OutboxHandler } from '@ombre/db';
import { bookingPath } from '@ombre/shared';

export interface HandlerOptions {
  db: Database;
  brand: string;
  siteUrl: string;
  signingSecret: string;
  /** Without a provider nothing is sent, and the notification is recorded as skipped. */
  mail: MailProvider | null;
}

export function createHandler({ db, brand, siteUrl, signingSecret, mail }: HandlerOptions): OutboxHandler {
  return async (item) => {
    if (item.kind !== 'booking.confirmed') return;
    const bookingId = item.payload.bookingId;
    if (!bookingId) throw new Error('booking.confirmed without bookingId');
    const data = await bookingMailData(db, item.beachId, bookingId);
    if (!data) throw new Error('booking not found');

    const bookingUrl = `${siteUrl}${bookingPath(data.locale, data.beachSlug, data.bookingId)}?t=${bookingAccessToken(signingSecret, data.bookingId)}`;
    const message = bookingConfirmedMail(data.guestEmail, {
      brand,
      locale: data.locale,
      guestName: data.guestName,
      beachName: data.beachName,
      day: formatLongDay(data.day, data.locale),
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
    });
  };
}
