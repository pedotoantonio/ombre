import { cache } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import QRCode from 'qrcode';
import {
  accountPages,
  accountPath,
  accountSection,
  beachLayoutPath,
  beachLayoutSegment,
  can,
  config,
  formatMoney,
  getDictionary,
  isLocale,
  locales,
  manageCabinsPath,
  manageCabinsSegment,
  type AccountPage,
  type Locale,
} from '@ombre/shared';
import { api, apiCall, dayPattern, formatDate, formatDay, formatPeriod, slugPattern, uuidPattern } from '@/lib/api';
import { BeachLayoutView } from './beach-layout';
import { CabinHolderView, CabinsManageView, CabinsTodayPanel } from './cabins';
import { privateMetadata } from '@/lib/seo';
import { signedIn, type Me } from '@/lib/session';
import { PageHead, PageShell } from './PageShell';
import { SiteEditorView } from './site-editor';
import { Cell, DataTable, Row, RowHead } from './table';

type Query = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);
const other = (locale: Locale): Locale => locales.find((candidate) => candidate !== locale) ?? locale;

interface Contract {
  contractId: string;
  beachSlug: string;
  beachName: string;
  spotCode: string;
  validFrom: string;
  validTo: string;
  status: 'active' | 'suspended' | 'ended';
  sharingMode: 'per_day' | 'automatic';
}

export function isAccountSection(lang: string, slug: string): lang is Locale {
  return isLocale(lang) && slug === accountSection[lang];
}

function pageFromSegment(locale: Locale, segment: string): AccountPage | null {
  const found = (Object.keys(accountPages) as AccountPage[]).find((page) => accountPages[page][locale] === segment);
  return found ?? null;
}

/** Signed-in person, or a redirect to the sign-in page. */
export async function requireMe(locale: Locale): Promise<{ me: Me; token: string }> {
  const session = await signedIn();
  if (!session) redirect(accountPath(locale, 'signIn'));
  return session;
}

/** Season passes of the signed-in person: the title and the page ask for them once. */
const ownContracts = cache((token: string) => apiCall<{ contracts: Contract[] }>('GET', '/v1/season/contracts', { token }));

/** Title of a reserved page. The names of beach clubs and spots are read only for who is signed in. */
export async function accountMetadata(locale: Locale, segments: string[]): Promise<Metadata> {
  const t = getDictionary(locale, config.brandName);
  const page = pageFromSegment(locale, segments[0] ?? '');
  const id = segments[1];
  if (segments.length === 1) {
    const title =
      page === 'signIn'
        ? t.account.signInTitle
        : page === 'overview'
          ? t.account.overviewTitle
          : page === 'twoFactor'
            ? t.account.twoFactorTitle
            : page === 'cabins'
              ? t.cabins.holderTitle
              : null;
    return privateMetadata(locale, title ?? t.nav.reservedArea);
  }
  if (segments.length === 3 && page === 'manage' && (segments[2] === beachLayoutSegment[locale] || segments[2] === manageCabinsSegment[locale])) {
    const beachSession = await signedIn();
    const club = beachSession?.me.memberships.find((entry) => entry.beachSlug === id)?.beachName;
    return privateMetadata(locale, segments[2] === beachLayoutSegment[locale] ? t.layout.short : t.cabins.short, { club });
  }
  const session = segments.length === 2 ? await signedIn() : null;
  if (session && (page === 'manage' || page === 'site')) {
    const club = session.me.memberships.find((entry) => entry.beachSlug === id)?.beachName;
    return privateMetadata(locale, page === 'manage' ? t.account.manageShort : t.site.openEditor, { club });
  }
  if (session && page === 'season') {
    const contracts = await ownContracts(session.token);
    const contract = contracts.ok ? contracts.data.contracts.find((entry) => entry.contractId === id) : undefined;
    if (contract) return privateMetadata(locale, t.booking.spot(contract.spotCode), { club: contract.beachName });
  }
  return privateMetadata(locale, t.nav.reservedArea);
}

export function Notice({ locale, query }: { locale: Locale; query: Query }) {
  const t = getDictionary(locale, config.brandName).account;
  const error = first(query.err);
  const done = first(query.ok);
  if (error) {
    const known = t.errors as Record<string, string>;
    return <p className="alert" role="alert">{known[error] ?? known.invalid_request}</p>;
  }
  if (done) return <p className="alert alert--info" role="status">{done === '1' ? t.saved : done}</p>;
  return null;
}

