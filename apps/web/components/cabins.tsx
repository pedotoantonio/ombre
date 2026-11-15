import Link from 'next/link';
import { notFound } from 'next/navigation';
import { accountPath, can, config, getDictionary, locales, manageCabinsPath, type Locale, type SpotZone } from '@ombre/shared';
import { apiCall, formatDate, formatPeriod, slugPattern, uuidPattern, type ApiLayoutElement } from '@/lib/api';
import { Hidden, Notice, requireMe } from './account';
import { PageHead, PageShell } from './PageShell';
import { Cell, DataTable, Row, RowHead } from './table';

// Sea cabins. The manager's page holds the register, the assignments and the sublet
// decisions; the holder's page shows only their own cabins and proposals; the front desk
// reads who uses each cabin today inside its existing view. No money in the system.

type Query = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

interface ApiCabinPosition {
  zone: SpotZone;
  rowNumber: number;
  colStart: number;
  colEnd: number;
}

interface ApiAssignment {
  assignmentId: string;
  holderName: string | null;
  holderContact: string | null;
  hasAccount: boolean;
  validFrom: string;
  validTo: string;
  status: 'active' | 'ended';
}

interface ApiSublet {
  subletId: string;
  fromDay: string;
  toDay: string;
  occupantName: string;
  occupantContact: string | null;
  status: 'proposed' | 'approved' | 'rejected' | 'ended';
  decidedAt: string | null;
}

interface ApiCabin {
  cabinId: string;
  code: string;
  notes: string | null;
  position: ApiCabinPosition | null;
  currentAssignment: ApiAssignment | null;
  todayOccupant: { name: string | null; source: 'sublet' | 'holder' } | null;
}

interface ApiPendingSublet extends ApiSublet {
  assignmentId: string;
  cabinCode: string;
  holderName: string | null;
}

interface ApiCabinHistory {
  cabinId: string;
  code: string;
  notes: string | null;
  assignments: (ApiAssignment & { sublets: ApiSublet[] })[];
}

interface ApiMyAssignment {
  assignmentId: string;
  beachSlug: string;
  beachName: string;
  cabinCode: string;
  position: ApiCabinPosition | null;
  validFrom: string;
  validTo: string;
  status: 'active' | 'ended';
  sublets: ApiSublet[];
}

/** Where a cabin is drawn, in words; «non disegnata» when it has no block. */
function positionText(locale: Locale, position: ApiCabinPosition | null): string {
  const t = getDictionary(locale, config.brandName);
  if (!position) return t.cabins.notDrawn;
  return `${t.booking.zones[position.zone]}, ${t.booking.row(position.rowNumber).toLowerCase()}, ${t.layout.columnsRange(position.colStart, position.colEnd)}`;
}

/** The holder of an assignment, as the manager's lists name them. */
function holderText(locale: Locale, assignment: ApiAssignment): string {
  const c = getDictionary(locale, config.brandName).cabins;
  const name = assignment.holderName ?? c.accountOnly;
  return assignment.hasAccount && assignment.holderName ? `${name} (${c.withAccountMark})` : name;
}

/** Who uses the cabin today: the approved sublet wins over the holder. */
function occupantText(locale: Locale, cabin: ApiCabin): string {
  const c = getDictionary(locale, config.brandName).cabins;
  if (!cabin.todayOccupant) return c.nobody;
  const name = cabin.todayOccupant.name ?? c.accountOnly;
  return `${name} (${cabin.todayOccupant.source === 'sublet' ? c.bySublet : c.byHolder})`;
}

