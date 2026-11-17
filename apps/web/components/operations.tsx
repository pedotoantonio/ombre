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
  manageCollectPath,
  managePlannerPath,
  manageStatsPath,
  manageTodayPath,
  spotZones,
  type Locale,
  type MembershipRole,
  type SeaSide,
  type SpotMark as SpotMarkKind,
  type SpotZone,
} from '@ombre/shared';
import { api, apiCall, dayPattern, formatDay, formatPeriod, slugPattern, today, type ApiLayoutElement, type ApiResult, type ApiZoneGaps } from '@/lib/api';
import { Hidden, Notice, requireMe } from './account';
import { PlanCanvas, planGapRem, planLaneRem, planSize, SpotMark } from './beach';
import { ManageShell } from './manage-shell';
import { PageHead } from './PageShell';
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

/** The card of one spot on the day (spec §2, D32), as the operations/spot route answers it. */
interface SpotCardData {
  currency: string;
  day: string;
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
  /** Rental label («Stagionale», «Albergo» or a custom text): management data, never public. */
  rentalType: string | null;
  state: OperationalState;
  notForSale: 'never_published' | 'withdrawn' | null;
  blockedReason: string | null;
  shared: boolean;
  priceCents: number | null;
  booking: {
    code: string;
    guestName: string;
    source: string;
    presence: 'expected' | 'inside' | 'outside_reentry_allowed' | 'ended';
    /** Price of THIS day; the money of the whole period lives in `group` (D38). */
    totalCents: number;
    paidCents: number;
    remainingCents: number;
    paymentState: 'paid' | 'partial' | 'to_collect';
    /** The booking group of the day: one code, one period, one balance (D38). */
    group: {
      code: string;
      from: string;
      to: string;
      days: number;
      totalCents: number;
      paidCents: number;
      remainingCents: number;
      paymentState: 'paid' | 'partial' | 'to_collect';
    };
  } | null;
}

/** The code of a spot, as the layout writes it: the only shape the card is asked for. */
const spotCodePattern = /^[A-Z0-9][A-Z0-9-]{0,9}$/;

/** The three explicit views; null is the automatic one: full on wide screens, numbers on phones. */
const viewIds = ['completa', 'numeri', 'dotazioni'] as const;
type ViewId = (typeof viewIds)[number];

function readView(value: string | undefined): ViewId | null {
  return (viewIds as readonly string[]).includes(value ?? '') ? (value as ViewId) : null;
}

/** Cards are wider than the public map cells: at least 88 px, so the full view stays readable. */
const opsCellRem = 5.5;

/** The stepped scale of the scene (D37): the server sets the cell width from the query string. */
const scaleIds = ['compatta', 'normale', 'ampia', 'adatta'] as const;
type ScaleId = (typeof scaleIds)[number];

function readScale(value: string | undefined): ScaleId {
  return (scaleIds as readonly string[]).includes(value ?? '') ? (value as ScaleId) : 'normale';
}

const scaleCellRem: Record<Exclude<ScaleId, 'adatta'>, number> = { compatta: 4, normale: opsCellRem, ampia: 7 };

/**
 * «Adatta»: the cell width that lets the whole drawing fit a typical screen, computed by
 * the server from the columns and lanes of the drawing, clamped to a readable minimum.
 */
function fitCellRem(cols: number, lanes: number): number {
  // The typical room of the scene: the container minus side navigation, paddings and row labels.
  const room = 58 - 4.5 - lanes * (planLaneRem + planGapRem) - (cols - 1) * planGapRem;
  return Math.max(3, Math.min(scaleCellRem.ampia, Math.floor((room / cols) * 4) / 4));
}

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

