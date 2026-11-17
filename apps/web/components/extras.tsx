import Link from 'next/link';
import { notFound } from 'next/navigation';
import { accountPath, can, config, formatMoney, getDictionary, locales, manageExtrasPath, type Locale } from '@ombre/shared';
import { apiCall, slugPattern, uuidPattern } from '@/lib/api';
import { Hidden, Notice, requireMe, SectionNotice } from './account';
import { ManageShell } from './manage-shell';
import { PageHead } from './PageShell';
import { Cell, DataTable, Row, RowHead } from './table';

// Extra services sold with the spot (spec §4.2): the manager's register of towels, safes,
// lessons… with Italian name, optional English name, unit price and display order. Managed
// with the commercial permission, like the hotel conventions; the unit prices reach the
// public only inside the booking flow of the club. Every page works without JavaScript.

type Query = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

interface ApiExtraServiceRow {
  serviceId: string;
  nameIt: string;
  nameEn: string | null;
  unitPriceCents: number;
  active: boolean;
  position: number;
}

/** An amount in euro as the form fields write it, with the locale's decimal separator. */
function euroField(cents: number, locale: Locale): string {
  return (cents / 100).toFixed(2).replace('.', locale === 'it' ? ',' : '.');
}

/** The creation and edit form: the same fields, a PUT when a service is being edited. */
function ExtraForm({ locale, beachSlug, service, query }: { locale: Locale; beachSlug: string; service: ApiExtraServiceRow | null; query: Query }) {
  const x = getDictionary(locale, config.brandName).extras;
  return (
    <div className="panel" id="modulo-extra">
      <h2>{service ? x.editTitle(service.nameIt) : x.newTitle}</h2>
      {/* A refused save lands here: its message sits next to the form, not at the top. */}
      <SectionNotice locale={locale} query={query} okKey="mok" errKey="merr" />
      {service ? (
        <p>
          <Link className="button button--secondary button--small" href={manageExtrasPath(locale, beachSlug)}>
            {x.cancelEdit}
          </Link>
        </p>
      ) : null}
      <form method="post" action="/azioni/extra-salva" className="stack">
        <Hidden values={{ lang: locale, beach: beachSlug, ...(service ? { service: service.serviceId } : {}) }} />
        <div className="form-row">
          <div className="field">
            <label htmlFor="extra-nome-it">{x.nameItLabel}</label>
            <input id="extra-nome-it" name="nameIt" maxLength={80} autoComplete="off" defaultValue={service?.nameIt ?? ''} required />
          </div>
          <div className="field">
            <label htmlFor="extra-nome-en">{x.nameEnLabel}</label>
            <input id="extra-nome-en" name="nameEn" maxLength={80} autoComplete="off" defaultValue={service?.nameEn ?? ''} aria-describedby="extra-nome-en-nota" />
            <p className="field__hint" id="extra-nome-en-nota">{x.nameEnHint}</p>
          </div>
        </div>
        <div className="form-row">
          <div className="field">
            <label htmlFor="extra-prezzo">{x.priceLabel}</label>
            <input id="extra-prezzo" name="price" inputMode="decimal" autoComplete="off" defaultValue={service ? euroField(service.unitPriceCents, locale) : ''} required />
          </div>
          <div className="field">
            <label htmlFor="extra-ordine">{x.orderLabel}</label>
            <input
              id="extra-ordine"
              name="position"
              inputMode="numeric"
              autoComplete="off"
              defaultValue={service ? String(service.position) : ''}
              aria-describedby="extra-ordine-nota"
            />
            <p className="field__hint" id="extra-ordine-nota">{x.orderHint}</p>
          </div>
        </div>
        <button className="button" type="submit">{service ? x.save : x.create}</button>
      </form>
    </div>
  );
}