/** Outcome of an action shown inside its own section, so that the anchor lands next to it. */
export function SectionNotice({ locale, query, okKey, errKey }: { locale: Locale; query: Query; okKey: string; errKey: string }) {
  const t = getDictionary(locale, config.brandName).account;
  const error = first(query[errKey]);
  const done = first(query[okKey]);
  if (error) {
    const known = t.errors as Record<string, string>;
    return <p className="alert" role="alert">{known[error] ?? known.invalid_request}</p>;
  }
  if (done) return <p className="alert alert--info" role="status">{done === '1' ? t.saved : done}</p>;
  return null;
}

export function Hidden({ values }: { values: Record<string, string> }) {
  return (
    <>
      {Object.entries(values).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
    </>
  );
}

async function SignInView({ locale, query }: { locale: Locale; query: Query }) {
  const t = getDictionary(locale, config.brandName).account;
  if (await signedIn()) redirect(accountPath(locale, 'overview'));
  return (
    <PageShell locale={locale} page="help" highlight={false} alternatePath={accountPath(other(locale), 'signIn')} crumbs={[{ label: t.signInTitle }]}>
      <PageHead title={t.signInTitle} lead={t.signInLead} />
      <section className="section">
        <div className="container stack">
          <Notice locale={locale} query={query} />
          <form method="post" action="/azioni/accesso" className="stack">
            <Hidden values={{ lang: locale }} />
            <div className="field">
              <label htmlFor="email">{t.email}</label>
              <input id="email" name="email" type="email" autoComplete="username" required />
            </div>
            <div className="field">
              <label htmlFor="password">{t.password}</label>
              <input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
            <div className="field">
              <label htmlFor="codice">{t.signInCode}</label>
              <input id="codice" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} />
            </div>
            <button className="button button--block" type="submit">{t.signInButton}</button>
          </form>
        </div>
      </section>
    </PageShell>
  );
}

