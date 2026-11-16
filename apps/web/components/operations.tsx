import type { CSSProperties } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  accountPath,
  can,
  config,
  formatMoney,
  getDictionary,
  locales,
  manageStatsPath,
  manageTodayPath,
  type Locale,
  type SeaSide,
  type SpotMark as SpotMarkKind,
  type SpotZone,
} from '@ombre/shared';
import { api, apiCall, dayPattern, formatDay, slugPattern, today, type ApiLayoutElement, type ApiZoneGaps } from '@/lib/api';
import { Hidden, Notice, requireMe } from './account';
import { PlanCanvas, planSize, SpotMark } from './beach';
import { PageHead, PageShell } from './PageShell';
import { Cell, DataTable, Row, RowHead } from './table';

// The operational console «Oggi sulla spiaggia» (spec §3.1, D29): the whole beach on one
// day as a scene derived from the manager's drawing, one card per spot coloured by its
// operational state, with the equivalent table below. Views, search and the selection mode
// live in the query string; blocking is a plain POST. The only JavaScript is an inline,
// first-party enrichment of the selection mode: everything works with scripts off.

type Query = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

type OperationalState = 'free' | 'reserved' | 'expected' | 'present' | 'departed' | 'blocked' | 'not_for_sale';
const operationalStates: readonly OperationalState[] = ['free', 'reserved', 'expected', 'present', 'departed', 'blocked', 'not_for_sale'];

interface OpsSpot {
  spotId: string;
  code: string;
  zone: SpotZone;
  rowNumber: number;
  col: number;
  typeName: string;
  typeMark: SpotMarkKind;
  umbrellas: number;
  sunbeds: number;
  maxGuests: number;
  state: OperationalState;
  notForSale: 'never_published' | 'withdrawn' | null;
  shared: boolean;
  priceCents: number | null;
  guestName: string | null;
  bookingCode: string | null;
}

interface OpsData {
  currency: string;
  day: string;
  spots: OpsSpot[];
  summary: { counts: Record<OperationalState, number>; expectedGuests: number; presentGuests: number; revenueCents: number | null };
}

interface OpsCanvas {
  seaSide: SeaSide;
  shoreGapRows: number;
  landGapRows: number;
  elements: ApiLayoutElement[];
}

/** The three explicit views; null is the automatic one: full on wide screens, numbers on phones. */
const viewIds = ['completa', 'numeri', 'dotazioni'] as const;
type ViewId = (typeof viewIds)[number];

function readView(value: string | undefined): ViewId | null {
  return (viewIds as readonly string[]).includes(value ?? '') ? (value as ViewId) : null;
}

/** Cards are wider than the public map cells: at least 88 px, so the full view stays readable. */
const opsCellRem = 5.5;

function withQuery(path: string, values: Record<string, string | undefined>): string {
  const query = Object.entries(values).filter((entry): entry is [string, string] => Boolean(entry[1]));
  return query.length === 0 ? path : `${path}?${new URLSearchParams(query).toString()}`;
}

