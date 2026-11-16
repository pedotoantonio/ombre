import Link from 'next/link';
import { notFound } from 'next/navigation';
import { accountPath, can, config, getDictionary, locales, manageCommsPath, type Locale } from '@ombre/shared';
import { api, apiCall, formatInstant, slugPattern } from '@/lib/api';
import { Notice, requireMe } from './account';
import { PageHead, PageShell } from './PageShell';
import { Cell, DataTable, Row } from './table';

// The «Comunicazioni» page (spec §4.3): every notification the system prepared, with the
// template and the state in words and the full body readable and copyable without scripts.
// Nothing is really sent yet: WhatsApp and email go out by hand, from this very page.

type Query = Record<string, string | string[] | undefined>;

interface NotificationRow {
  notificationId: string;
  template: string;
  locale: string;
  recipient: string;
  status: 'queued' | 'sent' | 'skipped';
  provider: string;
  body: string | null;
  bookingCode: string | null;
  createdAt: string;
}

export async function CommsView({ locale, beachSlug, query }: { locale: Locale; beachSlug: string; query: Query }) {
  if (!slugPattern.test(beachSlug)) notFound();
  const t = getDictionary(locale, config.brandName);
  const m = t.comms;
  const { me, token } = await requireMe(locale);
  const membership = me.memberships.find((entry) => entry.beachSlug === beachSlug);
  if (!membership) notFound();
  const other = locales.find((candidate) => candidate !== locale) ?? locale;

  const alternate = manageCommsPath(other, beachSlug);
  const crumbs = [
    { label: t.account.overviewTitle, href: accountPath(locale, 'overview') },
    { label: membership.beachName, href: accountPath(locale, 'manage', beachSlug) },
    { label: m.short },
  ];

  // Reading is desk work: the texts are copied by hand from here (spec §4.3).
  const allowed = can(membership.role, 'bookings.read');
  const list = allowed ? await apiCall<{ notifications: NotificationRow[] }>('GET', `/v1/manage/beaches/${beachSlug}/notifications`, { token }) : null;
  if (!allowed || (list !== null && !list.ok && list.status === 403)) {
    return (
      <PageShell locale={locale} page="help" highlight={false} alternatePath={alternate} crumbs={crumbs} signedInAs={me.user.name}>
        <PageHead title={m.title(membership.beachName)} lead={m.lead} />
        <section className="section">
          <div className="container">
            <div className="empty">
              <h2>{m.forbiddenTitle}</h2>
              <p>{m.forbiddenText}</p>
            </div>
          </div>
        </section>
      </PageShell>
    );
  }
  const rows = list?.ok ? list.data.notifications : [];
  // The public card of the club, only for its time zone: the dates read in local time.
  const card = await api.beach(beachSlug);
  const timezone = card.ok ? card.data.beach.timezone : 'Europe/Rome';

  return (
    <PageShell locale={locale} page="help" highlight={false} alternatePath={alternate} crumbs={crumbs} signedInAs={me.user.name}>
      <PageHead title={m.title(membership.beachName)} lead={m.lead} />
      <section className="section">
        <div className="container stack">
          <Notice locale={locale} query={query} />
          {list !== null && !list.ok ? <p className="alert" role="alert">{m.unavailable}</p> : null}

          <div className="panel">
            <h2>{m.listTitle}</h2>
            {rows.length === 0 ? (
              <p className="prose">{m.empty}</p>
            ) : (
              <DataTable
                label={m.listTitle}
                columns={[{ label: m.colDate }, { label: m.colTemplate }, { label: m.colRecipient }, { label: t.account.state }, { label: m.colBooking }, { label: m.colBody }]}
              >
                {rows.map((row) => (
                  <Row key={row.notificationId}>
                    <Cell label={m.colDate}>{formatInstant(row.createdAt, locale, timezone)}</Cell>
                    <Cell label={m.colTemplate}>{m.templateName(row.template)}</Cell>
                    <Cell label={m.colRecipient}>{row.recipient}</Cell>
                    {/* The state in words, never colour alone (spec §5). */}
                    <Cell label={t.account.state}>{m.statusNames[row.status]}</Cell>
                    <Cell label={m.colBooking}>{row.bookingCode}</Cell>
                    <Cell label={m.colBody}>
                      {row.body ? (
                        <details className="copy-block">
                          <summary>{m.showBody}</summary>
                          <pre>{row.body}</pre>
                          <p className="field__hint">{m.copyHint}</p>
                        </details>
                      ) : (
                        m.noBody
                      )}
                    </Cell>
                  </Row>
                ))}
              </DataTable>
            )}
          </div>

          <Link className="button button--secondary" href={accountPath(locale, 'manage', beachSlug)}>
            {m.backToManage}
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
