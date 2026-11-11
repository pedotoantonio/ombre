import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { accountPages, accountPath, accountSection, can, config, formatMoney, getDictionary, isLocale, locales, type AccountPage, type Locale, type MembershipRole } from '@ombre/shared';
import { apiCall, dayPattern, formatDay, slugPattern, uuidPattern } from '@/lib/api';
import { sessionToken } from '@/lib/session';
import { PageHead, PageShell } from './PageShell';
import { SiteEditorView } from './site-editor';

type Query = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);
const other = (locale: Locale): Locale => locales.find((candidate) => candidate !== locale) ?? locale;

interface Me {
  user: { email: string; name: string };
  memberships: { beachSlug: string; beachName: string; role: MembershipRole }[];
}
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
async function requireMe(locale: Locale): Promise<{ me: Me; token: string }> {
  const token = await sessionToken();
  const result = token ? await apiCall<Me>('GET', '/v1/me', { token }) : null;
  if (!token || !result?.ok) redirect(accountPath(locale, 'signIn'));
  return { me: result.data, token };
}

function Notice({ locale, query }: { locale: Locale; query: Query }) {
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

function Hidden({ values }: { values: Record<string, string> }) {
  return (
    <>
      {Object.entries(values).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
    </>
  );
}

function SignOut({ locale }: { locale: Locale }) {
  const t = getDictionary(locale, config.brandName).account;
  return (
    <form method="post" action="/azioni/uscita" className="inline-form">
      <Hidden values={{ lang: locale }} />
      <button className="button button--secondary button--small" type="submit">{t.signOut}</button>
    </form>
  );
}

async function SignInView({ locale, query }: { locale: Locale; query: Query }) {
  const t = getDictionary(locale, config.brandName).account;
  const token = await sessionToken();
  if (token && (await apiCall('GET', '/v1/me', { token })).ok) redirect(accountPath(locale, 'overview'));
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
            <button className="button" type="submit">{t.signInButton}</button>
          </form>
        </div>
      </section>
    </PageShell>
  );
}

async function OverviewView({ locale }: { locale: Locale }) {
  const t = getDictionary(locale, config.brandName).account;
  const { me, token } = await requireMe(locale);
  const contracts = await apiCall<{ contracts: Contract[] }>('GET', '/v1/season/contracts', { token });
  const mine = contracts.ok ? contracts.data.contracts : [];
  return (
    <PageShell locale={locale} page="help" highlight={false} alternatePath={accountPath(other(locale), 'overview')} crumbs={[{ label: t.overviewTitle }]}>
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
                    <Link className="card__link" href={accountPath(locale, 'manage', membership.beachSlug)}>{t.open}</Link>
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
                    <Link className="card__link" href={accountPath(locale, 'season', contract.contractId)}>{t.open}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <SignOut locale={locale} />
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

  const [inventory, bookings, proposals, settings, contracts, report] = await Promise.all([
    can(role, 'inventory.read') ? apiCall<{ spots: InventoryRow[] }>('GET', `${base}/inventory?day=${day}`, { token }) : null,
    can(role, 'bookings.read') ? apiCall<{ bookings: BookingRow[] }>('GET', `${base}/bookings?day=${day}`, { token }) : null,
    can(role, 'sharing.manage') ? apiCall<{ proposals: Proposal[] }>('GET', `${base}/proposals?status=proposed`, { token }) : null,
    can(role, 'sharing.manage') ? apiCall<{ dailySharedCap: number | null; sharedPriceCents: number | null }>('GET', `${base}/sharing-settings`, { token }) : null,
    can(role, 'sharing.manage') ? apiCall<{ contracts: (Omit<Contract, 'beachSlug' | 'beachName'>)[] }>('GET', `${base}/contracts`, { token }) : null,
    can(role, 'reports.read') ? apiCall<Report>('GET', `${base}/reports/summary?from=${month}&to=${monthEnd}`, { token }) : null,
  ]);
  const euro = (cents: number | null) => (cents === null ? '' : (cents / 100).toFixed(2).replace('.', locale === 'it' ? ',' : '.'));

  return (
    <PageShell
      locale={locale}
      page="help" highlight={false}
      alternatePath={`${accountPath(other(locale), 'manage', beachSlug)}?day=${day}`}
      crumbs={[{ label: t.overviewTitle, href: accountPath(locale, 'overview') }, { label: membership.beachName }]}
    >
      <PageHead title={t.manageTitle(membership.beachName)} lead={`${t.roles[role]}. ${formatDay(day, locale)}.`} />
      <section className="section">
        <div className="container stack">
          <Notice locale={locale} query={query} />
          {can(role, 'site.read') ? (
            <Link className="button button--secondary" href={accountPath(locale, 'site', beachSlug)}>
              {getDictionary(locale, config.brandName).site.openEditor}
            </Link>
          ) : null}
          <form className="form-row" method="get" action={accountPath(locale, 'manage', beachSlug)}>
            <div className="field">
              <label htmlFor="giorno">{t.day}</label>
              <input id="giorno" type="date" name="day" defaultValue={day} required />
            </div>
            <button className="button button--secondary" type="submit">{t.show}</button>
          </form>

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
              <h2>{t.bookingsTitle}</h2>
              {bookings.data.bookings.length === 0 ? (
                <p className="prose">{t.noBookings}</p>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr><th>{t.code}</th><th>{t.spot}</th><th>{t.guest}</th><th>{t.booking}</th><th>{t.presence}</th></tr>
                    </thead>
                    <tbody>
                      {bookings.data.bookings.map((row) => (
                        <tr key={row.code}>
                          <td>{row.code}</td><td>{row.spotCode}</td><td>{row.guestName}</td><td>{t.bookingStates[row.status]}</td><td>{t.presences[row.presence]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}

          {inventory?.ok ? (
            <div className="panel">
              <h2>{t.inventoryTitle}</h2>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>{t.spot}</th><th>{t.state}</th><th>{t.price}</th><th>{t.actions}</th></tr>
                  </thead>
                  <tbody>
                    {inventory.data.spots.map((row) => (
                      <tr key={row.spotId}>
                        <td>{row.code}{row.shared ? <> <span className="badge">{t.sharedMark}</span></> : null}</td>
                        <td>{t.states[row.state]}</td>
                        <td>{row.priceCents === null ? '' : formatMoney(row.priceCents, locale)}</td>
                        <td>
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
                              <button className="button button--secondary button--small" type="submit">{t.setPrice}</button>
                            </form>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr><th>{t.day}</th><th>{t.spot}</th><th>{t.actions}</th></tr>
                    </thead>
                    <tbody>
                      {proposals.data.proposals.map((row) => (
                        <tr key={row.proposalId}>
                          <td>{formatDay(row.day, locale)}</td>
                          <td>{row.spotCode}</td>
                          <td>
                            <form method="post" action="/azioni/gestione-proposta" className="inline-form">
                              <Hidden values={{ ...common, proposal: row.proposalId }} />
                              <button className="button button--small" type="submit" name="approve" value="yes">{t.approve}</button>
                              <button className="button button--secondary button--small" type="submit" name="approve" value="no">{t.reject}</button>
                            </form>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr><th>{t.spot}</th><th>{t.from}</th><th>{t.to}</th><th>{t.mode}</th><th>{t.state}</th><th>{t.actions}</th></tr>
                    </thead>
                    <tbody>
                      {contracts.data.contracts.map((row) => (
                        <tr key={row.contractId}>
                          <td>{row.spotCode}</td><td>{row.validFrom}</td><td>{row.validTo}</td><td>{t.modes[row.sharingMode]}</td><td>{t.contractStates[row.status]}</td>
                          <td>
                            {row.status === 'ended' ? null : (
                              <form method="post" action="/azioni/gestione-stato-abbonamento" className="inline-form">
                                <Hidden values={{ ...common, contract: row.contractId, status: row.status === 'active' ? 'suspended' : 'active' }} />
                                <button className="button button--secondary button--small" type="submit">
                                  {row.status === 'active' ? t.suspend : t.resume} <span className="visually-hidden">{row.spotCode}</span>
                                </button>
                              </form>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
              <p className="prose">{t.reportLead(formatDay(month, locale), formatDay(monthEnd, locale))}</p>
              <div className="table-wrap">
                <table className="table">
                  <tbody>
                    <tr><th scope="row">{t.sharedSales}</th><td>{report.data.bookings.shared}</td><td>{formatMoney(report.data.grossCents.shared, locale)}</td></tr>
                    <tr><th scope="row">{t.ordinarySales}</th><td>{report.data.bookings.ordinary}</td><td>{formatMoney(report.data.grossCents.ordinary, locale)}</td></tr>
                  </tbody>
                </table>
              </div>
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th></th><th>{t.expected}</th><th>{t.accrued}</th></tr>
                  </thead>
                  <tbody>
                    {(['season_holder', 'beach_club', 'platform'] as const).map((party) => (
                      <tr key={party}>
                        <th scope="row">{t.parties[party]}</th>
                        <td>{formatMoney(report.data.byParty[party].expected, locale)}</td>
                        <td>{formatMoney(report.data.byParty[party].accrued, locale)}</td>
                      </tr>
                    ))}
                    <tr><th scope="row">{t.refundsDue}</th><td colSpan={2}>{formatMoney(report.data.refundsDueCents, locale)}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
          <SignOut locale={locale} />
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
  const { token } = await requireMe(locale);
  const [contracts, statement] = await Promise.all([
    apiCall<{ contracts: Contract[] }>('GET', '/v1/season/contracts', { token }),
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
    >
      <PageHead title={t.seasonTitle(contract.spotCode, contract.beachName)} lead={t.seasonLead(formatDay(contract.validFrom, locale), formatDay(contract.validTo, locale))} />
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
              <button className="button" type="submit">{t.propose}</button>
            </form>
          </div>
          <div className="panel">
            <h2>{t.statementTitle}</h2>
            {statement.data.days.length === 0 ? (
              <p className="prose">{t.noDays}</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>{t.day}</th><th>{t.proposal}</th><th>{t.sold}</th><th>{t.share}</th><th>{t.actions}</th></tr>
                  </thead>
                  <tbody>
                    {statement.data.days.map((row) => (
                      <tr key={row.day}>
                        <td>{formatDay(row.day, locale)}</td>
                        <td>{t.proposalStates[row.proposal]}</td>
                        <td>{row.sold ? t.yes : t.no}</td>
                        <td>{row.shareCents === null ? '' : `${formatMoney(row.shareCents, locale)} (${row.shareState ? t.shareStates[row.shareState] : ''})`}</td>
                        <td>
                          {!row.sold && (row.proposal === 'proposed' || row.proposal === 'approved') ? (
                            <form method="post" action="/azioni/stagionale-ritira" className="inline-form">
                              <Hidden values={{ ...common, day: row.day }} />
                              <button className="button button--secondary button--small" type="submit">
                                {t.withdraw} <span className="visually-hidden">{formatDay(row.day, locale)}</span>
                              </button>
                            </form>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <SignOut locale={locale} />
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
  if (segments.length === 2 && page === 'manage') return <ManageView locale={locale} beachSlug={segments[1]!} query={query} />;
  if (segments.length === 2 && page === 'season') return <SeasonView locale={locale} contractId={segments[1]!} query={query} />;
  if (segments.length === 2 && page === 'site') return <SiteEditorView locale={locale} beachSlug={segments[1]!} query={query} />;
  notFound();
}