function CabinEditor({ locale, cabin, blocks, common, beachSlug }: { locale: Locale; cabin: ApiCabin; blocks: ApiLayoutElement[]; common: Record<string, string>; beachSlug: string }) {
  const t = getDictionary(locale, config.brandName);
  const c = t.cabins;
  const htmlId = `cabina-${cabin.cabinId}`;
  return (
    <li className="layout-spot" id={htmlId} aria-labelledby={`${htmlId}-titolo`}>
      <p className="layout-spot__head" id={`${htmlId}-titolo`}>
        <strong>
          {c.cabin} {cabin.code}
        </strong>
        {cabin.position ? null : <span className="badge">{c.notDrawn}</span>}
      </p>
      <p className="layout-spot__contract">
        {positionText(locale, cabin.position)}.{' '}
        {cabin.currentAssignment ? `${c.currentAssignment(formatPeriod(cabin.currentAssignment.validFrom, cabin.currentAssignment.validTo, locale))} ${c.holder}: ${holderText(locale, cabin.currentAssignment)}.` : c.noAssignment}{' '}
        {c.occupantToday}: {occupantText(locale, cabin)}.
      </p>
      {cabin.notes ? <p className="layout-spot__note">{c.notes}: {cabin.notes}</p> : null}
      <form method="post" action="/azioni/cabina-modifica" className="form-row">
        <Hidden values={{ ...common, cabin: cabin.cabinId }} />
        <div className="field">
          <label htmlFor={`${htmlId}-codice`}>{c.code}</label>
          <input id={`${htmlId}-codice`} name="code" maxLength={10} pattern="[A-Za-z0-9][A-Za-z0-9-]{0,9}" autoComplete="off" defaultValue={cabin.code} required />
        </div>
        <div className="field">
          <label htmlFor={`${htmlId}-blocco`}>{c.block}</label>
          <select id={`${htmlId}-blocco`} name="element" defaultValue={cabin.position ? blocks.find((block) => sameRect(block, cabin.position))?.elementId ?? '' : ''}>
            <option value="">{c.noBlock}</option>
            {blocks.map((block) => (
              <option key={block.elementId} value={block.elementId}>
                {block.label ?? t.booking.cabinsBox} · {positionFromElement(locale, block)}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor={`${htmlId}-note`}>{c.notes}</label>
          <input id={`${htmlId}-note`} name="notes" maxLength={500} autoComplete="off" defaultValue={cabin.notes ?? ''} />
        </div>
        <button className="button button--secondary button--small" type="submit">
          {c.save} <span className="visually-hidden">{cabin.code}</span>
        </button>
      </form>
      <div className="layout-spot__actions">
        <Link className="button button--secondary button--small" href={`${manageCabinsPath(locale, beachSlug)}?cabina=${cabin.cabinId}#storia`}>
          {c.openHistory} <span className="visually-hidden">{cabin.code}</span>
        </Link>
        {cabin.currentAssignment ? null : (
          <form method="post" action="/azioni/cabina-elimina" className="inline-form">
            <Hidden values={{ ...common, cabin: cabin.cabinId }} />
            <button className="button button--secondary button--small" type="submit">
              {c.remove} <span className="visually-hidden">{cabin.code}</span>
            </button>
          </form>
        )}
      </div>
      <p className="layout-spot__note">{c.removeNote}</p>
      {cabin.currentAssignment ? (
        <form method="post" action="/azioni/cabina-chiudi" className="form-row">
          <Hidden values={{ ...common, assignment: cabin.currentAssignment.assignmentId }} />
          <p className="layout-row__lead">
            <strong>{c.endTitle}.</strong> {c.endWarning}
          </p>
          <div className="field">
            <label htmlFor={`${htmlId}-fine`}>{c.endOn}</label>
            <input id={`${htmlId}-fine`} name="endOn" type="date" min={cabin.currentAssignment.validFrom} max={cabin.currentAssignment.validTo} defaultValue={cabin.currentAssignment.validTo} required />
          </div>
          <button className="button button--secondary button--small" type="submit">
            {c.end} <span className="visually-hidden">{cabin.code}</span>
          </button>
        </form>
      ) : (
        <form method="post" action="/azioni/cabina-affida" className="form-row">
          <Hidden values={{ ...common, cabin: cabin.cabinId }} />
          <p className="layout-row__lead">
            <strong>{c.assignTitle}.</strong> {c.holderHint}
          </p>
          <div className="field">
            <label htmlFor={`${htmlId}-email`}>{c.holderEmail}</label>
            <input id={`${htmlId}-email`} name="email" type="email" maxLength={200} autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor={`${htmlId}-nome`}>{c.holderName}</label>
            <input id={`${htmlId}-nome`} name="name" maxLength={120} autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor={`${htmlId}-contatto`}>{c.holderContact}</label>
            <input id={`${htmlId}-contatto`} name="contact" maxLength={200} autoComplete="off" />
          </div>
          <div className="field">
            <label htmlFor={`${htmlId}-dal`}>{getDictionary(locale, config.brandName).account.from}</label>
            <input id={`${htmlId}-dal`} name="from" type="date" required />
          </div>
          <div className="field">
            <label htmlFor={`${htmlId}-al`}>{getDictionary(locale, config.brandName).account.to}</label>
            <input id={`${htmlId}-al`} name="to" type="date" required />
          </div>
          <button className="button button--secondary button--small" type="submit">
            {c.assign} <span className="visually-hidden">{cabin.code}</span>
          </button>
        </form>
      )}
    </li>
  );
}

function sameRect(element: ApiLayoutElement, position: ApiCabinPosition | null): boolean {
  return (
    position !== null &&
    element.zone === position.zone &&
    element.rowNumber === position.rowNumber &&
    element.colStart === position.colStart &&
    element.colEnd === position.colEnd
  );
}

function positionFromElement(locale: Locale, element: ApiLayoutElement): string {
  const t = getDictionary(locale, config.brandName);
  return `${element.zone ? t.booking.zones[element.zone] : ''}, ${t.booking.row(element.rowNumber ?? 1).toLowerCase()}, ${t.layout.columnsRange(element.colStart ?? 1, element.colEnd ?? element.colStart ?? 1)}`;
}

/** The manager's cabins page: register, assignments, pending sublets and per-cabin history. */
export async function CabinsManageView({ locale, beachSlug, query }: { locale: Locale; beachSlug: string; query: Query }) {
  if (!slugPattern.test(beachSlug)) notFound();
  const t = getDictionary(locale, config.brandName);
  const c = t.cabins;
  const { me, token } = await requireMe(locale);
  const membership = me.memberships.find((entry) => entry.beachSlug === beachSlug);
  if (!membership || !can(membership.role, 'cabins.manage')) notFound();
  const other = locales.find((candidate) => candidate !== locale) ?? locale;
  const base = `/v1/manage/beaches/${beachSlug}`;

  const asked = first(query.cabina);
  const [cabins, pending, layout, history] = await Promise.all([
    apiCall<{ cabins: ApiCabin[] }>('GET', `${base}/cabins`, { token }),
    apiCall<{ sublets: ApiPendingSublet[] }>('GET', `${base}/cabin-sublets`, { token }),
    apiCall<{ elements: ApiLayoutElement[] }>('GET', `${base}/layout`, { token }),
    asked && uuidPattern.test(asked) ? apiCall<ApiCabinHistory>('GET', `${base}/cabins/${asked}`, { token }) : null,
  ]);
  const blocks = layout.ok ? layout.data.elements.filter((element) => element.kind === 'cabin_block') : [];
  const common = { lang: locale, beach: beachSlug };

  return (
    <PageShell
      locale={locale}
      page="help"
      highlight={false}
      alternatePath={manageCabinsPath(other, beachSlug)}
      crumbs={[
        { label: t.account.overviewTitle, href: accountPath(locale, 'overview') },
        { label: membership.beachName, href: accountPath(locale, 'manage', beachSlug) },
        { label: c.short },
      ]}
      signedInAs={me.user.name}
    >
      <PageHead title={c.title(membership.beachName)} lead={c.lead} />
      <section className="section">
        <div className="container stack">
          <Notice locale={locale} query={query} />
          <Link className="button button--secondary" href={accountPath(locale, 'manage', beachSlug)}>
            {c.backToManage}
          </Link>
          {!cabins.ok ? (
            <div className="empty">
              <h2>{c.unavailableTitle}</h2>
              <p>{c.unavailableText}</p>
            </div>
          ) : (
            <>
              {pending?.ok ? (
                <div className="panel" id="proposte">
                  <h2>{c.pendingTitle}</h2>
                  {pending.data.sublets.length === 0 ? (
                    <p className="prose">{c.noPending}</p>
                  ) : (
                    <DataTable label={c.pendingTitle} columns={[c.cabin, c.holder, c.occupant, c.period, t.account.actions].map((label) => ({ label }))}>
                      {pending.data.sublets.map((sublet) => (
                        <Row key={sublet.subletId}>
                          <Cell label={c.cabin}>{sublet.cabinCode}</Cell>
                          <Cell label={c.holder}>{sublet.holderName ?? c.accountOnly}</Cell>
                          <Cell label={c.occupant}>
                            {sublet.occupantName}
                            {sublet.occupantContact ? ` · ${sublet.occupantContact}` : ''}
                          </Cell>
                          <Cell label={c.period}>{formatPeriod(sublet.fromDay, sublet.toDay, locale)}</Cell>
                          <Cell label={t.account.actions}>
                            <form method="post" action="/azioni/cabina-decisione" className="inline-form">
                              <Hidden values={{ ...common, sublet: sublet.subletId }} />
                              <button className="button button--small" type="submit" name="approve" value="yes">
                                {t.account.approve} <span className="visually-hidden">{sublet.cabinCode}, {sublet.occupantName}</span>
                              </button>
                              <button className="button button--secondary button--small" type="submit" name="approve" value="no">
                                {t.account.reject} <span className="visually-hidden">{sublet.cabinCode}, {sublet.occupantName}</span>
                              </button>
                            </form>
                          </Cell>
                        </Row>
                      ))}
                    </DataTable>
                  )}
                </div>
              ) : null}

              <div className="panel" id="cabine">
                <h2>{c.listTitle}</h2>
                {cabins.data.cabins.length === 0 ? <p className="prose">{c.empty}</p> : null}
                <ul className="layout-spots">
                  {cabins.data.cabins.map((cabin) => (
                    <CabinEditor key={cabin.cabinId} locale={locale} cabin={cabin} blocks={blocks} common={common} beachSlug={beachSlug} />
                  ))}
                </ul>
                <h3>{c.createTitle}</h3>
                <form method="post" action="/azioni/cabina-crea" className="form-row">
                  <Hidden values={common} />
                  <div className="field">
                    <label htmlFor="nuova-cabina-codice">{c.code}</label>
                    <input id="nuova-cabina-codice" name="code" maxLength={10} pattern="[A-Za-z0-9][A-Za-z0-9-]{0,9}" autoComplete="off" required />
                  </div>
                  <div className="field">
                    <label htmlFor="nuova-cabina-blocco">{c.block}</label>
                    <select id="nuova-cabina-blocco" name="element" defaultValue="">
                      <option value="">{c.noBlock}</option>
                      {blocks.map((block) => (
                        <option key={block.elementId} value={block.elementId}>
                          {block.label ?? t.booking.cabinsBox} · {positionFromElement(locale, block)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="nuova-cabina-note">{c.notes}</label>
                    <input id="nuova-cabina-note" name="notes" maxLength={500} autoComplete="off" />
                  </div>
                  <button className="button button--secondary" type="submit">
                    {c.create}
                  </button>
                </form>
              </div>

              {history?.ok ? (
                <div className="panel" id="storia">
                  <h2>{c.historyTitle(history.data.code)}</h2>
                  {history.data.assignments.length === 0 ? <p className="prose">{c.historyEmpty}</p> : null}
                  {history.data.assignments.map((assignment) => (
                    <div key={assignment.assignmentId} className="stack">
                      <h3>
                        {holderText(locale, assignment)} · {formatPeriod(assignment.validFrom, assignment.validTo, locale)} · {c.assignmentStates[assignment.status]}
                      </h3>
                      {assignment.sublets.length === 0 ? (
                        <p className="prose">{c.noSublets}</p>
                      ) : (
                        <DataTable label={c.subletsTitle} columns={[c.occupant, c.period, c.state].map((label) => ({ label }))}>
                          {assignment.sublets.map((sublet) => (
                            <Row key={sublet.subletId}>
                              <Cell label={c.occupant}>
                                {sublet.occupantName}
                                {sublet.occupantContact ? ` · ${sublet.occupantContact}` : ''}
                              </Cell>
                              <Cell label={c.period}>{formatPeriod(sublet.fromDay, sublet.toDay, locale)}</Cell>
                              <Cell label={c.state}>
                                {c.subletStates[sublet.status]}
                                {sublet.decidedAt ? `, ${c.decidedOn(formatDate(sublet.decidedAt.slice(0, 10), locale))}` : ''}
                              </Cell>
                            </Row>
                          ))}
                        </DataTable>
                      )}
                    </div>
                  ))}
                  <p>
                    <Link className="button button--secondary button--small" href={`${manageCabinsPath(locale, beachSlug)}#cabine`}>
                      {c.closeHistory}
                    </Link>
                  </p>
                </div>
              ) : null}
            </>
          )}
        </div>
      </section>
    </PageShell>
  );
}

/** "Today's cabins" inside the front desk view: read only, nothing to decide. */
export async function CabinsTodayPanel({ locale, beachSlug, token }: { locale: Locale; beachSlug: string; token: string }) {
  const t = getDictionary(locale, config.brandName);
  const c = t.cabins;
  const today = await apiCall<{ cabins: { code: string; occupant: { name: string | null; source: 'sublet' | 'holder' } | null }[] }>(
    'GET',
    `/v1/manage/beaches/${beachSlug}/cabins/today`,
    { token },
  );
  if (!today.ok || today.data.cabins.length === 0) return null;
  return (
    <div className="panel" id="cabine-oggi">
      <h2>{c.todayTitle}</h2>
      <p className="prose">{c.todayLead}</p>
      <DataTable label={c.todayTitle} columns={[c.cabin, c.occupantToday].map((label) => ({ label }))}>
        {today.data.cabins.map((cabin) => (
          <Row key={cabin.code}>
            <RowHead>{cabin.code}</RowHead>
            <Cell label={c.occupantToday}>
              {cabin.occupant ? `${cabin.occupant.name ?? c.accountOnly} (${cabin.occupant.source === 'sublet' ? c.bySublet : c.byHolder})` : c.free}
            </Cell>
          </Row>
        ))}
      </DataTable>
    </div>
  );
}

/** The cabin holder's own page: exactly their cabins, periods and proposals, nothing else. */
export async function CabinHolderView({ locale, query }: { locale: Locale; query: Query }) {
  const t = getDictionary(locale, config.brandName);
  const c = t.cabins;
  const { me, token } = await requireMe(locale);
  const other = locales.find((candidate) => candidate !== locale) ?? locale;
  const mine = await apiCall<{ assignments: ApiMyAssignment[] }>('GET', '/v1/my/cabins', { token });
  const assignments = mine.ok ? mine.data.assignments : [];

  return (
    <PageShell
      locale={locale}
      page="help"
      highlight={false}
      alternatePath={accountPath(other, 'cabins')}
      crumbs={[{ label: t.account.overviewTitle, href: accountPath(locale, 'overview') }, { label: c.holderShort }]}
      signedInAs={me.user.name}
    >
      <PageHead title={c.holderTitle} lead={c.holderLead} />
      <section className="section">
        <div className="container stack">
          <Notice locale={locale} query={query} />
          {!mine.ok ? (
            <div className="empty">
              <h2>{c.unavailableTitle}</h2>
              <p>{c.unavailableText}</p>
            </div>
          ) : assignments.length === 0 ? (
            <p className="prose">{c.holderEmpty}</p>
          ) : (
            assignments.map((assignment) => (
              <div className="panel" key={assignment.assignmentId}>
                <h2>{c.assignmentTitle(assignment.cabinCode, assignment.beachName)}</h2>
                <p className="prose">
                  {positionText(locale, assignment.position)}. {c.validity(formatPeriod(assignment.validFrom, assignment.validTo, locale))}{' '}
                  {c.assignmentStates[assignment.status]}.
                </p>
                {assignment.status === 'ended' ? <p className="layout-warn">{c.endedEarly}</p> : null}
                {assignment.status === 'active' ? (
                  <>
                    <h3>{c.proposeTitle}</h3>
                    <p className="prose">{c.proposeLead}</p>
                    <form method="post" action="/azioni/cabina-proponi" className="form-row">
                      <Hidden values={{ lang: locale, assignment: assignment.assignmentId }} />
                      <div className="field">
                        <label htmlFor={`proposta-${assignment.assignmentId}-dal`}>{t.account.from}</label>
                        <input id={`proposta-${assignment.assignmentId}-dal`} name="from" type="date" min={assignment.validFrom} max={assignment.validTo} required />
                      </div>
                      <div className="field">
                        <label htmlFor={`proposta-${assignment.assignmentId}-al`}>{t.account.to}</label>
                        <input id={`proposta-${assignment.assignmentId}-al`} name="to" type="date" min={assignment.validFrom} max={assignment.validTo} required />
                      </div>
                      <div className="field">
                        <label htmlFor={`proposta-${assignment.assignmentId}-nome`}>{c.occupantName}</label>
                        <input id={`proposta-${assignment.assignmentId}-nome`} name="name" maxLength={120} autoComplete="off" required />
                      </div>
                      <div className="field">
                        <label htmlFor={`proposta-${assignment.assignmentId}-contatto`}>{c.occupantContact}</label>
                        <input id={`proposta-${assignment.assignmentId}-contatto`} name="contact" maxLength={200} autoComplete="off" />
                      </div>
                      <button className="button button--secondary" type="submit">
                        {c.propose}
                      </button>
                    </form>
                  </>
                ) : null}
                <h3>{c.yourSublets}</h3>
                {assignment.sublets.length === 0 ? (
                  <p className="prose">{c.noneYet}</p>
                ) : (
                  <>
                    <DataTable label={c.yourSublets} columns={[c.occupant, c.period, c.state].map((label) => ({ label }))}>
                      {assignment.sublets.map((sublet) => (
                        <Row key={sublet.subletId}>
                          <Cell label={c.occupant}>{sublet.occupantName}</Cell>
                          <Cell label={c.period}>{formatPeriod(sublet.fromDay, sublet.toDay, locale)}</Cell>
                          <Cell label={c.state}>
                            {c.subletStates[sublet.status]}
                            {sublet.decidedAt ? `, ${c.decidedOn(formatDate(sublet.decidedAt.slice(0, 10), locale))}` : ''}
                          </Cell>
                        </Row>
                      ))}
                    </DataTable>
                    {assignment.sublets.some((sublet) => sublet.status === 'ended') ? <p className="prose">{c.truncatedNote}</p> : null}
                  </>
                )}
              </div>
            ))
          )}
        </div>
      </section>
    </PageShell>
  );
}
