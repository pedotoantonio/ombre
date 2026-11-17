import { notFound } from 'next/navigation';
import {
  accountPath,
  can,
  config,
  getDictionary,
  locales,
  managePlannerPath,
  manageTodayPath,
  spotZones,
  type Locale,
  type SpotMark as SpotMarkKind,
  type SpotZone,
} from '@ombre/shared';
import { api, apiCall, dayPattern, formatDay, isDay, slugPattern, today } from '@/lib/api';
import { Notice, requireMe } from './account';
import { SpotMark } from './beach';
import { PageHead, PageShell } from './PageShell';

// The planner page (spec §3, D33): rows are the spots of the drawing, columns the days of
// a window of 7, 14 or 31 days, every cell the state of one spot on one day, in text beyond
// the colour (D20). Read only and served by the server, with no JavaScript at all: window,
// zone filter and search live in the query string, the changes happen where they already
// exist (desk, reception, console). A booked or free cell links to the console of its day.

type Query = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

/** The three windows of the page: never more than 31 days per request (D33). */
const windows = [7, 14, 31] as const;
type WindowDays = (typeof windows)[number];

type PlannerCellState = 'not_published' | 'free' | 'blocked' | 'not_for_sale' | 'booked';

interface PlannerCell {
  day: string;
  state: PlannerCellState;
  bookingCode: string | null;
  guestName: string | null;
}

interface PlannerSpot {
  spotId: string;
  code: string;
  zone: SpotZone;
  rowNumber: number;
  col: number;
  typeName: string;
  typeMark: SpotMarkKind;
  cells: PlannerCell[];
}

