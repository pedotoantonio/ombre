import Link from 'next/link';
import { notFound } from 'next/navigation';
import { accountPath, can, config, formatMoney, getDictionary, locales, manageDealsPath, type Locale } from '@ombre/shared';
import { api, apiCall, dayPattern, formatDate, formatPeriod, slugPattern, today, uuidPattern } from '@/lib/api';
import { Hidden, Notice, requireMe, SectionNotice } from './account';
import { ManageShell } from './manage-shell';
import { PageHead } from './PageShell';
import { Cell, DataTable, Row, RowHead } from './table';

// Hotel conventions (spec §4.1, D30): the manager's register of partner structures,
// with the agreed price — a percent discount or a fixed price per day, never both —
// and the per-convention statement for the monthly reconciliation with the partner.
// Management data, never public; every page works without JavaScript.

type Query = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

export interface ApiConvention {
  conventionId: string;
  partnerName: string;
  code: string;
  percentBps: number | null;
  fixedPriceCents: number | null;
  validFrom: string | null;
  validTo: string | null;
  active: boolean;
  notes: string | null;
}

interface StatementRow {
  code: string;
  day: string;
  spotCode: string;
  guestName: string;
  status: 'draft' | 'under_review' | 'confirmed' | 'cancelled' | 'completed';
  listPriceCents: number;
  discountCents: number;
  totalCents: number;
}

interface Statement {
  from: string;
  to: string;
  convention: { conventionId: string; partnerName: string; code: string; active: boolean };
  bookings: StatementRow[];
  totals: { bookings: number; grossCents: number; discountCents: number };
}

/** A percentage out of basis points, with the locale's decimal separator and no stray zeros. */
function percentText(bps: number, locale: Locale): string {
  const whole = Math.floor(bps / 100);
  const rest = bps % 100;
  if (rest === 0) return String(whole);
  const decimals = rest % 10 === 0 ? String(rest / 10) : String(rest).padStart(2, '0');
  return `${whole}${locale === 'it' ? ',' : '.'}${decimals}`;
}

/** The agreed price of a convention, in words: "sconto del 10%" or "12,00 € a giornata". */
export function dealPriceText(deal: { percentBps: number | null; fixedPriceCents: number | null }, locale: Locale): string {
  const d = getDictionary(locale, config.brandName).deals;
  if (deal.percentBps !== null) return d.percentOff(percentText(deal.percentBps, locale));
  return `${formatMoney(deal.fixedPriceCents ?? 0, locale)} ${d.perDay}`;
}

/** The validity window of a convention, in words; «sempre valida» without one. */
function validityText(deal: ApiConvention, locale: Locale): string {
  const d = getDictionary(locale, config.brandName).deals;
  if (deal.validFrom !== null && deal.validTo !== null) return formatPeriod(deal.validFrom, deal.validTo, locale);
  if (deal.validFrom !== null) return d.fromOnly(formatDate(deal.validFrom, locale));
  if (deal.validTo !== null) return d.untilOnly(formatDate(deal.validTo, locale));
  return d.always;
}

/** An amount in euro as the form fields write it, with the locale's decimal separator. */
function euroField(cents: number | null, locale: Locale): string {
  return cents === null ? '' : (cents / 100).toFixed(2).replace('.', locale === 'it' ? ',' : '.');
}