function shiftDay(day: string, delta: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

/** The blocked and withdrawn days keep the crossed mark: the state is never colour alone. */
function markStatus(state: OperationalState): 'free' | 'unavailable' {
  return state === 'blocked' || state === 'not_for_sale' ? 'unavailable' : 'free';
}

/** The letter badges of a card, with the full term for the screen reader. */
function TileBadges({ locale, spot }: { locale: Locale; spot: OpsSpot }) {
  const o = getDictionary(locale, config.brandName).ops;
  const badges: { letter: string; full: string }[] = [];
  if (spot.state === 'reserved') badges.push({ letter: o.badgeReserved, full: o.badgeReservedFull });
  if (spot.shared) badges.push({ letter: o.badgeShared, full: o.badgeSharedFull });
  if (spot.state === 'blocked') badges.push({ letter: o.badgeBlocked, full: o.badgeBlockedFull });
  if (badges.length === 0) return null;
  return (
    <span className="ops-tile__badges">
      {badges.map((badge) => (
        <span className="ops-tile__badge" key={badge.letter}>
          <span aria-hidden="true">{badge.letter}</span>
          <span className="visually-hidden">{badge.full}</span>
        </span>
      ))}
    </span>
  );
}

/** One card of the scene: a link to its table row, or the whole selection checkbox in selection mode. */
function OpsTile({ locale, spot, selecting, hit }: { locale: Locale; spot: OpsSpot; selecting: boolean; hit: boolean }) {
  const t = getDictionary(locale, config.brandName);
  const o = t.ops;
  const classes = `ops-tile ops-tile--${spot.state}${hit ? ' ops-tile--hit' : ''}`;
  const content = (
    <>
      <span className="ops-tile__head">
        <SpotMark mark={spot.typeMark} status={markStatus(spot.state)} />
        <span className="ops-tile__code" aria-hidden="true">
          {spot.code}
        </span>
        <TileBadges locale={locale} spot={spot} />
      </span>
      {spot.guestName ? (
        <span className="ops-tile__guest" aria-hidden="true" title={spot.guestName}>
          {spot.guestName}
        </span>
      ) : null}
      <span className="ops-tile__kit" aria-hidden="true">
        {o.equipmentShort(spot.umbrellas, spot.sunbeds)}
      </span>
      <span className="visually-hidden">
        {spot.typeName} {spot.code}: {o.states[spot.state]}.{spot.guestName ? ` ${spot.guestName}.` : ''} {t.booking.equipment(spot.umbrellas, spot.sunbeds)}.
        {hit ? ` ${o.hit}.` : ''}
      </span>
    </>
  );
  if (selecting) {
    return (
      <li>
        <label className={`${classes} ops-tile--check`}>
          <input type="checkbox" name="spot" value={spot.spotId} data-state={spot.state} className="ops-tile__box" />
          {content}
          <span className="visually-hidden"> {o.selectSpot(spot.code)}</span>
        </label>
      </li>
    );
  }
  return (
    <li>
      <a className={classes} href={`#riga-${spot.code}`}>
        {content}
        <span className="visually-hidden"> {o.openRow(spot.code)}</span>
      </a>
    </li>
  );
}

/** The always visible legend: every state with its coloured mark, and the letter badges. */
function OpsLegend({ locale }: { locale: Locale }) {
  const t = getDictionary(locale, config.brandName);
  const o = t.ops;
  const letters = [
    { letter: o.badgeReserved, full: o.badgeReservedFull },
    { letter: o.badgeShared, full: o.badgeSharedFull },
    { letter: o.badgeBlocked, full: o.badgeBlockedFull },
  ];
  return (
    <ul className="plan-legend ops-legend" aria-label={t.booking.legendTitle}>
      {operationalStates.map((state) => (
        <li key={state}>
          <span className={`ops-swatch ops-tile--${state}`}>
            <SpotMark mark="umbrella" status={markStatus(state)} />
          </span>
          {o.states[state]}
        </li>
      ))}
      {letters.map((badge) => (
        <li key={badge.letter}>
          <span className="ops-tile__badge">
            <span aria-hidden="true">{badge.letter}</span>
          </span>
          {badge.full}
        </li>
      ))}
    </ul>
  );
}

/** Inline, first-party enrichment of the selection mode (D29): quick selection and a live
 * counter that drive the very same checkboxes and POST of the form. Nothing lives only here. */
const quickSelectionScript = `(() => {
  var box = document.getElementById('selezione-rapida');
  var form = box && box.closest('form');
  if (!box || !form) return;
  var boxes = function () { return form.querySelectorAll('input[name="spot"]'); };
  var out = document.createElement('output');
  out.className = 'ops-quick__count';
  var refresh = function () {
    var total = 0;
    boxes().forEach(function (check) { if (check.checked) total += 1; });
    out.textContent = box.getAttribute('data-prefix') + ': ' + total;
  };
  var add = function (label, act) {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'button button--secondary button--small';
    button.textContent = label;
    button.addEventListener('click', function () { boxes().forEach(act); refresh(); });
    box.appendChild(button);
  };
  add(box.getAttribute('data-all'), function (check) { check.checked = check.getAttribute('data-state') === 'free'; });
  add(box.getAttribute('data-none'), function (check) { check.checked = false; });
  box.appendChild(out);
  form.addEventListener('change', refresh);
  refresh();
})();`;

export async function OperationsView({ locale, beachSlug, query }: { locale: Locale; beachSlug: string; query: Query }) {
  if (!slugPattern.test(beachSlug)) notFound();
  const t = getDictionary(locale, config.brandName);
  const o = t.ops;
  const { me, token } = await requireMe(locale);
  const membership = me.memberships.find((entry) => entry.beachSlug === beachSlug);
  if (!membership || !can(membership.role, 'inventory.read')) notFound();
  const role = membership.role;
  const other = locales.find((candidate) => candidate !== locale) ?? locale;

  // «Oggi» is anchored to the time zone of the beach club, read from its public card.
  const card = await api.beach(beachSlug);
  const timezone = card.ok ? card.data.beach.timezone : 'Europe/Rome';
  const todayDay = today(timezone);
  const asked = first(query.day);
  const day = asked && dayPattern.test(asked) ? asked : todayDay;

  const view = readView(first(query.vista));
  const selecting = first(query.selezione) === '1' && can(role, 'inventory.block');
  const search = (first(query.q) ?? '').trim().slice(0, 80);

  const [ops, canvasResult] = await Promise.all([
    apiCall<OpsData>('GET', `/v1/manage/beaches/${beachSlug}/operations?day=${day}`, { token }),
    // The drawing of the scene: the console reuses the editor's canvas, never a second layout.
    can(role, 'layout.gaps') ? apiCall<OpsCanvas>('GET', `/v1/manage/beaches/${beachSlug}/layout`, { token }) : null,
  ]);
  const canvas: OpsCanvas = canvasResult?.ok ? canvasResult.data : { seaSide: 'top', shoreGapRows: 1, landGapRows: 1, elements: [] };
  const gaps: ApiZoneGaps = { shoreGapRows: canvas.shoreGapRows, landGapRows: canvas.landGapRows };

  const base = manageTodayPath(locale, beachSlug);
  const state = { day, vista: view ?? undefined, selezione: selecting ? '1' : undefined, q: search || undefined };
  const href = (over: Partial<typeof state>) => withQuery(base, { ...state, ...over });
  const alternate = withQuery(manageTodayPath(other, beachSlug), state);

  const spots = ops.ok ? ops.data.spots : [];
  const summary = ops.ok ? ops.data.summary : null;
  const needle = search.toLowerCase();
  const matches = (spot: OpsSpot): boolean =>
    needle !== '' &&
    (spot.code.toLowerCase().includes(needle) ||
      (spot.guestName?.toLowerCase().includes(needle) ?? false) ||
      (spot.bookingCode?.toLowerCase().includes(needle) ?? false));
  const hits = spots.filter(matches).length;
  const size = planSize(spots, canvas.elements);
  const common = { lang: locale, beach: beachSlug, day };
  const manageHref = `${accountPath(locale, 'manage', beachSlug)}?day=${day}`;

  const scene = (
    <div
      className={`plan ops ops--${view ?? 'auto'}${selecting ? ' ops--selecting' : ''}`}
      role="group"
      aria-labelledby="scena-titolo"
      style={{ '--plan-cols': size.cols, '--plan-lanes': size.lanes, '--plan-cell': `${opsCellRem}rem` } as CSSProperties}
    >
      <div className="plan__head">
        <h2 id="scena-titolo">{o.sceneTitle}</h2>
        <p>{selecting ? o.selectLead : o.sceneLead}</p>
      </div>
      <OpsLegend locale={locale} />
      <PlanCanvas
        locale={locale}
        gaps={gaps}
        seaSide={canvas.seaSide}
        elements={canvas.elements}
        spots={spots}
        idPrefix="scena"
        cellRem={opsCellRem}
        renderSpot={(spot) => <OpsTile locale={locale} spot={spot} selecting={selecting} hit={matches(spot)} />}
      />
    </div>
  );

  return (
    <PageShell
      locale={locale}
      page="help"
      highlight={false}
      alternatePath={alternate}
      crumbs={[
        { label: t.account.overviewTitle, href: accountPath(locale, 'overview') },
        { label: membership.beachName, href: accountPath(locale, 'manage', beachSlug) },
        { label: o.short },
      ]}
      signedInAs={me.user.name}
    >
      <PageHead title={o.title(membership.beachName)} lead={o.lead} />
      <section className={`section section--ops ops-view-${view ?? 'auto'}`}>
        <div className="container stack">
          <Notice locale={locale} query={query} />

          {/* The top bar: search of the day, the way to the desk and the nearby pages. */}
          <div className="ops-bar">
            <form className="ops-bar__search" method="get" action={base}>
              <Hidden values={{ day, ...(view ? { vista: view } : {}), ...(selecting ? { selezione: '1' } : {}) }} />
              <div className="field">
                <label htmlFor="ricerca">{o.searchLabel}</label>
                <input id="ricerca" name="q" defaultValue={search} maxLength={80} autoComplete="off" aria-describedby="ricerca-aiuto" />
                <p className="field__hint" id="ricerca-aiuto">
                  {o.searchHint}
                </p>
              </div>
              <button className="button button--secondary" type="submit">
                {o.searchButton}
              </button>
            </form>
            <p className="ops-bar__links">
              <Link className="button" href={manageHref}>
                {o.newBooking}
              </Link>
              <Link className="button button--secondary" href={manageHref}>
                {o.toManage}
              </Link>
              {can(role, 'reports.read') ? (
                <Link className="button button--secondary" href={manageStatsPath(locale, beachSlug)}>
                  {o.toStats}
                </Link>
              ) : null}
              <a className="button button--secondary" href={href({})}>
                {o.refresh}
              </a>
            </p>
          </div>

          {search ? (
            <p className={hits > 0 ? 'alert alert--info' : 'alert'} role="status">
              {hits > 0 ? o.searchResults(hits) : o.searchNone} <a href={href({ q: undefined })}>{o.clearSearch}</a>
            </p>
          ) : null}

          {/* Date navigation, anchored to the beach club's time zone. */}
          <nav className="ops-nav" aria-label={t.account.day}>
            <a className="button button--secondary ops-nav__arrow" href={href({ day: shiftDay(day, -1) })}>
              <span aria-hidden="true">←</span>
              <span className="visually-hidden">{o.prevDay}</span>
            </a>
            <strong className="ops-nav__day">{formatDay(day, locale)}</strong>
            <a className="button button--secondary ops-nav__arrow" href={href({ day: shiftDay(day, 1) })}>
              <span aria-hidden="true">→</span>
              <span className="visually-hidden">{o.nextDay}</span>
            </a>
            <a className="button button--secondary" href={href({ day: todayDay })} aria-current={day === todayDay ? 'true' : undefined}>
              {o.todayButton}
            </a>
            <form className="ops-nav__form" method="get" action={base}>
              <Hidden values={{ ...(view ? { vista: view } : {}), ...(selecting ? { selezione: '1' } : {}), ...(search ? { q: search } : {}) }} />
              <label className="visually-hidden" htmlFor="giorno">
                {t.account.day}
              </label>
              <input id="giorno" type="date" name="day" defaultValue={day} required />
              <button className="button button--secondary" type="submit">
                {t.account.show}
              </button>
            </form>
          </nav>

          {/* The three views and the selection mode, all in the query string. */}
          <div className="ops-tools">
            <p className="ops-views" role="group" aria-label={o.viewsLabel}>
              {viewIds.map((id) => (
                <a
                  key={id}
                  className={view === id ? 'button button--small' : 'button button--secondary button--small'}
                  href={href({ vista: id })}
                  aria-current={view === id ? 'true' : undefined}
                >
                  {o.views[id]}
                </a>
              ))}
            </p>
            {can(role, 'inventory.block') ? (
              <p>
                <a className={selecting ? 'button button--small' : 'button button--secondary button--small'} href={href({ selezione: selecting ? undefined : '1' })}>
                  {selecting ? o.selectOff : o.selectOn}
                </a>
              </p>
            ) : null}
          </div>
          {view === null ? <p className="prose ops-note">{o.autoViewNote}</p> : null}
          <p className="prose ops-note ops-note--print">{o.printNote}</p>

          {!ops.ok ? (
            <div className="empty">
              <h2>{o.unavailableTitle}</h2>
              <p>{o.unavailableText}</p>
            </div>
          ) : (
            <>
              {selecting ? (
                <form method="post" action="/azioni/console-blocco" id="selezione">
                  <Hidden values={{ ...common, ...(view ? { vista: view } : {}), ...(search ? { q: search } : {}) }} />
                  <div className="ops-actions">
                    <div className="field">
                      <label htmlFor="nota-blocco">{o.noteLabel}</label>
                      <input id="nota-blocco" name="reason" maxLength={200} autoComplete="off" />
                    </div>
                    <button className="button" type="submit" name="op" value="block">
                      {o.blockAction}
                    </button>
                    <button className="button button--secondary" type="submit" name="op" value="unblock">
                      {o.unblockAction}
                    </button>
                    <div className="ops-quick" id="selezione-rapida" data-all={o.quickAllFree} data-none={o.quickNone} data-prefix={o.selectedPrefix} />
                  </div>
                  {scene}
                </form>
              ) : (
                scene
              )}
              {selecting ? <script dangerouslySetInnerHTML={{ __html: quickSelectionScript }} /> : null}

              {/* The summary of the day: counts, guests and, only with reports.read, the takings. */}
              {summary ? (
                <div className="panel ops-summary">
                  <h2>{o.summaryTitle}</h2>
                  <dl className="ops-summary__grid">
                    {operationalStates.map((state) => (
                      <div key={state}>
                        <dt>{o.states[state]}</dt>
                        <dd>{summary.counts[state]}</dd>
                      </div>
                    ))}
                    <div>
                      <dt>{o.expectedGuests}</dt>
                      <dd>{summary.expectedGuests}</dd>
                    </div>
                    <div>
                      <dt>{o.presentGuests}</dt>
                      <dd>{summary.presentGuests}</dd>
                    </div>
                    {summary.revenueCents === null ? null : (
                      <div className="ops-summary__revenue">
                        <dt>{o.revenue}</dt>
                        <dd>{formatMoney(summary.revenueCents, locale)}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              ) : null}

              {/* The equivalent table: every datum of every card, names in full. */}
              <div className="panel ops-table">
                <h2>{o.tableTitle}</h2>
                <DataTable
                  label={o.tableTitle}
                  columns={[
                    { label: t.account.spot },
                    { label: o.colZone },
                    { label: o.colType },
                    { label: o.colEquipment },
                    { label: t.account.state },
                    { label: t.account.price, numeric: true },
                    { label: o.colGuest },
                    { label: o.colBooking },
                    { label: t.account.actions },
                  ]}
                >
                  {spots.map((spot) => (
                    <Row key={spot.spotId} id={`riga-${spot.code}`} className={matches(spot) ? 'is-hit' : undefined}>
                      <RowHead>
                        {spot.code}
                        {spot.shared ? <> <span className="badge">{t.account.sharedMark}</span></> : null}
                        {matches(spot) ? <> <span className="badge">{o.hit}</span></> : null}
                      </RowHead>
                      <Cell label={o.colZone}>{`${t.booking.zones[spot.zone]} · ${t.booking.row(spot.rowNumber)}`}</Cell>
                      <Cell label={o.colType}>{spot.typeName}</Cell>
                      <Cell label={o.colEquipment}>{t.booking.equipment(spot.umbrellas, spot.sunbeds)}</Cell>
                      <Cell label={t.account.state}>
                        {o.states[spot.state]}
                        {spot.notForSale ? ` (${o.notForSale[spot.notForSale]})` : ''}
                      </Cell>
                      <Cell label={t.account.price} numeric>
                        {spot.priceCents === null ? null : formatMoney(spot.priceCents, locale)}
                      </Cell>
                      <Cell label={o.colGuest}>{spot.guestName}</Cell>
                      <Cell label={o.colBooking}>{spot.bookingCode}</Cell>
                      <Cell label={t.account.actions}>
                        {spot.bookingCode && can(role, 'bookings.move') ? (
                          <Link href={manageHref}>
                            {o.moveAtDesk} <span className="visually-hidden">{spot.bookingCode}</span>
                          </Link>
                        ) : null}
                      </Cell>
                    </Row>
                  ))}
                </DataTable>
              </div>
            </>
          )}
        </div>
      </section>
    </PageShell>
  );
}
