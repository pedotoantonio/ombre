import type { CSSProperties } from 'react';
import { notFound } from 'next/navigation';
import {
  accountPath,
  can,
  config,
  formatMoney,
  getDictionary,
  locales,
  manageStatsPath,
  type Locale,
  type SeaSide,
  type SpotMark as SpotMarkKind,
  type SpotZone,
} from '@ombre/shared';
import { api, apiCall, dayPattern, formatPeriod, slugPattern, today, type ApiLayoutElement, type ApiZoneGaps } from '@/lib/api';
import { Notice, requireMe } from './account';
import { PlanCanvas, planSize } from './beach';
import { PageHead, PageShell } from './PageShell';
import { Cell, DataTable, Row, RowHead } from './table';

// The statistics page (spec §3.2, reports.read): indicators of a period, CSS-only bars
// each with the table of the same numbers, and the occupancy heatmap on the scene of the
// beach drawing. Figures only: no guest data ever reaches this page.

type Query = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

interface SpotFigures {
  spotId: string;
  code: string;
  zone: SpotZone;
  rowNumber: number;
  col: number;
  publishedDays: number;
  soldDays: number;
  grossCents: number;
  rateBps: number | null;
}

interface StatisticsData {
  currency: string;
  from: string;
  to: string;
  timezone: string;
  soldDays: number;
  grossCents: number;
  cancelled: { bookings: number; grossCents: number };
  averageCents: number | null;
  occupancy: { soldDays: number; publishedDays: number; rateBps: number | null };
  byChannel: { source: string; bookings: number; grossCents: number }[];
  /** The convention is a dimension, never a channel (spec §4.1): counted apart. */
  byConvention: { conventionId: string; partnerName: string; bookings: number; grossCents: number }[];
  byPaymentStatus: { status: string; bookings: number }[];
  arrivals: { arrived: number; notArrived: number };
  byType: { typeId: string; name: string; mark: SpotMarkKind; soldDays: number; grossCents: number }[];
  topSpots: SpotFigures[];
  bottomSpots: SpotFigures[];
  heatmap: SpotFigures[];
}

interface StatsCanvas {
  seaSide: SeaSide;
  shoreGapRows: number;
  landGapRows: number;
  elements: ApiLayoutElement[];
}

