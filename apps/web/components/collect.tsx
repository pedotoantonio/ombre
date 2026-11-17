import Link from 'next/link';
import { notFound } from 'next/navigation';
import { accountPath, can, config, formatMoney, getDictionary, locales, manageCollectPath, type Locale } from '@ombre/shared';
import { api, apiCall, formatDay, formatInstant, slugPattern, type ApiExtraService } from '@/lib/api';
import { Hidden, Notice, requireMe } from './account';
import { ExtraQuantityFields } from './beach';
import { ManageShell } from './manage-shell';
import { PageHead } from './PageShell';
import { Cell, DataTable, Row } from './table';

// Collections and payment requests of one booking (spec §4.3, D31): total, paid and
// balance, the collection at the desk, the payment requests with the public /paga link
// and the text to copy, and the extras added after the sale. Reading needs bookings.read,
// every action bookings.create; everything works without JavaScript, like the whole desk.

type Query = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

/** A booking code as the pass writes it: the only key this page accepts. */
const bookingCodePattern = /^OM-\d{6}-\d{3}$/i;

interface RequestRow {
  requestId: string;
  amountCents: number;
  status: 'pending' | 'paid' | 'expired' | 'cancelled';
  expiresAt: string;
  note: string | null;
  createdAt: string;
  closedAt: string | null;
  payUrl: string;
  message: string;
}

interface BookingDetail {
  bookingCode: string;
  guestName: string;
  guestEmail: string | null;
  guestPhone: string | null;
  locale: 'it' | 'en';
  beachName: string;
  timezone: string;
  day: string;
  spotCode: string;
  totalCents: number;
  paidCents: number;
  remainingCents: number;
  paymentState: 'paid' | 'partial' | 'to_collect';
}

