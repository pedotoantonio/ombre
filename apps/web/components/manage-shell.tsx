import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  accountPath,
  beachLayoutPath,
  can,
  config,
  getDictionary,
  manageCollectPath,
  managePlannerPath,
  manageReviewsPath,
  manageSpotTypesPath,
  manageStatsPath,
  manageTodayPath,
  type Locale,
  type MembershipRole,
} from '@ombre/shared';
import { today } from '@/lib/api';
import { PageShell, type Crumb } from './PageShell';

// The «application» frame of the management area (spec §4ter, D36): a sticky top bar
// (club name, search, day, desk, profile and sign-out) and a compact icon navigation
// with the pages the actor may reach. Everything is served by the server: the bar is
// two GET forms and a handful of links, the navigation plain anchors. The areas of the
// guest, the season holder and the cabin holder keep the ordinary shell.

/** The voices of the side navigation, in the order of the spec. */
export type ManageNavId = 'today' | 'planner' | 'bookings' | 'collect' | 'stats' | 'reviews' | 'beach' | 'layout' | 'types' | 'site';

/** Inline icons in the stroke style of the project, one per voice; the label names them. */
function NavIcon({ id }: { id: ManageNavId }) {
  const shapes: Record<ManageNavId, ReactNode> = {
    today: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" />
      </>
    ),
    planner: (
      <>
        <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
        <path d="M3.5 10h17M8 3v4M16 3v4" />
      </>
    ),
    bookings: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M8 9h8M8 13h8M8 17h5" />
      </>
    ),
    collect: (
      <>
        <circle cx="12" cy="12" r="7.5" />
        <path d="M14.5 9.5A3.3 3.3 0 0 0 12 8.5c-1.9 0-3.2 1.5-3.2 3.5s1.3 3.5 3.2 3.5c1 0 1.9-.4 2.5-1M7.5 11h4M7.5 13h4" />
      </>
    ),
    stats: (
      <>
        <path d="M5 20v-7M10 20V6M15 20v-9M20 20v-4" />
        <path d="M3.5 20h17" />
      </>
    ),
    reviews: (
      // A five-pointed star in the stroke style of the project: the sign of the ratings.
      <path d="M12 4.5l2.2 4.6 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5L4.8 9.8l5-.7Z" />
    ),
    beach: (
      <>
        <path d="M3.5 11.5C4 7.5 7.5 4.5 12 4.5s8 3 8.5 7h-17Z" />
        <path d="M12 11.5V20M9 20h6" />
      </>
    ),
    layout: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M12 4v16M4 12h16" />
      </>
    ),
    // La scheda illustrata del tipo (D63): una carta con la fotografia e il sole.
    types: (
      <>
        <rect x="4" y="4" width="16" height="16" rx="2" />
        <path d="M4 15.5l4.5-4.5 4 4M11 13.5l3-3 6 6" />
        <circle cx="9.5" cy="8.5" r="1.4" />
      </>
    ),
    site: (
      <>
        <circle cx="12" cy="12" r="8" />
        <path d="M4 12h16M12 4c2.7 2.7 2.7 13.3 0 16M12 4c-2.7 2.7-2.7 13.3 0 16" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {shapes[id]}
    </svg>
  );
}