function shiftDay(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

const percent = (rateBps: number): number => Math.round(rateBps / 100);

/** Intensity band of a spot: 0 never published, then four textual thresholds of the legend. */
function bandOf(figure: SpotFigures): number {
  if (figure.publishedDays === 0 || figure.rateBps === null) return 0;
  if (figure.rateBps <= 2500) return 1;
  if (figure.rateBps <= 5000) return 2;
  if (figure.rateBps <= 7500) return 3;
  return 4;
}

/** CSS-only bars, hidden from the reading: the table right after says the same numbers. */
function Bars({ rows }: { rows: { key: string; label: string; value: number; text: string }[] }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <ul className="stat-bars" aria-hidden="true">
      {rows.map((row) => (
        <li key={row.key}>
          <span className="stat-bars__label">{row.label}</span>
          <span className="stat-bars__track">
            <span className="stat-bars__fill" style={{ width: `${Math.round((row.value / max) * 100)}%` }} />
          </span>
          <span className="stat-bars__value">{row.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** A table of spot figures: the five best, the five worst, and the whole heatmap. */
function FiguresTable({ locale, label, rows }: { locale: Locale; label: string; rows: SpotFigures[] }) {
  const t = getDictionary(locale, config.brandName);
  const s = t.stats;
  return (
    <DataTable
      label={label}
      columns={[
        { label: t.account.spot },
        { label: t.ops.colZone },
        { label: s.colPublished, numeric: true },
        { label: s.colSold, numeric: true },
        { label: s.colRate, numeric: true },
        { label: s.colGross, numeric: true },
      ]}
    >
      {rows.map((figure) => (
        <Row key={figure.spotId}>
          <RowHead>{figure.code}</RowHead>
          <Cell label={t.ops.colZone}>{`${t.booking.zones[figure.zone]} · ${t.booking.row(figure.rowNumber)}`}</Cell>
          <Cell label={s.colPublished} numeric>
            {figure.publishedDays}
          </Cell>
          <Cell label={s.colSold} numeric>
            {figure.soldDays}
          </Cell>
          <Cell label={s.colRate} numeric>
            {figure.rateBps === null ? s.bands[0] : s.percent(percent(figure.rateBps))}
          </Cell>
          <Cell label={s.colGross} numeric>
            {formatMoney(figure.grossCents, locale)}
          </Cell>
        </Row>
      ))}
    </DataTable>
  );
}

export async function StatisticsView({ locale, beachSlug, query }: { locale: Locale; beachSlug: string; query: Query }) {
  if (!slugPattern.test(beachSlug)) notFound();
  const t = getDictionary(locale, config.brandName);
  const s = t.stats;
  const { me, token } = await requireMe(locale);
  const membership = me.memberships.find((entry) => entry.beachSlug === beachSlug);
  if (!membership) notFound();
  const role = membership.role;
  const other = locales.find((candidate) => candidate !== locale) ?? locale;

  // The default period is the last 30 days, in the time zone of the beach club.
  const card = await api.beach(beachSlug);
  const timezone = card.ok ? card.data.beach.timezone : 'Europe/Rome';
  const todayDay = today(timezone);
  const askedFrom = first(query.from);
  const askedTo = first(query.to);
  const to = askedTo && dayPattern.test(askedTo) ? askedTo : todayDay;
  const from = askedFrom && dayPattern.test(askedFrom) ? askedFrom : shiftDay(to, -29);

  const base = manageStatsPath(locale, beachSlug);
  const alternate = `${manageStatsPath(other, beachSlug)}?from=${from}&to=${to}`;
  const crumbs = [
    { label: t.account.overviewTitle, href: accountPath(locale, 'overview') },
    { label: membership.beachName, href: accountPath(locale, 'manage', beachSlug) },
    { label: s.short },
  ];

  const allowed = can(role, 'reports.read');
  const [report, canvasResult] = await Promise.all([
    allowed ? apiCall<StatisticsData>('GET', `/v1/manage/beaches/${beachSlug}/reports/statistics?from=${from}&to=${to}`, { token }) : null,
    allowed && can(role, 'layout.gaps') ? apiCall<StatsCanvas>('GET', `/v1/manage/beaches/${beachSlug}/layout`, { token }) : null,
  ]);

  // Who may not read the reports gets a clean message, like the other reserved pages.
  if (!allowed || (report !== null && !report.ok && report.status === 403)) {
    return (
      <PageShell locale={locale} page="help" highlight={false} alternatePath={alternate} crumbs={crumbs} signedInAs={me.user.name}>
        <PageHead title={s.title(membership.beachName)} lead={s.lead} />
        <section className="section">
          <div className="container">
            <div className="empty">
              <h2>{s.forbiddenTitle}</h2>
              <p>{s.forbiddenText}</p>
            </div>
          </div>
        </section>
      </PageShell>
    );
  }

  const data = report?.ok ? report.data : null;
  const canvas: StatsCanvas = canvasResult?.ok ? canvasResult.data : { seaSide: 'top', shoreGapRows: 1, landGapRows: 1, elements: [] };
  const gaps: ApiZoneGaps = { shoreGapRows: canvas.shoreGapRows, landGapRows: canvas.landGapRows };
  const heatmap = data?.heatmap ?? [];
  const size = planSize(heatmap, canvas.elements);
  const empty = data !== null && data.occupancy.publishedDays === 0 && data.soldDays === 0 && data.cancelled.bookings === 0;

  return (
    <PageShell locale={locale} page="help" highlight={false} alternatePath={alternate} crumbs={crumbs} signedInAs={me.user.name}>
      <PageHead title={s.title(membership.beachName)} lead={s.lead} />
      <section className="section">
        <div className="container stack">
          <Notice locale={locale} query={query} />

          <div className="panel">
            <h2>{s.periodTitle}</h2>
            <p className="prose">{s.maxNote}</p>
            <form className="form-row" method="get" action={base}>
              <div className="field">
                <label htmlFor="dal">{t.account.from}</label>
                <input id="dal" type="date" name="from" defaultValue={from} required />
              </div>
              <div className="field">
                <label htmlFor="al">{t.account.to}</label>
                <input id="al" type="date" name="to" defaultValue={to} required />
              </div>
              <button className="button button--secondary" type="submit">
                {t.account.show}
              </button>
            </form>
          </div>

          {report !== null && !report.ok ? (
            <p className="alert" role="alert">
              {report.status === 400 ? s.badPeriod : t.account.errors.unavailable}
            </p>
          ) : null}

          {data === null ? null : (
            <>
              <p className="prose">
                <strong>{formatPeriod(data.from, data.to, locale)}</strong>
              </p>
              {empty ? (
                <div className="empty">
                  <h2>{s.emptyTitle}</h2>
                  <p>{s.emptyText}</p>
                </div>
              ) : (
                <>
                  {/* The indicators of the period, all computed server side. */}
                  <dl className="stat-grid">
                    <div className="stat-card">
                      <dt>{s.soldDays}</dt>
                      <dd>{data.soldDays}</dd>
                    </div>
                    <div className="stat-card">
                      <dt>{s.gross}</dt>
                      <dd>{formatMoney(data.grossCents, locale)}</dd>
                    </div>
                    <div className="stat-card">
                      <dt>{s.average}</dt>
                      <dd>{data.averageCents === null ? s.noSales : formatMoney(data.averageCents, locale)}</dd>
                    </div>
                    <div className="stat-card">
                      <dt>{s.cancelledTitle}</dt>
                      <dd className="stat-card__text">{s.cancelled(data.cancelled.bookings, formatMoney(data.cancelled.grossCents, locale))}</dd>
                    </div>
                    <div className="stat-card">
                      <dt>{s.occupancy}</dt>
                      <dd>{data.occupancy.rateBps === null ? s.bands[0] : s.percent(percent(data.occupancy.rateBps))}</dd>
                      <dd className="stat-card__note">
                        {s.occupancyDetail(data.occupancy.soldDays, data.occupancy.publishedDays)}. {s.occupancyNote}
                      </dd>
                    </div>
                    <div className="stat-card">
                      <dt>{s.arrivalsTitle}</dt>
                      <dd className="stat-card__text">
                        {s.arrived}: {data.arrivals.arrived} · {s.notArrived}: {data.arrivals.notArrived}
                      </dd>
                      <dd className="stat-card__note">{s.arrivalsNote}</dd>
                    </div>
                  </dl>

                  {/* By channel: bars plus the table of the same numbers. */}
                  <div className="panel">
                    <h2>{s.byChannelTitle}</h2>
                    <Bars
                      rows={data.byChannel.map((row) => ({
                        key: row.source,
                        label: (s.channels as Record<string, string>)[row.source] ?? row.source,
                        value: row.bookings,
                        text: String(row.bookings),
                      }))}
                    />
                    <DataTable label={s.byChannelTitle} columns={[{ label: s.byChannelTitle }, { label: t.account.bookingsCount, numeric: true }, { label: s.colGross, numeric: true }]}>
                      {data.byChannel.map((row) => (
                        <Row key={row.source}>
                          <RowHead>{(s.channels as Record<string, string>)[row.source] ?? row.source}</RowHead>
                          <Cell label={t.account.bookingsCount} numeric>
                            {row.bookings}
                          </Cell>
                          <Cell label={s.colGross} numeric>
                            {formatMoney(row.grossCents, locale)}
                          </Cell>
                        </Row>
                      ))}
                    </DataTable>
                  </div>

                  {/* By convention, only when the period has any: a dimension, not a channel. */}
                  {data.byConvention.length > 0 ? (
                    <div className="panel">
                      <h2>{s.byConventionTitle}</h2>
                      <p className="prose">{s.byConventionNote}</p>
                      <Bars
                        rows={data.byConvention.map((row) => ({
                          key: row.conventionId,
                          label: row.partnerName,
                          value: row.bookings,
                          text: String(row.bookings),
                        }))}
                      />
                      <DataTable
                        label={s.byConventionTitle}
                        columns={[{ label: s.conventionPartner }, { label: t.account.bookingsCount, numeric: true }, { label: s.colGross, numeric: true }]}
                      >
                        {data.byConvention.map((row) => (
                          <Row key={row.conventionId}>
                            <RowHead>{row.partnerName}</RowHead>
                            <Cell label={t.account.bookingsCount} numeric>
                              {row.bookings}
                            </Cell>
                            <Cell label={s.colGross} numeric>
                              {formatMoney(row.grossCents, locale)}
                            </Cell>
                          </Row>
                        ))}
                      </DataTable>
                    </div>
                  ) : null}

                  {/* By payment status. */}
                  <div className="panel">
                    <h2>{s.byPaymentTitle}</h2>
                    <Bars
                      rows={data.byPaymentStatus.map((row) => ({
                        key: row.status,
                        label: (s.payments as Record<string, string>)[row.status] ?? row.status,
                        value: row.bookings,
                        text: String(row.bookings),
                      }))}
                    />
                    <DataTable label={s.byPaymentTitle} columns={[{ label: s.byPaymentTitle }, { label: t.account.bookingsCount, numeric: true }]}>
                      {data.byPaymentStatus.map((row) => (
                        <Row key={row.status}>
                          <RowHead>{(s.payments as Record<string, string>)[row.status] ?? row.status}</RowHead>
                          <Cell label={t.account.bookingsCount} numeric>
                            {row.bookings}
                          </Cell>
                        </Row>
                      ))}
                    </DataTable>
                  </div>

                  {/* By spot type. */}
                  <div className="panel">
                    <h2>{s.byTypeTitle}</h2>
                    <Bars
                      rows={data.byType.map((row) => ({ key: row.typeId, label: row.name, value: row.soldDays, text: String(row.soldDays) }))}
                    />
                    <DataTable label={s.byTypeTitle} columns={[{ label: t.ops.colType }, { label: s.colSold, numeric: true }, { label: s.colGross, numeric: true }]}>
                      {data.byType.map((row) => (
                        <Row key={row.typeId}>
                          <RowHead>{row.name}</RowHead>
                          <Cell label={s.colSold} numeric>
                            {row.soldDays}
                          </Cell>
                          <Cell label={s.colGross} numeric>
                            {formatMoney(row.grossCents, locale)}
                          </Cell>
                        </Row>
                      ))}
                    </DataTable>
                  </div>

                  {/* Per-spot productivity: the five best and the five worst. */}
                  <div className="panel">
                    <h2>{s.topTitle}</h2>
                    <p className="prose">{s.rankNote}</p>
                    <FiguresTable locale={locale} label={s.topTitle} rows={data.topSpots} />
                    <h2>{s.bottomTitle}</h2>
                    <FiguresTable locale={locale} label={s.bottomTitle} rows={data.bottomSpots} />
                  </div>

                  {/* The heatmap on the scene of the drawing, with its textual legend and its table. */}
                  <div
                    className="plan stats-heat"
                    role="group"
                    aria-labelledby="heatmap-titolo"
                    style={{ '--plan-cols': size.cols, '--plan-lanes': size.lanes } as CSSProperties}
                  >
                    <div className="plan__head">
                      <h2 id="heatmap-titolo">{s.heatmapTitle}</h2>
                      <p>{s.heatmapLead}</p>
                      {canvasResult?.ok ? null : <p>{s.heatmapNoDrawing}</p>}
                    </div>
                    <ul className="plan-legend" aria-label={s.bandLegend}>
                      {s.bands.map((label, band) => (
                        <li key={label}>
                          <span className={`heat-swatch heat--${band}`} aria-hidden="true" />
                          {label}
                        </li>
                      ))}
                    </ul>
                    <PlanCanvas
                      locale={locale}
                      gaps={gaps}
                      seaSide={canvas.seaSide}
                      elements={canvas.elements}
                      spots={heatmap}
                      idPrefix="heatmap"
                      renderSpot={(figure) => (
                        <li>
                          <span className={`heat-cell heat--${bandOf(figure)}`}>
                            <span className="heat-cell__code" aria-hidden="true">
                              {figure.code}
                            </span>
                            <span className="heat-cell__rate" aria-hidden="true">
                              {figure.rateBps === null ? '—' : s.percent(percent(figure.rateBps))}
                            </span>
                            <span className="visually-hidden">
                              {figure.code}: {figure.rateBps === null ? s.bands[0] : s.percent(percent(figure.rateBps))}
                            </span>
                          </span>
                        </li>
                      )}
                    />
                    <p className="prose">{s.tableNote}</p>
                    <FiguresTable locale={locale} label={s.heatmapTitle} rows={heatmap} />
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </section>
    </PageShell>
  );
}
