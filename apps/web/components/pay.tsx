import { notFound } from 'next/navigation';
import { config, formatMoney, getDictionary, pathFor, payPath, type Locale } from '@ombre/shared';
import { api, apiCall, formatDay, formatInstant } from '@/lib/api';
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
  spotCode: string;
  amountCents: number;
  expiresAt: string;
}

/** The shape of a signed token; anything else is refused like an unknown one. */
const tokenPattern = /^[A-Za-z0-9._-]{10,200}$/;

export async function PayView({ locale, token, query }: { locale: Locale; token: string; query: Query }) {
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

  if (!tokenPattern.test(token)) notFound();
  const result = await apiCall<PayRequestSummary>('GET', `/v1/pay-requests/${encodeURIComponent(token)}`);
  if (!result.ok) {
    if (result.status === 404) notFound();
    throw new Error(`API not available (${result.code})`);
  }
  const summary = result.data;
  // The public card of the club, only for its time zone: the deadline reads in local time.
  const card = await api.beach(summary.beach.slug);
  const timezone = card.ok ? card.data.beach.timezone : 'Europe/Rome';
  const sandbox = Boolean(process.env.OMBRE_SANDBOX_WEBHOOK_SECRET);
  const b = t.booking;
  const c = t.checkout;

  return (
    <PageShell locale={locale} page="help" highlight={false} alternatePath={payPath(otherLocale(locale), token)} crumbs={[{ label: p.title }]}>
      <PageHead title={p.title} lead={p.lead(summary.beach.name)} />
      {card.ok ? <DemoBadge locale={locale} beach={card.data.beach} /> : null}
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
            <div>
              <dt>{b.dayRow}</dt>
              <dd>{formatDay(summary.day, locale)}</dd>
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
