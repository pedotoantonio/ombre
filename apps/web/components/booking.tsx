import Link from 'next/link';
import { notFound } from 'next/navigation';
import QRCode from 'qrcode';
import { beachPath, bookingPath, bookingSegment, config, getDictionary } from '@ombre/shared';
import { apiCall, formatDay, uuidPattern, type ApiBeach, type ApiQuote } from '@/lib/api';
import { crumbsFor, DemoBadge, loadBeach, otherLocale, PriceSummary } from './beach';
import { PageHead, PageShell } from './PageShell';

interface ApiBooking extends ApiQuote {
  bookingId: string;
  code: string;
  status: 'draft' | 'under_review' | 'confirmed' | 'cancelled' | 'completed';
  paymentStatus: 'not_started' | 'in_progress' | 'succeeded' | 'failed' | 'under_review';
  paymentReference: string;
  day: string;
  spot: { code: string; rowNumber: number; umbrellas: number; sunbeds: number };
  passCredential: string | null;
  beach: ApiBeach;
}

/** The guest's booking page: payment while it is pending, then the pass. */
export async function BookingView({ lang, section, slug, step, bookingId, token }: { lang: string; section: string; slug: string; step: string; bookingId: string; token: string | undefined }) {
  const { locale, beach } = await loadBeach(lang, section, slug);
  if (step !== bookingSegment[locale] || !uuidPattern.test(bookingId) || !token || !/^[A-Za-z0-9_-]{20,200}$/.test(token)) notFound();
  const result = await apiCall<ApiBooking>('GET', `/v1/beaches/${beach.slug}/bookings/${bookingId}`, { token });
  if (!result.ok) {
    if (result.status === 404) notFound();
    throw new Error(`API not available (${result.code})`);
  }
  const booked = result.data;
  const t = getDictionary(locale, config.brandName);
  const c = t.checkout;
  const waiting = booked.status === 'under_review' && booked.paymentStatus === 'in_progress';
  const sandbox = Boolean(process.env.OMBRE_SANDBOX_WEBHOOK_SECRET);
  const statusLine = { draft: c.underReview, under_review: c.underReview, confirmed: c.confirmed, cancelled: c.cancelled, completed: c.completed }[booked.status];
  const qr = booked.passCredential ? await QRCode.toString(booked.passCredential, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }) : null;
  const common = { lang: locale, beach: beach.slug, booking: bookingId, t: token };

  return (
    <PageShell
      locale={locale}
      page="search"
      alternatePath={`${bookingPath(otherLocale(locale), beach.slug, bookingId)}?t=${token}`}
      crumbs={crumbsFor(locale, beach, booked.code)}
    >
      <PageHead title={c.bookingTitle(booked.code)} lead={statusLine} />
      <DemoBadge locale={locale} beach={beach} />
      <section className="section">
        <div className="container stack">
          {booked.status === 'cancelled' && booked.paymentStatus === 'succeeded' ? <p className="alert alert--info">{c.refundNote}</p> : null}
          {qr ? (
            <div className="panel">
              <h2>{c.passTitle}</h2>
              <p className="prose">{c.passLead}</p>
              <div className="pass">
                <div role="img" aria-label={c.passAlt} dangerouslySetInnerHTML={{ __html: qr }} />
                <p className="pass__code">
                  <span className="visually-hidden">{c.shortCode}: </span>
                  {booked.code}
                </p>
              </div>
              <p className="prose">{c.keepPrivate}</p>
            </div>
          ) : null}
          <PriceSummary
            locale={locale}
            quote={booked}
            rows={[
              [t.booking.dayRow, formatDay(booked.day, locale)],
              [t.booking.spotRow, `${booked.spot.code}, ${t.booking.row(booked.spot.rowNumber)}`],
              [t.booking.equipmentRow, t.booking.equipment(booked.spot.umbrellas, booked.spot.sunbeds)],
            ]}
          />
          {waiting && sandbox ? (
            <div className="panel">
              <h2>{c.sandboxTitle}</h2>
              <p className="prose">{c.sandboxLead}</p>
              <form method="post" action="/azioni/pagamento-prova" className="form-row">
                {Object.entries(common).map(([name, value]) => (
                  <input key={name} type="hidden" name={name} value={value} />
                ))}
                <button className="button" type="submit" name="outcome" value="succeeded">{c.sandboxPay}</button>
                <button className="button button--secondary" type="submit" name="outcome" value="failed">{c.sandboxFail}</button>
              </form>
            </div>
          ) : null}
          {waiting && !sandbox ? <p className="alert alert--info">{c.noProvider}</p> : null}
          <Link className="button button--secondary" href={`${beachPath(locale, beach.slug)}?day=${booked.day}`}>
            {t.booking.backToBeach}
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