/** The manager's extra services page: list, creation and edit, retirement and deletion. */
export async function ExtrasView({ locale, beachSlug, query }: { locale: Locale; beachSlug: string; query: Query }) {
  if (!slugPattern.test(beachSlug)) notFound();
  const t = getDictionary(locale, config.brandName);
  const x = t.extras;
  const { me, token } = await requireMe(locale);
  const membership = me.memberships.find((entry) => entry.beachSlug === beachSlug);
  if (!membership) notFound();
  const other = locales.find((candidate) => candidate !== locale) ?? locale;

  const alternate = manageExtrasPath(other, beachSlug);
  const crumbs = [
    { label: t.account.overviewTitle, href: accountPath(locale, 'overview') },
    { label: membership.beachName, href: accountPath(locale, 'manage', beachSlug) },
    { label: x.short },
  ];

  // Who lacks the commercial permission gets a clean message, like the conventions page.
  const allowed = can(membership.role, 'promotions.manage');
  const list = allowed ? await apiCall<{ extras: ApiExtraServiceRow[] }>('GET', `/v1/manage/beaches/${beachSlug}/extras`, { token }) : null;
  if (!allowed || (list !== null && !list.ok && list.status === 403)) {
    return (
      <ManageShell locale={locale} beachSlug={beachSlug} beachName={membership.beachName} role={membership.role} active={null} userName={me.user.name} alternatePath={alternate} crumbs={crumbs}>
        <PageHead title={x.title(membership.beachName)} lead={x.lead} />
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
  const services = list?.ok ? list.data.extras : [];

  const askedEdit = first(query.modifica);
  const editing = askedEdit && uuidPattern.test(askedEdit) ? services.find((service) => service.serviceId === askedEdit) ?? null : null;
  const common = { lang: locale, beach: beachSlug };
  const base = manageExtrasPath(locale, beachSlug);

  return (
    <ManageShell locale={locale} beachSlug={beachSlug} beachName={membership.beachName} role={membership.role} active={null} userName={me.user.name} alternatePath={alternate} crumbs={crumbs}>
      <PageHead title={x.title(membership.beachName)} lead={x.lead} />
      <section className="section">
        <div className="container stack">
          <Notice locale={locale} query={query} />
          {list !== null && !list.ok ? (
            <p className="alert" role="alert">{x.unavailable}</p>
          ) : null}

          <div className="panel">
            <h2>{x.listTitle}</h2>
            {services.length === 0 ? (
              <p className="prose">{x.empty}</p>
            ) : (
              <>
                <DataTable
                  label={x.listTitle}
                  columns={[
                    { label: x.colNameIt },
                    { label: x.colNameEn },
                    { label: t.account.price, numeric: true },
                    { label: x.colOrder, numeric: true },
                    { label: t.account.state },
                    { label: t.account.actions },
                  ]}
                >
                  {services.map((service) => (
                    <Row key={service.serviceId}>
                      <RowHead>{service.nameIt}</RowHead>
                      <Cell label={x.colNameEn}>{service.nameEn ?? x.noEnglish}</Cell>
                      <Cell label={t.account.price} numeric>{formatMoney(service.unitPriceCents, locale)}</Cell>
                      <Cell label={x.colOrder} numeric>{service.position}</Cell>
                      <Cell label={t.account.state}>{service.active ? x.stateActive : x.stateRetired}</Cell>
                      <Cell label={t.account.actions}>
                        <Link className="button button--secondary button--small" href={`${base}?modifica=${service.serviceId}#modulo-extra`}>
                          {x.edit} <span className="visually-hidden">{service.nameIt}</span>
                        </Link>
                        <form method="post" action="/azioni/extra-stato" className="inline-form">
                          <Hidden values={{ ...common, service: service.serviceId, active: service.active ? 'no' : 'yes' }} />
                          <button className="button button--secondary button--small" type="submit">
                            {service.active ? x.retire : x.restore} <span className="visually-hidden">{service.nameIt}</span>
                          </button>
                        </form>
                        <form method="post" action="/azioni/extra-elimina" className="inline-form">
                          <Hidden values={{ ...common, service: service.serviceId }} />
                          <button className="button button--secondary button--small" type="submit">
                            {x.remove} <span className="visually-hidden">{service.nameIt}</span>
                          </button>
                        </form>
                      </Cell>
                    </Row>
                  ))}
                </DataTable>
                <p className="prose">{x.deleteNote}</p>
                <p className="prose">{x.retiredNote}</p>
              </>
            )}
          </div>

          <ExtraForm locale={locale} beachSlug={beachSlug} service={editing} query={query} />
        </div>
      </section>
    </ManageShell>
  );
}