/** One card of the scene: a link to the spot card (spec §2), or the whole selection checkbox in selection mode. */
function OpsTile({ locale, spot, selecting, hit, cardHref }: { locale: Locale; spot: OpsSpot; selecting: boolean; hit: boolean; cardHref: string }) {
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
      <a className={classes} href={cardHref}>
        {content}
        <span className="visually-hidden"> {o.openCard(spot.code)}</span>
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

/**
 * The spot card panel (spec §2, D32): the data of the day, the booking with its paid and
 * outstanding amounts, and only the actions that fit state and permissions. It is part of
 * the page, rendered by the server between the scene and the table: no script involved.
 */
function SpotCardPanel({
  locale,
  role,
  code,
  result,
  freeSpots,
  common,
  closeHref,
  manageHref,
  view,
  search,
  keep,
}: {
  locale: Locale;
  role: MembershipRole;
  code: string;
  result: ApiResult<SpotCardData> | null;
  freeSpots: OpsSpot[];
  common: { lang: Locale; beach: string; day: string };
  closeHref: string;
  manageHref: string;
  view: ViewId | null;
  search: string;
  /** The filter and scale parameters of the page (D37), to come back as they were. */
  keep: Record<string, string>;
}) {
  const t = getDictionary(locale, config.brandName);
  const o = t.ops;
  const closeLink = (
    <a className="button button--secondary button--small" href={closeHref}>
      {o.cardClose}
    </a>
  );
  if (!result?.ok) {
    // An unknown code or an unpublished day: a polite message in the page, never a bare 404.
    const unreachable = result !== null && result.status !== 404 && result.status !== 400;
    return (
      <aside id="scheda" className="panel ops-card" aria-labelledby="scheda-titolo">
        <div className="ops-card__head">
          <h2 id="scheda-titolo">{o.cardTitle(code)}</h2>
          {closeLink}
        </div>
        <p className="prose">{unreachable ? o.unavailableText : o.cardNotFound(code)}</p>
      </aside>
    );
  }
  const card = result.data;
  const booking = card.booking;
  const hidden = { ...common, ...(view ? { vista: view } : {}), ...(search ? { q: search } : {}), ...keep, postazione: card.code };
  const canDesk = card.state === 'free' && can(role, 'bookings.create');
  const canBlockForm = (card.state === 'free' || card.state === 'blocked') && can(role, 'inventory.block');
  const canCollect = booking !== null && booking.remainingCents > 0 && can(role, 'bookings.create');
  const canMove = booking !== null && can(role, 'bookings.move') && freeSpots.length > 0;
  return (
    <aside id="scheda" className="panel ops-card" aria-labelledby="scheda-titolo">
      <div className="ops-card__head">
        <h2 id="scheda-titolo">{o.cardTitle(card.code)}</h2>
        {closeLink}
      </div>
      <dl className="ops-card__grid">
        <div>
          <dt>{t.account.spot}</dt>
          <dd>
            {card.code}
            {card.shared ? <span className="badge">{t.account.sharedMark}</span> : null}
          </dd>
        </div>
        <div>
          <dt>{o.colZone}</dt>
          <dd>{`${t.booking.zones[card.zone]} · ${t.booking.row(card.rowNumber)}`}</dd>
        </div>
        <div>
          <dt>{o.colType}</dt>
          <dd>
            <span className={`ops-swatch ops-tile--${card.state}`}>
              <SpotMark mark={card.typeMark} status={markStatus(card.state)} />
            </span>
            {card.typeName}
          </dd>
        </div>
        <div>
          <dt>{o.colEquipment}</dt>
          <dd>{`${t.booking.equipment(card.umbrellas, card.sunbeds)}, ${t.booking.guests(card.maxGuests).toLowerCase()}`}</dd>
        </div>
        {/* The rental label of the spot (D35): «Stagionale», «Albergo» or the manager's own text. */}
        <div>
          <dt>{o.rentalTypeLabel}</dt>
          <dd>{card.rentalType ?? '—'}</dd>
        </div>
        <div>
          <dt>{t.account.price}</dt>
          <dd>{card.priceCents === null ? '—' : formatMoney(card.priceCents, locale)}</dd>
        </div>
        <div>
          <dt>{t.account.state}</dt>
          <dd>{`${o.states[card.state]}${card.notForSale ? ` (${o.notForSale[card.notForSale]})` : ''}`}</dd>
        </div>
        {card.state === 'blocked' ? (
          <div>
            <dt>{o.blockedReasonLabel}</dt>
            <dd>{card.blockedReason ?? o.noReason}</dd>
          </div>
        ) : null}
      </dl>
      {booking ? (
        <>
          <h3>{o.colBooking}</h3>
          <dl className="ops-card__grid">
            <div>
              <dt>{t.account.code}</dt>
              <dd>{booking.code}</dd>
            </div>
            <div>
              <dt>{o.colGuest}</dt>
              <dd>{booking.guestName}</dd>
            </div>
            <div>
              <dt>{o.channel}</dt>
              <dd>{booking.source === 'desk' ? t.stats.channels.desk : t.stats.channels.online}</dd>
            </div>
            <div>
              <dt>{t.account.presence}</dt>
              <dd>{t.account.presences[booking.presence]}</dd>
            </div>
            <div>
              {/* Per un gruppo di più giornate questo è il prezzo della sola giornata (D38). */}
              <dt>{booking.group.days > 1 ? o.dayTotalLabel : o.totalLabel}</dt>
              <dd>{formatMoney(booking.totalCents, locale)}</dd>
            </div>
            {booking.group.days > 1 ? null : (
              <>
                <div>
                  <dt>{o.collectedLabel}</dt>
                  <dd>{formatMoney(booking.paidCents, locale)}</dd>
                </div>
                <div>
                  <dt>{o.remainingLabel}</dt>
                  <dd>{formatMoney(booking.remainingCents, locale)}</dd>
                </div>
                <div>
                  <dt>{t.account.colPayment}</dt>
                  <dd>{t.account.paymentStates[booking.paymentState]}</dd>
                </div>
              </>
            )}
          </dl>
          {/* Il blocco del gruppo (D38): codice, periodo, totale, incassato, residuo e stato in parole. */}
          {booking.group.days > 1 ? (
            <>
              <h3>{o.groupTitle}</h3>
              <dl className="ops-card__grid">
                <div>
                  <dt>{t.account.code}</dt>
                  <dd>{booking.group.code}</dd>
                </div>
                <div>
                  <dt>{t.booking.periodRow}</dt>
                  <dd>{t.booking.periodValue(formatPeriod(booking.group.from, booking.group.to, locale), booking.group.days)}</dd>
                </div>
                <div>
                  <dt>{o.totalLabel}</dt>
                  <dd>{formatMoney(booking.group.totalCents, locale)}</dd>
                </div>
                <div>
                  <dt>{o.collectedLabel}</dt>
                  <dd>{formatMoney(booking.group.paidCents, locale)}</dd>
                </div>
                <div>
                  <dt>{o.remainingLabel}</dt>
                  <dd>{formatMoney(booking.group.remainingCents, locale)}</dd>
                </div>
                <div>
                  <dt>{t.account.colPayment}</dt>
                  <dd>{t.account.paymentStates[booking.group.paymentState]}</dd>
                </div>
              </dl>
            </>
          ) : null}
        </>
      ) : null}
      {canDesk || canBlockForm || canCollect || canMove || booking !== null ? (
        <div className="ops-card__actions">
          {canDesk ? (
            <Link className="button" href={`${manageHref}&postazione=${encodeURIComponent(card.code)}#banco`}>
              {o.bookAtDesk}
            </Link>
          ) : null}
          {canBlockForm ? (
            <form method="post" action="/azioni/console-blocco" className="ops-card__form">
              <Hidden values={{ ...hidden, spot: card.spotId }} />
              {card.state === 'free' ? (
                <div className="field">
                  <label htmlFor="scheda-nota">{o.noteLabel}</label>
                  <input id="scheda-nota" name="reason" maxLength={200} autoComplete="off" />
                </div>
              ) : null}
              <button className="button button--secondary" type="submit" name="op" value={card.state === 'free' ? 'block' : 'unblock'}>
                {card.state === 'free' ? t.account.block : t.account.unblock}
              </button>
            </form>
          ) : null}
          {booking && canCollect ? (
            <Link className="button" href={`${manageCollectPath(locale, common.beach)}?code=${encodeURIComponent(booking.code)}`}>
              {o.collectAction}
              <span className="visually-hidden"> {booking.code}</span>
            </Link>
          ) : null}
          {booking && canMove ? (
            <form method="post" action="/azioni/banco-sposta" className="inline-form">
              <Hidden values={{ ...common, code: booking.code }} />
              <label className="visually-hidden" htmlFor="scheda-sposta">
                {t.account.moveTo}
              </label>
              <select id="scheda-sposta" name="spot" required>
                {freeSpots.map((free) => (
                  <option key={free.spotId} value={free.spotId}>
                    {free.code}
                  </option>
                ))}
              </select>
              <button className="button button--secondary" type="submit">
                {t.account.move} <span className="visually-hidden">{booking.code}</span>
              </button>
            </form>
          ) : null}
          {booking ? (
            <Link className="button button--secondary" href={manageHref}>
              {o.receptionLink}
            </Link>
          ) : null}
        </div>
      ) : null}
    </aside>
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
  // The GET filters by zone and operational state (D37): they restrict the cards of the
  // scene and the rows of the table, never the counts of the summary.
  const zoneAsked = first(query.zona);
  const zone = (spotZones as readonly string[]).includes(zoneAsked ?? '') ? (zoneAsked as SpotZone) : undefined;
  const stateAsked = first(query.stato);
  const stateFilter = (operationalStates as readonly string[]).includes(stateAsked ?? '') ? (stateAsked as OperationalState) : undefined;
  const scale = readScale(first(query.scala));
  // The open spot card (spec §2, D32): a code in the query string, rendered by the server.
  const cardAsked = (first(query.postazione) ?? '').trim().toUpperCase();
  const cardCode = spotCodePattern.test(cardAsked) ? cardAsked : undefined;

  const [ops, canvasResult, cardResult] = await Promise.all([
    apiCall<OpsData>('GET', `/v1/manage/beaches/${beachSlug}/operations?day=${day}`, { token }),
    // The drawing of the scene: the console reuses the editor's canvas, never a second layout.
    can(role, 'layout.gaps') ? apiCall<OpsCanvas>('GET', `/v1/manage/beaches/${beachSlug}/layout`, { token }) : null,
    cardCode ? apiCall<SpotCardData>('GET', `/v1/manage/beaches/${beachSlug}/operations/spot?day=${day}&code=${encodeURIComponent(cardCode)}`, { token }) : null,
  ]);
  const canvas: OpsCanvas = canvasResult?.ok ? canvasResult.data : { seaSide: 'top', shoreGapRows: 1, landGapRows: 1, elements: [] };
  const gaps: ApiZoneGaps = { shoreGapRows: canvas.shoreGapRows, landGapRows: canvas.landGapRows };

  const base = manageTodayPath(locale, beachSlug);
  const state = {
    day,
    vista: view ?? undefined,
    selezione: selecting ? '1' : undefined,
    q: search || undefined,
    zona: zone,
    stato: stateFilter,
    scala: scale === 'normale' ? undefined : scale,
    postazione: cardCode,
  };
  /** The new parameters, ready to ride along inside the GET forms of the page. */
  const keep = {
    ...(zone ? { zona: zone } : {}),
    ...(stateFilter ? { stato: stateFilter } : {}),
    ...(scale !== 'normale' ? { scala: scale } : {}),
  };
  const href = (over: Partial<typeof state>) => withQuery(base, { ...state, ...over });
  const alternate = withQuery(manageTodayPath(other, beachSlug), state);
  /** The address that opens the card of one spot, keeping day, view and search. */
  const cardHrefOf = (code: string) => `${href({ postazione: code })}#scheda`;

  const spots = ops.ok ? ops.data.spots : [];
  const summary = ops.ok ? ops.data.summary : null;
  const needle = search.toLowerCase();
  const matches = (spot: OpsSpot): boolean =>
    needle !== '' &&
    (spot.code.toLowerCase().includes(needle) ||
      (spot.guestName?.toLowerCase().includes(needle) ?? false) ||
      (spot.bookingCode?.toLowerCase().includes(needle) ?? false));
  // The filtered set feeds the scene and the table; sizes and summary stay on the whole day.
  const shown = spots.filter((spot) => (zone === undefined || spot.zone === zone) && (stateFilter === undefined || spot.state === stateFilter));
  const hits = shown.filter(matches).length;
  const size = planSize(spots, canvas.elements);
  const cellRem = scale === 'adatta' ? fitCellRem(size.cols, size.lanes) : scaleCellRem[scale];
  const common = { lang: locale, beach: beachSlug, day };
  const manageHref = `${accountPath(locale, 'manage', beachSlug)}?day=${day}`;
  // The free spots of the day feed the «Sposta» dropdown of the card: no extra query.
  const freeSpots = spots.filter((spot) => spot.state === 'free');
  // Occupancy of the whole day (spec §2): occupied over sellable, reused by strip and summary.
  const occupied = summary ? summary.counts.reserved + summary.counts.expected + summary.counts.present + summary.counts.departed : 0;
  const sellable = summary ? spots.length - summary.counts.blocked - summary.counts.not_for_sale : 0;
  const occupancyPct = summary !== null && sellable > 0 ? Math.round((occupied / sellable) * 100) : null;

  const scene = (
    <div
      className={`plan ops ops--${view ?? 'auto'}${selecting ? ' ops--selecting' : ''}`}
      role="group"
      aria-labelledby="scena-titolo"
      style={{ '--plan-cols': size.cols, '--plan-lanes': size.lanes, '--plan-cell': `${cellRem}rem` } as CSSProperties}
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
        spots={shown}
        idPrefix="scena"
        cellRem={cellRem}
        renderSpot={(spot) => <OpsTile locale={locale} spot={spot} selecting={selecting} hit={matches(spot)} cardHref={cardHrefOf(spot.code)} />}
      />
    </div>
  );

  return (
    <ManageShell
      locale={locale}
      beachSlug={beachSlug}
      beachName={membership.beachName}
      role={role}
      active="today"
      day={day}
      userName={me.user.name}
      alternatePath={alternate}
      crumbs={[
        { label: t.account.overviewTitle, href: accountPath(locale, 'overview') },
        { label: membership.beachName, href: accountPath(locale, 'manage', beachSlug) },
        { label: o.short },
      ]}
    >
      <PageHead title={o.title(membership.beachName)} lead={o.lead} />
      <section className={`section section--ops ops-view-${view ?? 'auto'}`}>
        <div className="container stack">
          <Notice locale={locale} query={query} />

          {/* The top bar: search of the day, the way to the desk and the nearby pages. */}
          <div className="ops-bar">
            <form className="ops-bar__search" method="get" action={base}>
              <Hidden values={{ day, ...(view ? { vista: view } : {}), ...(selecting ? { selezione: '1' } : {}), ...keep }} />
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
              <Link className="button button--secondary" href={`${managePlannerPath(locale, beachSlug)}?da=${day}`}>
                {t.planner.short}
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

          {/* The active filters in words (D37): the summary of the day stays whole. */}
          {zone || stateFilter ? (
            <p className="alert alert--info" role="status">
              {o.filterSummary(shown.length, spots.length)} <a href={href({ zona: undefined, stato: undefined })}>{o.clearFilters}</a>
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
              <Hidden values={{ ...(view ? { vista: view } : {}), ...(selecting ? { selezione: '1' } : {}), ...(search ? { q: search } : {}), ...keep }} />
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

          {/* Filters by zone and state and the stepped scale (D37): link groups like the views. */}
          <div className="ops-tools ops-filters">
            <p className="ops-views" role="group" aria-label={o.zoneFilterLabel}>
              <span className="ops-filter__name" aria-hidden="true">{o.zoneFilterLabel}:</span>
              <a
                className={zone === undefined ? 'button button--small' : 'button button--secondary button--small'}
                href={href({ zona: undefined })}
                aria-current={zone === undefined ? 'true' : undefined}
              >
                {o.allZones}
              </a>
              {spotZones.map((candidate) => (
                <a
                  key={candidate}
                  className={zone === candidate ? 'button button--small' : 'button button--secondary button--small'}
                  href={href({ zona: candidate })}
                  aria-current={zone === candidate ? 'true' : undefined}
                >
                  {t.booking.zones[candidate]}
                </a>
              ))}
            </p>
            <p className="ops-views" role="group" aria-label={o.stateFilterLabel}>
              <span className="ops-filter__name" aria-hidden="true">{o.stateFilterLabel}:</span>
              <a
                className={stateFilter === undefined ? 'button button--small' : 'button button--secondary button--small'}
                href={href({ stato: undefined })}
                aria-current={stateFilter === undefined ? 'true' : undefined}
              >
                {o.allStates}
              </a>
              {operationalStates.map((candidate) => (
                <a
                  key={candidate}
                  className={stateFilter === candidate ? 'button button--small' : 'button button--secondary button--small'}
                  href={href({ stato: candidate })}
                  aria-current={stateFilter === candidate ? 'true' : undefined}
                >
                  {o.states[candidate]}
                </a>
              ))}
            </p>
            <p className="ops-views" role="group" aria-label={o.scaleLabel}>
              <span className="ops-filter__name" aria-hidden="true">{o.scaleLabel}:</span>
              {scaleIds.map((candidate) => (
                <a
                  key={candidate}
                  className={scale === candidate ? 'button button--small' : 'button button--secondary button--small'}
                  href={href({ scala: candidate === 'normale' ? undefined : candidate })}
                  aria-current={scale === candidate ? 'true' : undefined}
                >
                  {o.scales[candidate]}
                </a>
              ))}
            </p>
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
              {/* The always visible one-line summary (D37): whole-day numbers, never filtered. */}
              {summary ? (
                <ul className="ops-strip" aria-label={o.stripLabel}>
                  <li>
                    {o.stripTotal} <strong>{spots.length}</strong>
                  </li>
                  <li>
                    {o.stripFree} <strong>{summary.counts.free}</strong>
                  </li>
                  <li>
                    {o.stripOccupied} <strong>{occupied}</strong>
                  </li>
                  <li>
                    {o.stripArrivals} <strong>{summary.counts.expected}</strong>
                  </li>
                  <li>
                    {o.stripDepartures} <strong>{summary.counts.present}</strong>
                  </li>
                  {occupancyPct === null ? null : (
                    <li>
                      {o.occupancy} <strong>{`${occupancyPct}%`}</strong>
                    </li>
                  )}
                </ul>
              ) : null}
              {selecting ? (
                <form method="post" action="/azioni/console-blocco" id="selezione">
                  <Hidden values={{ ...common, selezione: '1', ...(view ? { vista: view } : {}), ...(search ? { q: search } : {}), ...keep, ...(cardCode ? { postazione: cardCode } : {}) }} />
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

              {/* The card of one spot (spec §2, D32), between the scene and the table. */}
              {cardCode ? (
                <SpotCardPanel
                  locale={locale}
                  role={role}
                  code={cardCode}
                  result={cardResult}
                  freeSpots={freeSpots}
                  common={common}
                  closeHref={href({ postazione: undefined })}
                  manageHref={manageHref}
                  view={view}
                  search={search}
                  keep={keep}
                />
              ) : null}

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
                    {/* Occupancy (spec §2): occupied over sellable, omitted when nothing is sellable. */}
                    {occupancyPct === null ? null : (
                      <div>
                        <dt>{o.occupancy}</dt>
                        <dd>{`${occupancyPct}%`}</dd>
                      </div>
                    )}
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
                  {shown.map((spot) => (
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
                        <a href={cardHrefOf(spot.code)}>
                          {o.cardLink} <span className="visually-hidden">{spot.code}</span>
                        </a>{' '}
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
    </ManageShell>
  );
}