/** The creation and edit form: the same fields, a PUT when a convention is being edited. */
function DealForm({ locale, beachSlug, deal, query }: { locale: Locale; beachSlug: string; deal: ApiConvention | null; query: Query }) {
  const t = getDictionary(locale, config.brandName);
  const d = t.deals;
  return (
    <div className="panel" id="modulo-convenzione">
      <h2>{deal ? d.editTitle(deal.code) : d.newTitle}</h2>
      {/* A refused save lands here: its message sits next to the form, not at the top. */}
      <SectionNotice locale={locale} query={query} okKey="mok" errKey="merr" />
      {deal ? (
        <p>
          <Link className="button button--secondary button--small" href={manageDealsPath(locale, beachSlug)}>
            {d.cancelEdit}
          </Link>
        </p>
      ) : null}
      <form method="post" action="/azioni/convenzione-salva" className="stack">
        <Hidden values={{ lang: locale, beach: beachSlug, ...(deal ? { convention: deal.conventionId } : {}) }} />
        <div className="form-row">
          <div className="field">
            <label htmlFor="convenzione-struttura">{d.partnerLabel}</label>
            <input id="convenzione-struttura" name="partner" maxLength={120} autoComplete="off" defaultValue={deal?.partnerName ?? ''} required />
          </div>
          <div className="field">
            <label htmlFor="convenzione-codice">{d.codeLabel}</label>
            <input
              id="convenzione-codice"
              name="code"
              maxLength={40}
              autoComplete="off"
              defaultValue={deal?.code ?? ''}
              aria-describedby="convenzione-codice-nota"
              required
            />
            <p className="field__hint" id="convenzione-codice-nota">{d.codeHint}</p>
          </div>
        </div>
        <p className="prose" id="convenzione-prezzo-nota">
          <strong>{d.pricingLegend}.</strong> {d.pricingHint}
        </p>
        <div className="form-row">
          <div className="field">
            <label htmlFor="convenzione-percento">{d.percentLabel}</label>
            <input
              id="convenzione-percento"
              name="percent"
              inputMode="decimal"
              autoComplete="off"
              defaultValue={deal?.percentBps === null || deal === null ? '' : percentText(deal.percentBps, locale)}
              aria-describedby="convenzione-prezzo-nota"
            />
          </div>
          <div className="field">
            <label htmlFor="convenzione-fisso">{d.fixedLabel}</label>
            <input
              id="convenzione-fisso"
              name="fixed"
              inputMode="decimal"
              autoComplete="off"
              defaultValue={deal ? euroField(deal.fixedPriceCents, locale) : ''}
              aria-describedby="convenzione-prezzo-nota convenzione-fisso-nota"
            />
            <p className="field__hint" id="convenzione-fisso-nota">{d.fixedHint}</p>
          </div>
        </div>
        <div className="form-row">
          <div className="field">
            <label htmlFor="convenzione-dal">{t.account.from}</label>
            <input id="convenzione-dal" name="from" type="date" defaultValue={deal?.validFrom ?? ''} aria-describedby="convenzione-validita-nota" />
          </div>
          <div className="field">
            <label htmlFor="convenzione-al">{t.account.to}</label>
            <input id="convenzione-al" name="to" type="date" defaultValue={deal?.validTo ?? ''} aria-describedby="convenzione-validita-nota" />
          </div>
        </div>
        <p className="prose" id="convenzione-validita-nota">{d.validityHint}</p>
        <div className="field">
          <label htmlFor="convenzione-note">{d.notesLabel}</label>
          <input id="convenzione-note" name="notes" maxLength={500} autoComplete="off" defaultValue={deal?.notes ?? ''} />
        </div>
        <button className="button" type="submit">{deal ? d.save : d.create}</button>
      </form>
    </div>
  );
}