interface PlannerData {
  from: string;
  to: string;
  days: string[];
  spots: PlannerSpot[];
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

/** The initials of the guest, shown inside a booked cell next to its full title. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 3).map((part) => (part[0] ?? '').toUpperCase()).join('');
  return letters || name.slice(0, 2).toUpperCase();
}

export async function PlannerView({ locale, beachSlug, query }: { locale: Locale; beachSlug: string; query: Query }) {
  if (!slugPattern.test(beachSlug)) notFound();
  const t = getDictionary(locale, config.brandName);
  const p = t.planner;
  const { me, token } = await requireMe(locale);
  const membership = me.memberships.find((entry) => entry.beachSlug === beachSlug);
  // Whoever sees the console sees the planner (D33): manager and reception, never the rest.
  if (!membership || !can(membership.role, 'inventory.read')) notFound();
  const other = locales.find((candidate) => candidate !== locale) ?? locale;

  // «Oggi» is anchored to the time zone of the beach club, like the console does.
  const card = await api.beach(beachSlug);
  const timezone = card.ok ? card.data.beach.timezone : 'Europe/Rome';
  const todayDay = today(timezone);
  const asked = first(query.da);
  const from = asked && dayPattern.test(asked) && isDay(asked) ? asked : todayDay;
  const daysAsked = Number(first(query.giorni));
  const days: WindowDays = (windows as readonly number[]).includes(daysAsked) ? (daysAsked as WindowDays) : 14;
  const zoneAsked = first(query.zona);
  const zone = (spotZones as readonly string[]).includes(zoneAsked ?? '') ? (zoneAsked as SpotZone) : undefined;
  const search = (first(query.q) ?? '').trim().slice(0, 80);
  const to = shiftDay(from, days - 1);

  const grid = await apiCall<PlannerData>('GET', withQuery(`/v1/manage/beaches/${beachSlug}/planner`, { from, to, zone }), { token });

  const base = managePlannerPath(locale, beachSlug);
  const state = { da: from, giorni: String(days), zona: zone, q: search || undefined };
  const href = (over: Partial<typeof state>) => withQuery(base, { ...state, ...over });
  const alternate = withQuery(managePlannerPath(other, beachSlug), state);
  const consoleHref = (day: string, code?: string) =>
    `${withQuery(manageTodayPath(locale, beachSlug), { day, postazione: code })}${code ? '#scheda' : ''}`;

  // The search filters the rows of the page: code, guest or booking code of the window.
  const needle = search.toLowerCase();
  const allSpots = grid.ok ? grid.data.spots : [];
  const spots =
    needle === ''
      ? allSpots
      : allSpots.filter(
          (spot) =>
            spot.code.toLowerCase().includes(needle) ||
            spot.cells.some(
              (cell) => (cell.guestName?.toLowerCase().includes(needle) ?? false) || (cell.bookingCode?.toLowerCase().includes(needle) ?? false),
            ),
        );
  const dayList = grid.ok ? grid.data.days : [];
  const headFormat = new Intl.DateTimeFormat(locale === 'it' ? 'it-IT' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'UTC' });

  return (
    <PageShell
      locale={locale}
      page="help"
      highlight={false}
      alternatePath={alternate}
      crumbs={[
        { label: t.account.overviewTitle, href: accountPath(locale, 'overview') },
        { label: membership.beachName, href: accountPath(locale, 'manage', beachSlug) },
        { label: p.short },
      ]}
      signedInAs={me.user.name}
    >
      <PageHead title={p.title(membership.beachName)} lead={p.lead} />
      <section className="section section--planner">
        <div className="container stack">
          <Notice locale={locale} query={query} />

          {/* Window, zone and search: one GET form, everything in the query string. */}
          <form className="form-row planner-filters" method="get" action={base}>
            <div className="field">
              <label htmlFor="planner-da">{p.fromLabel}</label>
              <input id="planner-da" type="date" name="da" defaultValue={from} required />
            </div>
            <div className="field">
              <label htmlFor="planner-giorni">{p.windowLabel}</label>
              <select id="planner-giorni" name="giorni" defaultValue={String(days)}>
                {windows.map((option) => (
                  <option key={option} value={option}>
                    {p.windowName(option)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="planner-zona">{p.zoneLabel}</label>
              <select id="planner-zona" name="zona" defaultValue={zone ?? ''}>
                <option value="">{p.allZones}</option>
                {spotZones.map((candidate) => (
                  <option key={candidate} value={candidate}>
                    {t.booking.zones[candidate]}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="planner-ricerca">{p.searchLabel}</label>
              <input id="planner-ricerca" name="q" defaultValue={search} maxLength={80} autoComplete="off" aria-describedby="planner-ricerca-aiuto" />
              <p className="field__hint" id="planner-ricerca-aiuto">
                {p.searchHint}
              </p>
            </div>
            <button className="button button--secondary" type="submit">
              {p.show}
            </button>
          </form>

          {/* The window in words, with the arrows to the previous and the next one. */}
          <nav className="ops-nav" aria-label={p.windowLabel}>
            <a className="button button--secondary ops-nav__arrow" href={href({ da: shiftDay(from, -days) })}>
              <span aria-hidden="true">←</span>
              <span className="visually-hidden">{p.prevWindow}</span>
            </a>
            <strong className="planner__window">{`${formatDay(from, locale)} → ${formatDay(to, locale)}`}</strong>
            <a className="button button--secondary ops-nav__arrow" href={href({ da: shiftDay(from, days) })}>
              <span aria-hidden="true">→</span>
              <span className="visually-hidden">{p.nextWindow}</span>
            </a>
          </nav>

          {search ? (
            <p className={spots.length > 0 ? 'alert alert--info' : 'alert'} role="status">
              {spots.length > 0 ? p.searchResults(spots.length) : p.searchNone} <a href={href({ q: undefined })}>{p.clearSearch}</a>
            </p>
          ) : null}

          {/* The legend: every state with its abbreviation, never colour alone (D20). */}
          <ul className="plan-legend planner-legend" aria-label={p.legendTitle}>
            {(['free', 'booked', 'blocked', 'not_for_sale', 'not_published'] as const).map((cellState) => (
              <li key={cellState}>
                <span className={`planner-swatch planner-cell--${cellState}`} aria-hidden="true">
                  {p.abbrev[cellState]}
                </span>
                {p.states[cellState]}
              </li>
            ))}
          </ul>
          <p className="prose ops-note ops-note--print">{p.printNote}</p>

          {!grid.ok ? (
            <div className="empty">
              <h2>{p.unavailableTitle}</h2>
              <p>{p.unavailableText}</p>
            </div>
          ) : spots.length === 0 && !search ? (
            <div className="empty">
              <h2>{p.emptyTitle}</h2>
              <p>{p.emptyText}</p>
            </div>
          ) : (
            <div className="planner__scroll" tabIndex={0} role="group" aria-label={p.gridLabel}>
              <table className="planner">
                <caption className="visually-hidden">{p.gridLabel}</caption>
                <thead>
                  <tr>
                    <th scope="col" className="planner__corner">
                      {p.colSpot}
                    </th>
                    {dayList.map((day) => (
                      <th scope="col" key={day}>
                        <span aria-hidden="true">{headFormat.format(new Date(`${day}T00:00:00Z`))}</span>
                        <span className="visually-hidden">{formatDay(day, locale)}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {spots.map((spot) => (
                    <tr key={spot.spotId}>
                      <th scope="row">
                        <span className="planner__spot">
                          <SpotMark mark={spot.typeMark} status="free" />
                          {spot.code}
                          <span className="visually-hidden">{`, ${spot.typeName}, ${t.booking.zones[spot.zone]}, ${t.booking.row(spot.rowNumber)}`}</span>
                        </span>
                      </th>
                      {spot.cells.map((cell) => (
                        <PlannerCellView key={cell.day} locale={locale} spot={spot} cell={cell} consoleHref={consoleHref} />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </PageShell>
  );
}

/** One cell of the grid: state in text beyond the colour, a link to the console on free and booked days. */
function PlannerCellView({
  locale,
  spot,
  cell,
  consoleHref,
}: {
  locale: Locale;
  spot: PlannerSpot;
  cell: PlannerCell;
  consoleHref: (day: string, code?: string) => string;
}) {
  const p = getDictionary(locale, config.brandName).planner;
  const classes = `planner-cell planner-cell--${cell.state}`;
  if (cell.state === 'booked') {
    const who = cell.guestName ?? cell.bookingCode ?? p.states.booked;
    const label = cell.guestName ? initialsOf(cell.guestName) : (cell.bookingCode ?? p.abbrev.booked);
    const full = [cell.guestName, cell.bookingCode].filter(Boolean).join(' · ') || p.states.booked;
    return (
      <td className={classes}>
        <a href={consoleHref(cell.day, spot.code)} title={full}>
          <span aria-hidden="true">{label}</span>
          <span className="visually-hidden">{p.cellBooked(who)}</span>
        </a>
      </td>
    );
  }
  if (cell.state === 'free') {
    return (
      <td className={classes}>
        <a href={consoleHref(cell.day)} title={p.states.free}>
          <span aria-hidden="true">{p.abbrev.free}</span>
          <span className="visually-hidden">{p.cellFree}</span>
        </a>
      </td>
    );
  }
  return (
    <td className={classes} title={p.states[cell.state]}>
      <span aria-hidden="true">{p.abbrev[cell.state]}</span>
      <span className="visually-hidden">{p.states[cell.state]}</span>
    </td>
  );
}