export async function CollectView({ locale, beachSlug, query }: { locale: Locale; beachSlug: string; query: Query }) {
  if (!slugPattern.test(beachSlug)) notFound();
  const t = getDictionary(locale, config.brandName);
  const x = t.collect;
  const { me, token } = await requireMe(locale);
  const membership = me.memberships.find((entry) => entry.beachSlug === beachSlug);
  if (!membership) notFound();
  const askedCode = first(query.code);
  const code = askedCode !== undefined && bookingCodePattern.test(askedCode) ? askedCode.toUpperCase() : null;
  const other = locales.find((candidate) => candidate !== locale) ?? locale;

  const alternate = code === null ? manageCollectPath(other, beachSlug) : `${manageCollectPath(other, beachSlug)}?code=${code}`;
  const crumbs = [
    { label: t.account.overviewTitle, href: accountPath(locale, 'overview') },
    { label: membership.beachName, href: accountPath(locale, 'manage', beachSlug) },
    { label: x.short },
  ];

  // Without a code the page asks for one (D36): the «Incassi» voice of the navigation lands here.
  if (code === null) {
    return (
      <ManageShell locale={locale} beachSlug={beachSlug} beachName={membership.beachName} role={membership.role} active="collect" userName={me.user.name} alternatePath={alternate} crumbs={crumbs}>
        <PageHead title={x.pickTitle} lead={x.pickLead} />
        <section className="section">
          <div className="container stack">
            {askedCode !== undefined ? (
              <p className="alert" role="alert">
                {x.pickBad}
              </p>
            ) : null}
            <form method="get" action={manageCollectPath(locale, beachSlug)} className="form-row">
              <div className="field">
                <label htmlFor="incassi-codice">{x.pickCode}</label>
                <input id="incassi-codice" name="code" maxLength={14} autoComplete="off" required />
              </div>
              <button className="button button--secondary" type="submit">
                {x.pickOpen}
              </button>
            </form>
          </div>
        </section>
      </ManageShell>
    );
  }

  // Reading is desk work, like the day list; who cannot read bookings gets a clean message.
  const allowed = can(membership.role, 'bookings.read');
  const detail = allowed
    ? await apiCall<{ currency: string; booking: BookingDetail; requests: RequestRow[] }>('GET', `/v1/manage/beaches/${beachSlug}/bookings/${code}/payment-requests`, { token })
    : null;
  if (!allowed || (detail !== null && !detail.ok && detail.status === 403)) {
    return (
      <ManageShell locale={locale} beachSlug={beachSlug} beachName={membership.beachName} role={membership.role} active="collect" userName={me.user.name} alternatePath={alternate} crumbs={crumbs}>
        <PageHead title={x.title(code)} lead={x.lead} />
        <section className="section">
          <div className="container">
            <div className="empty">
              <h2>{x.forbiddenTitle}</h2>
              <p>{x.forbiddenText}</p>
            </div>
          </div>
        </section>
      </ManageShell>
    );
  }
  if (detail !== null && !detail.ok && detail.status === 404) notFound();

  const booking = detail?.ok ? detail.data.booking : null;
  const requests = detail?.ok ? detail.data.requests : [];
  const canWrite = can(membership.role, 'bookings.create');
  // The active extras of the club, for the quantities of a late addition (spec §4.2 closed by §4.3).
  const catalogueResult = canWrite ? await api.extras(beachSlug) : null;
  const catalogue: ApiExtraService[] = catalogueResult?.ok ? catalogueResult.data.extras : [];
  const common = { lang: locale, beach: beachSlug, code };

  return (
    <ManageShell locale={locale} beachSlug={beachSlug} beachName={membership.beachName} role={membership.role} active="collect" userName={me.user.name} alternatePath={alternate} crumbs={crumbs}>
      <PageHead title={x.title(code)} lead={x.lead} />
      <section className="section">
        <div className="container stack">
          <Notice locale={locale} query={query} />
          {detail !== null && !detail.ok ? <p className="alert" role="alert">{x.unavailable}</p> : null}

          {booking ? (
            <>
              <div className="panel">
                <h2>{x.summaryTitle}</h2>
                <dl className="summary">
                  <div>
                    <dt>{x.guestRow}</dt>
                    <dd>{booking.guestName}</dd>
                  </div>
                  <div>
                    <dt>{t.booking.dayRow}</dt>
                    <dd>{formatDay(booking.day, locale)}</dd>
                  </div>
                  <div>
                    <dt>{t.booking.spotRow}</dt>
                    <dd>{booking.spotCode}</dd>
                  </div>
                  <div>
                    <dt>{x.contactsRow}</dt>
                    <dd>{[booking.guestEmail, booking.guestPhone].filter(Boolean).join(' · ') || x.noContacts}</dd>
                  </div>
                  <div>
                    <dt>{x.totalRow}</dt>
                    <dd>{formatMoney(booking.totalCents, locale)}</dd>
                  </div>
                  <div>
                    <dt>{x.paidRow}</dt>
                    <dd>{formatMoney(booking.paidCents, locale)}</dd>
                  </div>
                  <div>
                    <dt>{x.stateRow}</dt>
                    <dd>{t.account.paymentStates[booking.paymentState]}</dd>
                  </div>
                  <div className="summary__total">
                    <dt>{x.remainingRow}</dt>
                    <dd>{formatMoney(booking.remainingCents, locale)}</dd>
                  </div>
                </dl>
              </div>

              {canWrite && booking.remainingCents > 0 ? (
                <div className="panel">
                  <h2>{x.collectTitle}</h2>
                  <p className="prose">{x.collectLead}</p>
                  <form method="post" action="/azioni/banco-incassa" className="form-row">
                    <Hidden values={common} />
                    <div className="field">
                      <label htmlFor="incasso-importo">{x.amountLabel}</label>
                      <input id="incasso-importo" name="amount" inputMode="decimal" autoComplete="off" required />
                    </div>
                    <button className="button" type="submit">{x.collectButton}</button>
                  </form>
                </div>
              ) : null}

              {canWrite && booking.remainingCents > 0 ? (
                <div className="panel">
                  <h2>{x.requestTitle}</h2>
                  <p className="prose">{x.requestLead}</p>
                  <form method="post" action="/azioni/banco-richiesta" className="form-row">
                    <Hidden values={common} />
                    <div className="field">
                      <label htmlFor="richiesta-importo">{x.amountLabel}</label>
                      <input id="richiesta-importo" name="amount" inputMode="decimal" autoComplete="off" required />
                    </div>
                    <div className="field">
                      <label htmlFor="richiesta-nota">{x.noteLabel}</label>
                      <input id="richiesta-nota" name="note" maxLength={200} autoComplete="off" />
                    </div>
                    <div className="field">
                      <label htmlFor="richiesta-ore">{x.hoursLabel}</label>
                      <input id="richiesta-ore" name="hours" inputMode="numeric" autoComplete="off" aria-describedby="richiesta-ore-nota" />
                      <p className="field__hint" id="richiesta-ore-nota">{x.hoursHint}</p>
                    </div>
                    <button className="button button--secondary" type="submit">{x.requestButton}</button>
                  </form>
                </div>
              ) : null}

              <div className="panel">
                <h2>{x.requestsTitle}</h2>
                {requests.length === 0 ? (
                  <p className="prose">{x.noRequests}</p>
                ) : (
                  <DataTable
                    label={x.requestsTitle}
                    columns={[
                      { label: x.colCreated },
                      { label: x.colAmount, numeric: true },
                      { label: t.account.state },
                      { label: x.colExpiry },
                      { label: x.colShare },
                      { label: t.account.actions },
                    ]}
                  >
                    {requests.map((entry) => (
                      <Row key={entry.requestId}>
                        <Cell label={x.colCreated}>{formatInstant(entry.createdAt, locale, booking.timezone)}</Cell>
                        <Cell label={x.colAmount} numeric>{formatMoney(entry.amountCents, locale)}</Cell>
                        <Cell label={t.account.state}>{x.requestStates[entry.status]}</Cell>
                        <Cell label={x.colExpiry}>{formatInstant(entry.expiresAt, locale, booking.timezone)}</Cell>
                        {/* The /paga link and the full text, readable and copyable without scripts. */}
                        <Cell label={x.colShare}>
                          <details className="copy-block">
                            <summary>{x.showShare}</summary>
                            <p>
                              <span className="visually-hidden">{x.linkLabel}: </span>
                              <a href={entry.payUrl}>{entry.payUrl}</a>
                            </p>
                            <pre>{entry.message}</pre>
                            <p className="field__hint">{x.copyHint}</p>
                          </details>
                          {entry.note ? <p className="field__hint">{entry.note}</p> : null}
                        </Cell>
                        <Cell label={t.account.actions}>
                          {canWrite && entry.status === 'pending' ? (
                            <form method="post" action="/azioni/banco-richiesta-annulla" className="inline-form">
                              <Hidden values={{ ...common, request: entry.requestId }} />
                              <button className="button button--secondary button--small" type="submit">
                                {x.cancelRequest} <span className="visually-hidden">{formatMoney(entry.amountCents, locale)}</span>
                              </button>
                            </form>
                          ) : null}
                        </Cell>
                      </Row>
                    ))}
                  </DataTable>
                )}
              </div>

              {canWrite ? (
                <div className="panel">
                  <h2>{x.extrasTitle}</h2>
                  <p className="prose">{x.extrasLead}</p>
                  {catalogue.length === 0 ? (
                    <p className="prose">{x.noCatalogue}</p>
                  ) : (
                    <form method="post" action="/azioni/banco-extra" className="form-row">
                      <Hidden values={common} />
                      <ExtraQuantityFields locale={locale} idPrefix="incasso-extra" catalogue={catalogue} chosen={[]} />
                      <fieldset className="checks">
                        <legend>{x.extrasCollectLegend}</legend>
                        <label>
                          <input type="radio" name="collect" value="desk" defaultChecked /> {x.extrasAtDesk}
                        </label>
                        <label>
                          <input type="radio" name="collect" value="later" /> {x.extrasInBalance}
                        </label>
                      </fieldset>
                      <button className="button button--secondary" type="submit">{x.addExtras}</button>
                    </form>
                  )}
                </div>
              ) : null}

              <Link className="button button--secondary" href={`${accountPath(locale, 'manage', beachSlug)}?day=${booking.day}`}>
                {x.backToDay}
              </Link>
            </>
          ) : null}
        </div>
      </section>
    </ManageShell>
  );
}