/** The statement of one convention over a period: the rows and totals of the reconciliation. */
function StatementPanel({ locale, beachSlug, statement }: { locale: Locale; beachSlug: string; statement: Statement }) {
  const t = getDictionary(locale, config.brandName);
  const d = t.deals;
  const base = manageDealsPath(locale, beachSlug);
  return (
    <div className="panel" id="rendiconto">
      <h2>{d.statementTitle(`${statement.convention.partnerName} (${statement.convention.code})`)}</h2>
      <p className="prose">{d.statementLead}</p>
      <form className="form-row" method="get" action={`${base}#rendiconto`}>
        <input type="hidden" name="rendiconto" value={statement.convention.conventionId} />
        <div className="field">
          <label htmlFor="rendiconto-dal">{t.account.from}</label>
          <input id="rendiconto-dal" type="date" name="from" defaultValue={statement.from} required />
        </div>
        <div className="field">
          <label htmlFor="rendiconto-al">{t.account.to}</label>
          <input id="rendiconto-al" type="date" name="to" defaultValue={statement.to} required />
        </div>
        <button className="button button--secondary" type="submit">{t.account.show}</button>
      </form>
      <p className="prose">
        <strong>{formatPeriod(statement.from, statement.to, locale)}</strong>
      </p>
      {statement.bookings.length === 0 ? (
        <p className="prose">{d.statementEmpty}</p>
      ) : (
        <>
          <DataTable
            label={d.statementTitle(statement.convention.code)}
            columns={[
              { label: t.account.code },
              { label: t.account.day },
              { label: t.account.spot },
              { label: t.account.guest },
              { label: t.account.booking },
              { label: d.colList, numeric: true },
              { label: d.colDiscount, numeric: true },
              { label: d.colTotal, numeric: true },
            ]}
          >
            {statement.bookings.map((row) => (
              <Row key={row.code}>
                <RowHead>{row.code}</RowHead>
                <Cell label={t.account.day}>{formatDate(row.day, locale)}</Cell>
                <Cell label={t.account.spot}>{row.spotCode}</Cell>
                <Cell label={t.account.guest}>{row.guestName}</Cell>
                <Cell label={t.account.booking}>{t.account.bookingStates[row.status]}</Cell>
                <Cell label={d.colList} numeric>{formatMoney(row.listPriceCents, locale)}</Cell>
                <Cell label={d.colDiscount} numeric>{formatMoney(row.discountCents, locale)}</Cell>
                <Cell label={d.colTotal} numeric>{formatMoney(row.totalCents, locale)}</Cell>
              </Row>
            ))}
          </DataTable>
          <p className="prose">
            <strong>{d.totalsLine(statement.totals.bookings, formatMoney(statement.totals.discountCents, locale), formatMoney(statement.totals.grossCents, locale))}</strong>
          </p>
        </>
      )}
      <p>
        <Link className="button button--secondary button--small" href={base}>
          {d.closeStatement}
        </Link>
      </p>
    </div>
  );
}

