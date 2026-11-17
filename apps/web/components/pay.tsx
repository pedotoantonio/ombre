import { notFound } from 'next/navigation';
import { config, formatMoney, getDictionary, pathFor, payPath, type Locale } from '@ombre/shared';
import { api, apiCall, formatDay, formatInstant, formatPeriod, periodDays, type ApiBeach } from '@/lib/api';
import { Hidden } from './account';
import { DemoBadge, otherLocale } from './beach';
import { PageHead, PageShell } from './PageShell';

// The temporary public payment page /paga/{token} (spec §4.3): the essential summary the
// API gives — beach club, day, spot, amount, deadline — and the test payment, nothing
// else. No personal data ever reaches this page. Any unusable token answers notFound(),
// which the not-found boundary of this section turns into the same polite page, 404.

type Query = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

/** The public summary behind the link. Any unusable token answers 404 with no detail. */
interface PayRequestSummary {
  currency: string;
  status: 'pending';
  beach: { slug: string; name: string };
  day: string;
  /** The whole dal–al period of the booking group (D38); from = to = day for one day. */
  from: string;
  to: string;
  spotCode: string;
  amountCents: number;
  expiresAt: string;
}

/** The shape of a signed token; anything else is refused like an unknown one. */
const tokenPattern = /^[A-Za-z0-9._-]{10,200}$/;

/** What the page needs to draw a payable request: the API summary and the club's public card. */
export interface PayRequestData {
  summary: PayRequestSummary;
  timezone: string;
  beach: ApiBeach | null;
}

/**
 * Reads the summary behind a token, or null for any unusable one. The PAGE calls this
 * and answers notFound() itself, BEFORE returning any JSX: thrown from inside a nested
 * async component, notFound() comes after the document shell has been flushed and the
 * polite page would reach the visitor only through scripts — an empty page without
 * JavaScript (defect found by the wave B acceptance run).
 */
export async function loadPayRequest(token: string): Promise<PayRequestData | null> {
  if (!tokenPattern.test(token)) return null;
  const result = await apiCall<PayRequestSummary>('GET', `/v1/pay-requests/${encodeURIComponent(token)}`);
  if (!result.ok) {
    if (result.status === 404) return null;
    throw new Error(`API not available (${result.code})`);
  }
  // The public card of the club, only for its time zone: the deadline reads in local time.
  const card = await api.beach(result.data.beach.slug);
  return { summary: result.data, timezone: card.ok ? card.data.beach.timezone : 'Europe/Rome', beach: card.ok ? card.data.beach : null };
}

export function PayView({ locale, token, query, data }: { locale: Locale; token: string; query: Query; data: PayRequestData | null }) {
  const t = getDictionary(locale, config.brandName);
  const p = t.pay;
  const outcome = first(query.esito);

  // The confirmation after a successful payment: the link itself answers 404 by then,
  // so this page is generic on purpose and reveals nothing about any request.
  if (outcome === 'ok') {
    return (
      <PageShell locale={locale} page="help" highlight={false} alternatePath={`${payPath(otherLocale(locale), token)}?esito=ok`} crumbs={[{ label: p.paidTitle }]}>
        <PageHead title={p.paidTitle} lead={p.paidLead} />
        <section className="section">
          <div className="container">
            <p className="prose">{p.paidText}</p>
          </div>
        </section>
      </PageShell>
    );
  }

  // The page has already read the request: here the data is always in hand.
  if (!data) notFound();
  const { summary, timezone, beach } = data;
  const sandbox = Boolean(process.env.OMBRE_SANDBOX_WEBHOOK_SECRET);
  const b = t.booking;
  const c = t.checkout;

  return (
    <PageShell locale={locale} page="help" highlight={false} alternatePath={payPath(otherLocale(locale), token)} crumbs={[{ label: p.title }]}>
      <PageHead title={p.title} lead={p.lead(summary.beach.name)} />
      {beach ? <DemoBadge locale={locale} beach={beach} /> : null}
      <section className="section">
        <div className="container stack">
          {outcome === 'fallito' ? <p className="alert" role="alert">{p.failedNotice}</p> : null}
          {outcome === 'residuo' ? <p className="alert" role="alert">{p.notPayable}</p> : null}
          {outcome === 'errore' ? <p className="alert" role="alert">{t.account.errors.unavailable}</p> : null}
          <dl className="summary">
            <div>
              <dt>{p.beachRow}</dt>
              <dd>{summary.beach.name}</dd>
            </div>
            {/* Il periodo del gruppo nel riepilogo (D38): una giornata resta «Giorno». */}
            <div>
              <dt>{summary.from !== summary.to ? b.periodRow : b.dayRow}</dt>
              <dd>
                {summary.from !== summary.to
                  ? b.periodValue(formatPeriod(summary.from, summary.to, locale), periodDays(summary.from, summary.to))
                  : formatDay(summary.day, locale)}
              </dd>
            </div>
            <div>
              <dt>{b.spotRow}</dt>
              <dd>{summary.spotCode}</dd>
            </div>
            <div>
              <dt>{p.deadlineRow}</dt>
              <dd>{p.deadline(formatInstant(summary.expiresAt, locale, timezone))}</dd>
            </div>
            <div className="summary__total">
              <dt>{p.amountRow}</dt>
              <dd>{formatMoney(summary.amountCents, locale)}</dd>
            </div>
          </dl>
          {sandbox ? (
            <div className="panel">
              <h2>{c.sandboxTitle}</h2>
              <p className="prose">{c.sandboxLead}</p>
              <form method="post" action="/azioni/paga-prova" className="form-row">
                <Hidden values={{ lang: locale, token }} />
                <button className="button" type="submit" name="outcome" value="succeeded">{c.sandboxPay}</button>
                <button className="button button--secondary" type="submit" name="outcome" value="failed">{c.sandboxFail}</button>
              </form>
            </div>
          ) : (
            <p className="alert alert--info">{c.noProvider}</p>
          )}
        </div>
      </section>
    </PageShell>
  );
}

/** The polite page of an unusable link: identical for expired, cancelled, paid and unknown tokens. */
export function PayUnavailable({ locale }: { locale: Locale }) {
  const p = getDictionary(locale, config.brandName).pay;
  return (
    <PageShell locale={locale} page="help" highlight={false} alternatePath={pathFor('home', otherLocale(locale))} crumbs={[{ label: p.unavailableTitle }]}>
      <PageHead title={p.unavailableTitle} lead={p.unavailableLead} />
      <section className="section">
        <div className="container">
          <p className="prose">{p.unavailableText}</p>
        </div>
      </section>
    </PageShell>
  );
}