export function ManageShell({
  locale,
  beachSlug,
  beachName,
  role,
  active,
  day,
  userName,
  alternatePath,
  crumbs,
  children,
}: {
  locale: Locale;
  beachSlug: string;
  beachName: string;
  role: MembershipRole;
  /** Voice of the navigation this page belongs to; null for the pages without a voice. */
  active: ManageNavId | null;
  /** Day the page is on, when it has one: search, desk and day links carry it along. */
  day?: string;
  userName: string;
  alternatePath: string;
  crumbs: Crumb[];
  children: ReactNode;
}) {
  const t = getDictionary(locale, config.brandName);
  const m = t.manage;
  const dayQuery = day ? `?day=${day}` : '';
  const consolePath = manageTodayPath(locale, beachSlug);
  // The voices in the order of the spec, each gated by the permission of its page.
  const entries: { id: ManageNavId; href: string; show: boolean }[] = [
    { id: 'today', href: `${consolePath}${dayQuery}`, show: can(role, 'inventory.read') },
    { id: 'planner', href: `${managePlannerPath(locale, beachSlug)}${day ? `?da=${day}` : ''}`, show: can(role, 'inventory.read') },
    { id: 'bookings', href: `${accountPath(locale, 'manage', beachSlug)}${dayQuery}`, show: true },
    { id: 'collect', href: manageCollectPath(locale, beachSlug), show: can(role, 'bookings.read') },
    { id: 'stats', href: manageStatsPath(locale, beachSlug), show: can(role, 'reports.read') },
    { id: 'reviews', href: manageReviewsPath(locale, beachSlug), show: can(role, 'reviews.moderate') },
    { id: 'beach', href: beachLayoutPath(locale, beachSlug), show: can(role, 'layout.gaps') },
    { id: 'layout', href: `${beachLayoutPath(locale, beachSlug)}#disegno`, show: can(role, 'layout.edit') },
    // Le schede dei tipi (D63): racconto pubblico del lido, col permesso del sito.
    { id: 'types', href: manageSpotTypesPath(locale, beachSlug), show: can(role, 'site.edit') },
    { id: 'site', href: accountPath(locale, 'site', beachSlug), show: can(role, 'site.read') },
  ];
  return (
    <PageShell locale={locale} page="help" highlight={false} alternatePath={alternatePath} crumbs={crumbs}>
      <div className="manage-app">
        <div className="manage-top" role="region" aria-label={m.barLabel}>
          <Link className="manage-top__club" href={accountPath(locale, 'manage', beachSlug)}>
            {beachName}
          </Link>
          {can(role, 'inventory.read') ? (
            <>
              {/* The search of the console, reused as it is: a GET to the console of the day with q. */}
              <form className="manage-top__form" method="get" action={consolePath}>
                {day ? <input type="hidden" name="day" value={day} /> : null}
                <label className="visually-hidden" htmlFor="app-ricerca">
                  {m.searchLabel}
                </label>
                <input id="app-ricerca" name="q" maxLength={80} autoComplete="off" />
                <button className="button button--secondary button--small" type="submit">
                  {m.searchButton}
                </button>
              </form>
              <form className="manage-top__form" method="get" action={consolePath}>
                <label className="visually-hidden" htmlFor="app-giorno">
                  {m.dayLabel}
                </label>
                <input id="app-giorno" type="date" name="day" defaultValue={day ?? today('Europe/Rome')} required />
                <button className="button button--secondary button--small" type="submit">
                  {m.dayGo}
                </button>
              </form>
            </>
          ) : null}
          {can(role, 'bookings.create') ? (
            <Link className="button button--small manage-top__desk" href={`${accountPath(locale, 'manage', beachSlug)}${dayQuery}#banco`}>
              {m.desk}
            </Link>
          ) : null}
          <div className="manage-top__tools">
            <Link className="manage-top__profile" href={accountPath(locale, 'overview')}>
              <span className="visually-hidden">{m.profile}: </span>
              {userName}
            </Link>
            <form method="post" action="/azioni/uscita" className="inline-form">
              <input type="hidden" name="lang" value={locale} />
              <button className="button button--secondary button--small" type="submit">
                {t.account.signOut}
              </button>
            </form>
          </div>
        </div>
        <div className="manage-app__body">
          <nav className="manage-nav" aria-label={m.navLabel}>
            <ul>
              {entries
                .filter((entry) => entry.show)
                .map((entry) => (
                  <li key={entry.id}>
                    <a href={entry.href} aria-current={active === entry.id ? 'page' : undefined}>
                      <NavIcon id={entry.id} />
                      <span>{m.nav[entry.id]}</span>
                    </a>
                  </li>
                ))}
            </ul>
          </nav>
          <div className="manage-app__content">{children}</div>
        </div>
      </div>
    </PageShell>
  );
}