/** The manager's conventions page: list, creation and edit, statement of one convention. */
export async function ConventionsView({ locale, beachSlug, query }: { locale: Locale; beachSlug: string; query: Query }) {
  if (!slugPattern.test(beachSlug)) notFound();
  const t = getDictionary(locale, config.brandName);
  const d = t.deals;
  const { me, token } = await requireMe(locale);
  const membership = me.memberships.find((entry) => entry.beachSlug === beachSlug);
  if (!membership) notFound();
  const other = locales.find((candidate) => candidate !== locale) ?? locale;
  const base = `/v1/manage/beaches/${beachSlug}`;

  const alternate = manageDealsPath(other, beachSlug);
  const crumbs = [
    { label: t.account.overviewTitle, href: accountPath(locale, 'overview') },
    { label: membership.beachName, href: accountPath(locale, 'manage', beachSlug) },
    { label: d.short },
  ];

  // Who lacks the commercial permission gets a clean message, like the statistics page.
  const allowed = can(membership.role, 'promotions.manage');
  const list = allowed ? await apiCall<{ conventions: ApiConvention[] }>('GET', `${base}/conventions`, { token }) : null;
  if (!allowed || (list !== null && !list.ok && list.status === 403)) {
    return (
      <ManageShell locale={locale} beachSlug={beachSlug} beachName={membership.beachName} role={membership.role} active={null} userName={me.user.name} alternatePath={alternate} crumbs={crumbs}>
        <PageHead title={d.title(membership.beachName)} lead={d.lead} />
        <section className="section">
          <div className="container">
            <div className="empty">
              <h2>{d.forbiddenTitle}</h2>
              <p>{d.forbiddenText}</p>
            </div>
          </div>
        </section>
      </ManageShell>
    );
  }
  const deals = list?.ok ? list.data.conventions : [];

  // The statement of the convention asked in the address; the default period is the
  // current month in the time zone of the beach club.
  const askedStatement = first(query.rendiconto);
  const askedEdit = first(query.modifica);
  const editing = askedEdit && uuidPattern.test(askedEdit) ? deals.find((deal) => deal.conventionId === askedEdit) ?? null : null;
  let statement: Statement | null = null;
  let statementFailed = false;
  if (askedStatement && uuidPattern.test(askedStatement)) {
    const card = await api.beach(beachSlug);
    const todayDay = today(card.ok ? card.data.beach.timezone : 'Europe/Rome');
    const monthStart = `${todayDay.slice(0, 8)}01`;
    const monthEnd = new Date(Date.UTC(Number(todayDay.slice(0, 4)), Number(todayDay.slice(5, 7)), 0)).toISOString().slice(0, 10);
    const askedFrom = first(query.from);
    const askedTo = first(query.to);
    const from = askedFrom && dayPattern.test(askedFrom) ? askedFrom : monthStart;
    const to = askedTo && dayPattern.test(askedTo) ? askedTo : monthEnd;
    const result = await apiCall<Statement>('GET', `${base}/conventions/${askedStatement}/statement?from=${from}&to=${to}`, { token });
    if (result.ok) statement = result.data;
    else statementFailed = true;
  }

  const common = { lang: locale, beach: beachSlug };
  const dealsBase = manageDealsPath(locale, beachSlug);

  return (
    <ManageShell locale={locale} beachSlug={beachSlug} beachName={membership.beachName} role={membership.role} active={null} userName={me.user.name} alternatePath={alternate} crumbs={crumbs}>
      <PageHead title={d.title(membership.beachName)} lead={d.lead} />
      <section className="section">
        <div className="container stack">
          <Notice locale={locale} query={query} />
          {list !== null && !list.ok ? (
            <p className="alert" role="alert">{d.unavailable}</p>
          ) : null}
          {statementFailed ? (
            <p className="alert" role="alert">{t.account.errors.invalid_request}</p>
          ) : null}
          {statement !== null ? <StatementPanel locale={locale} beachSlug={beachSlug} statement={statement} /> : null}

          <div className="panel">
            <h2>{d.listTitle}</h2>
            {deals.length === 0 ? (
              <p className="prose">{d.empty}</p>
            ) : (
              <>
                <DataTable
                  label={d.listTitle}
                  columns={[
                    { label: d.partner },
                    { label: t.account.code },
                    { label: t.account.price },
                    { label: d.validity },
                    { label: t.account.state },
                    { label: t.account.actions },
                  ]}
                >
                  {deals.map((deal) => (
                    <Row key={deal.conventionId}>
                      <RowHead>{deal.partnerName}</RowHead>
                      <Cell label={t.account.code}><code>{deal.code}</code></Cell>
                      <Cell label={t.account.price}>{dealPriceText(deal, locale)}</Cell>
                      <Cell label={d.validity}>{validityText(deal, locale)}</Cell>
                      <Cell label={t.account.state}>{deal.active ? d.stateActive : d.stateSuspended}</Cell>
                      <Cell label={t.account.actions}>
                        <Link className="button button--secondary button--small" href={`${dealsBase}?modifica=${deal.conventionId}#modulo-convenzione`}>
                          {d.edit} <span className="visually-hidden">{deal.code}</span>
                        </Link>
                        <Link className="button button--secondary button--small" href={`${dealsBase}?rendiconto=${deal.conventionId}#rendiconto`}>
                          {d.statementLink} <span className="visually-hidden">{deal.code}</span>
                        </Link>
                        <form method="post" action="/azioni/convenzione-stato" className="inline-form">
                          <Hidden values={{ ...common, convention: deal.conventionId, active: deal.active ? 'no' : 'yes' }} />
                          <button className="button button--secondary button--small" type="submit">
                            {deal.active ? t.account.suspend : t.account.resume} <span className="visually-hidden">{deal.code}</span>
                          </button>
                        </form>
                        <form method="post" action="/azioni/convenzione-elimina" className="inline-form">
                          <Hidden values={{ ...common, convention: deal.conventionId }} />
                          <button className="button button--secondary button--small" type="submit">
                            {t.layout.remove} <span className="visually-hidden">{deal.code}</span>
                          </button>
                        </form>
                      </Cell>
                    </Row>
                  ))}
                </DataTable>
                <p className="prose">{d.deleteNote}</p>
              </>
            )}
          </div>

          <DealForm locale={locale} beachSlug={beachSlug} deal={editing} query={query} />
        </div>
      </section>
    </ManageShell>
  );
}