async function OverviewView({ locale }: { locale: Locale }) {
  const t = getDictionary(locale, config.brandName).account;
  const { me, token } = await requireMe(locale);
  const [contracts, cabins] = await Promise.all([ownContracts(token), apiCall<{ assignments: unknown[] }>('GET', '/v1/my/cabins', { token })]);
  const mine = contracts.ok ? contracts.data.contracts : [];
  const myCabins = cabins.ok ? cabins.data.assignments.length : 0;
  return (
    <PageShell locale={locale} page="help" highlight={false} alternatePath={accountPath(other(locale), 'overview')} crumbs={[{ label: t.overviewTitle }]} signedInAs={me.user.name}>
      <PageHead title={t.overviewTitle} lead={t.hello(me.user.name)} />
      <section className="section">
        <div className="container stack">
          {me.memberships.length === 0 && mine.length === 0 ? <p className="prose">{t.nothingHere}</p> : null}
          {me.memberships.length > 0 ? (
            <div className="panel">
              <h2>{t.beachesTitle}</h2>
              <ul className="cards">
                {me.memberships.map((membership) => (
                  <li className="card" key={membership.beachSlug}>
                    <h3>{membership.beachName}</h3>
                    <p>{t.roles[membership.role]}</p>
                    {/* A cabin holder has no management page: their own cabins page is the way in. */}
                    <Link className="card__link" href={membership.role === 'cabin_holder' ? accountPath(locale, 'cabins') : accountPath(locale, 'manage', membership.beachSlug)}>
                      {t.open}
                      <span className="visually-hidden">{` ${membership.beachName}`}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {mine.length > 0 ? (
            <div className="panel">
              <h2>{t.contractsTitle}</h2>
              <ul className="cards">
                {mine.map((contract) => (
                  <li className="card" key={contract.contractId}>
                    <h3>{t.seasonTitle(contract.spotCode, contract.beachName)}</h3>
                    <p>{t.contractStates[contract.status]}</p>
                    <Link className="card__link" href={accountPath(locale, 'season', contract.contractId)}>
                      {t.open}
                      <span className="visually-hidden">{` ${t.seasonTitle(contract.spotCode, contract.beachName)}`}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {myCabins > 0 ? (
            <div className="panel">
              <h2>{t.myCabinsTitle}</h2>
              <p className="prose">{t.myCabinsText}</p>
              <p>
                <Link className="button button--secondary" href={accountPath(locale, 'cabins')}>
                  {t.open}
                  <span className="visually-hidden">{` ${t.myCabinsTitle}`}</span>
                </Link>
              </p>
            </div>
          ) : null}
          <div className="panel">
            <h2>{t.twoFactorTitle}</h2>
            <p className="prose">{me.user.twoFactor ? t.twoFactorOn : t.twoFactorOff}</p>
            {me.user.twoFactor ? null : (
              <p>
                <a className="button button--secondary" href={accountPath(locale, 'twoFactor')}>{t.twoFactorStart}</a>
              </p>
            )}
          </div>
        </div>
      </section>
    </PageShell>
  );
}

/** Setup of two-step verification: a fresh key at every visit, active only after a first code. */
async function TwoFactorView({ locale, query }: { locale: Locale; query: Query }) {
  const t = getDictionary(locale, config.brandName).account;
  const { me, token } = await requireMe(locale);
  if (me.user.twoFactor) redirect(accountPath(locale, 'overview'));
  const started = await apiCall<{ secret: string; otpauthUri: string }>('POST', '/v1/auth/two-factor/begin', { token });
  if (!started.ok) redirect(accountPath(locale, 'overview'));
  const qr = await QRCode.toString(started.data.otpauthUri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
  return (
    <PageShell
      locale={locale}
      page="help"
      highlight={false}
      alternatePath={accountPath(other(locale), 'twoFactor')}
      crumbs={[{ label: t.overviewTitle, href: accountPath(locale, 'overview') }, { label: t.twoFactorTitle }]}
      signedInAs={me.user.name}
    >
      <PageHead title={t.twoFactorTitle} lead={t.twoFactorOff} />
      <section className="section">
        <div className="container stack">
          <Notice locale={locale} query={query} />
          <ol className="list">
            {t.twoFactorSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <div className="pass">
            <div role="img" aria-label={t.twoFactorQr} dangerouslySetInnerHTML={{ __html: qr }} />
          </div>
          <p className="prose">
            {t.twoFactorKey}: <code>{started.data.secret.replace(/(.{4})/g, '$1 ').trim()}</code>
          </p>
          <form method="post" action="/azioni/verifica-conferma" className="form-row">
            <Hidden values={{ lang: locale }} />
            <div className="field">
              <label htmlFor="codice">{t.twoFactorCode}</label>
              <input id="codice" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required />
            </div>
            <button className="button" type="submit">{t.twoFactorConfirm}</button>
          </form>
        </div>
      </section>
    </PageShell>
  );
}

interface InventoryRow {
  spotId: string;
  code: string;
  state: 'unpublished' | 'unpublishable' | 'available' | 'held' | 'occupied' | 'blocked';
  priceCents: number | null;
  shared: boolean;
}
interface BookingRow {
  code: string;
  status: 'draft' | 'under_review' | 'confirmed' | 'cancelled' | 'completed';
  presence: 'expected' | 'inside' | 'outside_reentry_allowed' | 'ended';
  guestName: string;
  spotCode: string;
  totalCents: number;
}
interface Proposal {
  proposalId: string;
  day: string;
  spotCode: string;
}
interface Report {
  bookings: { shared: number; ordinary: number };
  grossCents: { shared: number; ordinary: number };
  byParty: Record<'season_holder' | 'beach_club' | 'platform', { expected: number; accrued: number }>;
  refundsDueCents: number;
}

async function ManageView({ locale, beachSlug, query }: { locale: Locale; beachSlug: string; query: Query }) {
  if (!slugPattern.test(beachSlug)) notFound();
  const t = getDictionary(locale, config.brandName).account;
  const { me, token } = await requireMe(locale);
  const membership = me.memberships.find((entry) => entry.beachSlug === beachSlug);
  if (!membership) notFound();
  const role = membership.role;
  const asked = first(query.day);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome' }).format(new Date());
  const day = asked && dayPattern.test(asked) ? asked : today;
  const base = `/v1/manage/beaches/${beachSlug}`;
  const common = { lang: locale, beach: beachSlug, day };
  const month = `${day.slice(0, 8)}01`;
  const monthEnd = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 0)).toISOString().slice(0, 10);

  const [inventory, bookings, proposals, settings, contracts, report, beachCard] = await Promise.all([
    can(role, 'inventory.read') ? apiCall<{ spots: InventoryRow[] }>('GET', `${base}/inventory?day=${day}`, { token }) : null,
    can(role, 'bookings.read') ? apiCall<{ bookings: BookingRow[] }>('GET', `${base}/bookings?day=${day}`, { token }) : null,
    can(role, 'sharing.manage') ? apiCall<{ proposals: Proposal[] }>('GET', `${base}/proposals?status=proposed`, { token }) : null,
    can(role, 'sharing.manage') ? apiCall<{ dailySharedCap: number | null; sharedPriceCents: number | null }>('GET', `${base}/sharing-settings`, { token }) : null,
    can(role, 'sharing.manage') ? apiCall<{ contracts: (Omit<Contract, 'beachSlug' | 'beachName'>)[] }>('GET', `${base}/contracts`, { token }) : null,
    can(role, 'reports.read') ? apiCall<Report>('GET', `${base}/reports/summary?from=${month}&to=${monthEnd}`, { token }) : null,
    // The coordinates of the club come from its public card: the position is public by nature.
    can(role, 'layout.edit') ? api.beach(beachSlug) : null,
  ]);
  const position = beachCard?.ok ? { latitude: beachCard.data.beach.latitude, longitude: beachCard.data.beach.longitude } : null;
  // After a refused save the typed values come back in the address, next to their errors.
  const latAsked = first(query.lat);
  const lngAsked = first(query.lng);
  const latError = first(query.latErr) === '1';
  const lngError = first(query.lngErr) === '1';
  const freeSpots = inventory?.ok ? inventory.data.spots.filter((row) => row.state === 'available') : [];
  const euro = (cents: number | null) => (cents === null ? '' : (cents / 100).toFixed(2).replace('.', locale === 'it' ? ',' : '.'));

  return (
    <PageShell
      locale={locale}
      page="help" highlight={false}
      alternatePath={`${accountPath(other(locale), 'manage', beachSlug)}?day=${day}`}
      crumbs={[{ label: t.overviewTitle, href: accountPath(locale, 'overview') }, { label: membership.beachName }]}
      signedInAs={me.user.name}
    >
      <PageHead title={t.manageTitle(membership.beachName)} lead={`${t.roles[role]}. ${formatDay(day, locale)}.`} />
      <section className="section">
        <div className="container stack">
          <Notice locale={locale} query={query} />
          <p className="manage-links">
            {can(role, 'site.read') ? (
              <Link className="button button--secondary" href={accountPath(locale, 'site', beachSlug)}>
                {getDictionary(locale, config.brandName).site.openEditor}
              </Link>
            ) : null}
            {can(role, 'layout.gaps') ? (
              <Link className="button button--secondary" href={beachLayoutPath(locale, beachSlug)}>
                {t.openLayout}
              </Link>
            ) : null}
            {can(role, 'cabins.manage') ? (
              <Link className="button button--secondary" href={manageCabinsPath(locale, beachSlug)}>
                {t.openCabins}
              </Link>
            ) : null}
          </p>
          {can(role, 'layout.edit') && position ? (
            <div className="panel" id="posizione">
              <h2>{t.positionTitle}</h2>
              <p className="prose">{t.positionLead}</p>
              {position.latitude === null || position.longitude === null ? (
                <p className="alert" role="status">{t.positionMissing}</p>
              ) : null}
              <form method="post" action="/azioni/gestione-posizione" className="form-row">
                <Hidden values={{ lang: locale, beach: beachSlug, day }} />
                <div className="field">
                  <label htmlFor="latitudine">{t.latitude}</label>
                  <input
                    id="latitudine"
                    name="lat"
                    inputMode="decimal"
                    autoComplete="off"
                    defaultValue={latAsked ?? (position.latitude === null ? '' : String(position.latitude))}
                    aria-invalid={latError || undefined}
                    aria-describedby={latError ? 'latitudine-errore' : undefined}
                  />
                  {latError ? (
                    <p className="field__error" id="latitudine-errore">{t.latitudeError}</p>
                  ) : null}
                </div>
                <div className="field">
                  <label htmlFor="longitudine">{t.longitude}</label>
                  <input
                    id="longitudine"
                    name="lng"
                    inputMode="decimal"
                    autoComplete="off"
                    defaultValue={lngAsked ?? (position.longitude === null ? '' : String(position.longitude))}
                    aria-invalid={lngError || undefined}
                    aria-describedby={lngError ? 'longitudine-errore' : undefined}
                  />
                  {lngError ? (
                    <p className="field__error" id="longitudine-errore">{t.longitudeError}</p>
                  ) : null}
                </div>
                <button className="button button--secondary" type="submit">{t.savePosition}</button>
              </form>
            </div>
          ) : null}
          <form className="form-row" method="get" action={accountPath(locale, 'manage', beachSlug)}>
            <div className="field">
              <label htmlFor="giorno">{t.day}</label>
              <input id="giorno" type="date" name="day" defaultValue={day} required />
            </div>
            <button className="button button--secondary" type="submit">{t.show}</button>
          </form>

          {/* Who uses each cabin today: the front desk reads it here, nothing to decide. */}
          {can(role, 'bookings.read') ? <CabinsTodayPanel locale={locale} beachSlug={beachSlug} token={token} /> : null}

          {bookings?.ok ? (
            <div className="panel">
              <h2>{t.checkTitle}</h2>
              <form method="post" action="/azioni/reception-accesso" className="form-row">
                <Hidden values={common} />
                <div className="field">
                  <label htmlFor="credenziale">{t.credential}</label>
                  <input id="credenziale" name="credential" required autoComplete="off" />
                </div>
                <button className="button" type="submit" name="kind" value="entry">{t.entry}</button>
                <button className="button button--secondary" type="submit" name="kind" value="exit">{t.exit}</button>
              </form>
              {can(role, 'bookings.create') && inventory?.ok ? (
                <>
                  <h2>{t.deskTitle}</h2>
                  <p className="prose">{t.deskLead}</p>
                  {freeSpots.length === 0 ? (
                    <p className="prose">{t.noFreeSpots}</p>
                  ) : (
                    <form method="post" action="/azioni/banco-prenota" className="form-row">
                      <Hidden values={common} />
                      <div className="field">
                        <label htmlFor="banco-postazione">{t.spot}</label>
                        <select id="banco-postazione" name="spot" required>
                          {freeSpots.map((row) => (
                            <option key={row.spotId} value={row.spotId}>{`${row.code} · ${row.priceCents === null ? '' : formatMoney(row.priceCents, locale)}`}</option>
                          ))}
                        </select>
                      </div>
                      <div className="field">
                        <label htmlFor="banco-ospite">{t.deskGuest}</label>
                        <input id="banco-ospite" name="name" maxLength={120} required />
                      </div>
                      <button className="button button--secondary" type="submit">{t.deskBook}</button>
                    </form>
                  )}
                </>
              ) : null}
              <h2>{t.bookingsTitle}</h2>
              {bookings.data.bookings.length === 0 ? (
                <p className="prose">{t.noBookings}</p>
              ) : (
                <DataTable label={t.bookingsTitle} columns={[t.code, t.spot, t.guest, t.booking, t.presence, t.actions].map((label) => ({ label }))}>
                  {bookings.data.bookings.map((row) => (
                    <Row key={row.code}>
                      <Cell label={t.code}>{row.code}</Cell>
                      <Cell label={t.spot}>{row.spotCode}</Cell>
                      <Cell label={t.guest}>{row.guestName}</Cell>
                      <Cell label={t.booking}>{t.bookingStates[row.status]}</Cell>
                      <Cell label={t.presence}>{t.presences[row.presence]}</Cell>
                      <Cell label={t.actions}>
                        {row.status === 'confirmed' && can(role, 'bookings.move') && freeSpots.length > 0 ? (
                          <form method="post" action="/azioni/banco-sposta" className="inline-form">
                            <Hidden values={{ ...common, code: row.code }} />
                            <select name="spot" aria-label={`${t.moveTo}, ${row.code}`} required>
                              {freeSpots.map((free) => (
                                <option key={free.spotId} value={free.spotId}>{free.code}</option>
                              ))}
                            </select>
                            <button className="button button--secondary button--small" type="submit">
                              {t.move} <span className="visually-hidden">{row.code}</span>
                            </button>
                          </form>
                        ) : null}
                        {row.status === 'confirmed' && can(role, 'bookings.cancel') ? (
                          <form method="post" action="/azioni/gestione-annulla" className="inline-form">
                            <Hidden values={{ ...common, code: row.code }} />
                            <button className="button button--secondary button--small" type="submit">
                              {t.cancelBooking} <span className="visually-hidden">{row.code}</span>
                            </button>
                          </form>
                        ) : null}
                      </Cell>
                    </Row>
                  ))}
                </DataTable>
              )}
            </div>
          ) : null}

          {inventory?.ok ? (
            <div className="panel">
              <h2>{t.inventoryTitle}</h2>
              <DataTable label={t.inventoryTitle} columns={[{ label: t.spot }, { label: t.state }, { label: t.price, numeric: true }, { label: t.actions }]}>
                {inventory.data.spots.map((row) => (
                  <Row key={row.spotId}>
                    <Cell label={t.spot}>{row.code}{row.shared ? <> <span className="badge">{t.sharedMark}</span></> : null}</Cell>
                    <Cell label={t.state}>{t.states[row.state]}</Cell>
                    <Cell label={t.price} numeric>{row.priceCents === null ? null : formatMoney(row.priceCents, locale)}</Cell>
                    <Cell label={t.actions}>
                      {can(role, 'inventory.block') && (row.state === 'available' || row.state === 'blocked' || row.state === 'unpublishable') ? (
                        <form method="post" action="/azioni/gestione-blocco" className="inline-form">
                          <Hidden values={{ ...common, spot: row.spotId, blocked: row.state === 'blocked' ? 'no' : 'yes' }} />
                          <button className="button button--secondary button--small" type="submit">
                            {row.state === 'blocked' ? t.unblock : t.block} <span className="visually-hidden">{row.code}</span>
                          </button>
                        </form>
                      ) : null}
                      {can(role, 'inventory.price') && row.state !== 'unpublished' ? (
                        <form method="post" action="/azioni/gestione-prezzo" className="inline-form">
                          <Hidden values={{ ...common, spot: row.spotId }} />
                          <input type="text" name="price" inputMode="decimal" aria-label={`${t.newPrice}, ${row.code}`} defaultValue={euro(row.priceCents)} required />
                          <button className="button button--secondary button--small" type="submit">
                            {t.setPrice} <span className="visually-hidden">{row.code}</span>
                          </button>
                        </form>
                      ) : null}
                    </Cell>
                  </Row>
                ))}
              </DataTable>
              {can(role, 'inventory.publish') ? (
                <>
                  <h3>{t.publishTitle}</h3>
                  <p className="prose">{t.publishLead}</p>
                  <form method="post" action="/azioni/gestione-pubblica" className="form-row">
                    <Hidden values={common} />
                    <div className="field">
                      <label htmlFor="prezzo-giorno">{t.priceEuro}</label>
                      <input id="prezzo-giorno" name="price" inputMode="decimal" required />
                    </div>
                    <button className="button" type="submit">{t.publish}</button>
                  </form>
                </>
              ) : null}
            </div>
          ) : null}

          {proposals?.ok ? (
            <div className="panel">
              <h2>{t.proposalsTitle}</h2>
              {proposals.data.proposals.length === 0 ? (
                <p className="prose">{t.noProposals}</p>
              ) : (
                <DataTable label={t.proposalsTitle} columns={[t.day, t.spot, t.actions].map((label) => ({ label }))}>
                  {proposals.data.proposals.map((row) => (
                    <Row key={row.proposalId}>
                      <Cell label={t.day}>{formatDay(row.day, locale)}</Cell>
                      <Cell label={t.spot}>{row.spotCode}</Cell>
                      <Cell label={t.actions}>
                        <form method="post" action="/azioni/gestione-proposta" className="inline-form">
                          <Hidden values={{ ...common, proposal: row.proposalId }} />
                          <button className="button button--small" type="submit" name="approve" value="yes">
                            {t.approve} <span className="visually-hidden">{row.spotCode}, {formatDay(row.day, locale)}</span>
                          </button>
                          <button className="button button--secondary button--small" type="submit" name="approve" value="no">
                            {t.reject} <span className="visually-hidden">{row.spotCode}, {formatDay(row.day, locale)}</span>
                          </button>
                        </form>
                      </Cell>
                    </Row>
                  ))}
                </DataTable>
              )}
              {settings?.ok ? (
                <>
                  <h3>{t.settingsTitle}</h3>
                  <form method="post" action="/azioni/gestione-impostazioni" className="form-row">
                    <Hidden values={common} />
                    <div className="field">
                      <label htmlFor="limite">{t.cap}</label>
                      <input id="limite" name="cap" inputMode="numeric" defaultValue={settings.data.dailySharedCap ?? ''} />
                    </div>
                    <div className="field">
                      <label htmlFor="prezzo-condiviso">{t.sharedPrice}</label>
                      <input id="prezzo-condiviso" name="price" inputMode="decimal" defaultValue={euro(settings.data.sharedPriceCents)} />
                    </div>
                    <button className="button button--secondary" type="submit">{t.save}</button>
                  </form>
                </>
              ) : null}
            </div>
          ) : null}

          {contracts?.ok && inventory?.ok ? (
            <div className="panel">
              <h2>{t.contractsManageTitle}</h2>
              {contracts.data.contracts.length > 0 ? (
                <DataTable label={t.contractsManageTitle} columns={[t.spot, t.from, t.to, t.mode, t.state, t.actions].map((label) => ({ label }))}>
                  {contracts.data.contracts.map((row) => (
                    <Row key={row.contractId}>
                      <Cell label={t.spot}>{row.spotCode}</Cell>
                      <Cell label={t.from}>{formatDate(row.validFrom, locale)}</Cell>
                      <Cell label={t.to}>{formatDate(row.validTo, locale)}</Cell>
                      <Cell label={t.mode}>{t.modes[row.sharingMode]}</Cell>
                      <Cell label={t.state}>{t.contractStates[row.status]}</Cell>
                      <Cell label={t.actions}>
                        {row.status === 'ended' ? null : (
                          <form method="post" action="/azioni/gestione-stato-abbonamento" className="inline-form">
                            <Hidden values={{ ...common, contract: row.contractId, status: row.status === 'active' ? 'suspended' : 'active' }} />
                            <button className="button button--secondary button--small" type="submit">
                              {row.status === 'active' ? t.suspend : t.resume} <span className="visually-hidden">{row.spotCode}</span>
                            </button>
                          </form>
                        )}
                      </Cell>
                    </Row>
                  ))}
                </DataTable>
              ) : null}
              <form method="post" action="/azioni/gestione-abbonamento" className="form-row">
                <Hidden values={common} />
                <div className="field">
                  <label htmlFor="stagionale-email">{t.holderEmail}</label>
                  <input id="stagionale-email" name="email" type="email" required />
                </div>
                <div className="field">
                  <label htmlFor="stagionale-postazione">{t.spot}</label>
                  <select id="stagionale-postazione" name="spot" required>
                    {inventory.data.spots.map((row) => (
                      <option key={row.spotId} value={row.spotId}>{row.code}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="stagionale-dal">{t.from}</label>
                  <input id="stagionale-dal" name="from" type="date" required />
                </div>
                <div className="field">
                  <label htmlFor="stagionale-al">{t.to}</label>
                  <input id="stagionale-al" name="to" type="date" required />
                </div>
                <div className="field">
                  <label htmlFor="stagionale-modo">{t.mode}</label>
                  <select id="stagionale-modo" name="mode">
                    <option value="per_day">{t.modes.per_day}</option>
                    <option value="automatic">{t.modes.automatic}</option>
                  </select>
                </div>
                <button className="button button--secondary" type="submit">{t.addContract}</button>
              </form>
            </div>
          ) : null}

          {report?.ok ? (
            <div className="panel">
              <h2>{t.reportTitle}</h2>
              <p className="prose">{t.reportLead(formatPeriod(month, monthEnd, locale))}</p>
              <DataTable label={t.reportSalesTable} columns={[{ label: t.item }, { label: t.bookingsCount, numeric: true }, { label: t.amount, numeric: true }]}>
                {(['shared', 'ordinary'] as const).map((kind) => (
                  <Row key={kind}>
                    <RowHead>{kind === 'shared' ? t.sharedSales : t.ordinarySales}</RowHead>
                    <Cell label={t.bookingsCount} numeric>{report.data.bookings[kind]}</Cell>
                    <Cell label={t.amount} numeric>{formatMoney(report.data.grossCents[kind], locale)}</Cell>
                  </Row>
                ))}
              </DataTable>
              <DataTable label={t.reportSharesTable} columns={[{ label: t.item }, { label: t.expected, numeric: true }, { label: t.accrued, numeric: true }]}>
                {(['season_holder', 'beach_club', 'platform'] as const).map((party) => (
                  <Row key={party}>
                    <RowHead>{t.parties[party]}</RowHead>
                    <Cell label={t.expected} numeric>{formatMoney(report.data.byParty[party].expected, locale)}</Cell>
                    <Cell label={t.accrued} numeric>{formatMoney(report.data.byParty[party].accrued, locale)}</Cell>
                  </Row>
                ))}
              </DataTable>
              <p className="prose">
                {t.refundsDue}: <strong>{formatMoney(report.data.refundsDueCents, locale)}</strong>
              </p>
            </div>
          ) : null}
        </div>
      </section>
    </PageShell>
  );
}

interface StatementRow {
  day: string;
  proposal: 'proposed' | 'approved' | 'rejected' | 'withdrawn';
  sold: boolean;
  shareCents: number | null;
  shareState: 'expected' | 'accrued' | 'suspended' | 'settling' | 'settled' | 'adjusted' | null;
}

async function SeasonView({ locale, contractId, query }: { locale: Locale; contractId: string; query: Query }) {
  if (!uuidPattern.test(contractId)) notFound();
  const t = getDictionary(locale, config.brandName).account;
  const { me, token } = await requireMe(locale);
  const [contracts, statement] = await Promise.all([
    ownContracts(token),
    apiCall<{ days: StatementRow[] }>('GET', `/v1/season/contracts/${contractId}/statement`, { token }),
  ]);
  const contract = contracts.ok ? contracts.data.contracts.find((entry) => entry.contractId === contractId) : undefined;
  if (!contract || !statement.ok) notFound();
  const common = { lang: locale, contract: contractId };

  return (
    <PageShell
      locale={locale}
      page="help" highlight={false}
      alternatePath={accountPath(other(locale), 'season', contractId)}
      crumbs={[{ label: t.overviewTitle, href: accountPath(locale, 'overview') }, { label: contract.spotCode }]}
      signedInAs={me.user.name}
    >
      <PageHead title={t.seasonTitle(contract.spotCode, contract.beachName)} lead={t.seasonLead(formatPeriod(contract.validFrom, contract.validTo, locale))} />
      <section className="section">
        <div className="container stack">
          <Notice locale={locale} query={query} />
          <div className="panel">
            <h2>{t.proposeTitle}</h2>
            <form method="post" action="/azioni/stagionale-proponi" className="stack">
              <Hidden values={common} />
              <div className="form-row">
                <div className="field">
                  <label htmlFor="dal">{t.from}</label>
                  <input id="dal" name="from" type="date" min={contract.validFrom} max={contract.validTo} required />
                </div>
                <div className="field">
                  <label htmlFor="al">{t.to}</label>
                  <input id="al" name="to" type="date" min={contract.validFrom} max={contract.validTo} required />
                </div>
              </div>
              <fieldset className="checks">
                <legend>{t.weekdays}</legend>
                {t.weekdayNames.map((name, index) => (
                  <label key={name}>
                    <input type="checkbox" name="weekday" value={index + 1} /> {name}
                  </label>
                ))}
              </fieldset>
              <button className="button button--block" type="submit">{t.propose}</button>
            </form>
          </div>
          <div className="panel">
            <h2>{t.statementTitle}</h2>
            {statement.data.days.length === 0 ? (
              <p className="prose">{t.noDays}</p>
            ) : (
              <DataTable label={t.statementTitle} columns={[{ label: t.day }, { label: t.proposal }, { label: t.sold }, { label: t.share, numeric: true }, { label: t.actions }]}>
                {statement.data.days.map((row) => (
                  <Row key={row.day}>
                    <Cell label={t.day}>{formatDay(row.day, locale)}</Cell>
                    <Cell label={t.proposal}>{t.proposalStates[row.proposal]}</Cell>
                    <Cell label={t.sold}>{row.sold ? t.yes : t.no}</Cell>
                    <Cell label={t.share} numeric>{row.shareCents === null ? null : `${formatMoney(row.shareCents, locale)} (${row.shareState ? t.shareStates[row.shareState] : ''})`}</Cell>
                    <Cell label={t.actions}>
                      {!row.sold && (row.proposal === 'proposed' || row.proposal === 'approved') ? (
                        <form method="post" action="/azioni/stagionale-ritira" className="inline-form">
                          <Hidden values={{ ...common, day: row.day }} />
                          <button className="button button--secondary button--small" type="submit">
                            {t.withdraw} <span className="visually-hidden">{formatDay(row.day, locale)}</span>
                          </button>
                        </form>
                      ) : null}
                    </Cell>
                  </Row>
                ))}
              </DataTable>
            )}
          </div>
        </div>
      </section>
    </PageShell>
  );
}

/** Pages of the reserved area: sign-in, overview, and one level deeper management and season pass. */
export async function AccountRoute({ locale, segments, query }: { locale: Locale; segments: string[]; query: Query }) {
  const page = pageFromSegment(locale, segments[0] ?? '');
  if (segments.length === 1 && page === 'signIn') return <SignInView locale={locale} query={query} />;
  if (segments.length === 1 && page === 'overview') return <OverviewView locale={locale} />;
  if (segments.length === 1 && page === 'twoFactor') return <TwoFactorView locale={locale} query={query} />;
  if (segments.length === 1 && page === 'cabins') return <CabinHolderView locale={locale} query={query} />;
  if (segments.length === 2 && page === 'manage') return <ManageView locale={locale} beachSlug={segments[1]!} query={query} />;
  if (segments.length === 3 && page === 'manage' && segments[2] === beachLayoutSegment[locale])
    return <BeachLayoutView locale={locale} beachSlug={segments[1]!} query={query} />;
  if (segments.length === 3 && page === 'manage' && segments[2] === manageCabinsSegment[locale])
    return <CabinsManageView locale={locale} beachSlug={segments[1]!} query={query} />;
  if (segments.length === 2 && page === 'season') return <SeasonView locale={locale} contractId={segments[1]!} query={query} />;
  if (segments.length === 2 && page === 'site') return <SiteEditorView locale={locale} beachSlug={segments[1]!} query={query} />;
  notFound();
}
