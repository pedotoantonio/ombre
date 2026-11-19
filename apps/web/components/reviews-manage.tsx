import { notFound } from 'next/navigation';
import { accountPath, can, config, getDictionary, locales, manageReviewsPath, type Locale } from '@ombre/shared';
import { apiCall, formatDate, formatPeriod, slugPattern } from '@/lib/api';
import { Hidden, Notice, requireMe } from './account';
import { ManageShell } from './manage-shell';
import { PageHead } from './PageShell';

// The reviews moderation page of the manager (D51): every review of the beach club,
// newest first, with the reply form and the flag form. The flag carries a written
// reason and its warning BEFORE the button: a flagged review stays visible until the
// platform decides. Everything works without JavaScript, like the whole area.

type Query = Record<string, string | string[] | undefined>;

interface ApiManagerReview {
  reviewId: string;
  rating: number;
  body: string | null;
  /** Name of the account, never the email (D51). */
  authorName: string;
  /** The dal–al period of the stay. */
  from: string;
  to: string;
  reply: string | null;
  status: 'published' | 'flagged';
  createdAt: string;
  groupCode: string;
  flagReason: string | null;
  flaggedAt: string | null;
  repliedAt: string | null;
}

export async function ReviewsManageView({ locale, beachSlug, query }: { locale: Locale; beachSlug: string; query: Query }) {
  if (!slugPattern.test(beachSlug)) notFound();
  const t = getDictionary(locale, config.brandName);
  const r = t.reviews;
  const { me, token } = await requireMe(locale);
  const membership = me.memberships.find((entry) => entry.beachSlug === beachSlug);
  if (!membership || !can(membership.role, 'reviews.moderate')) notFound();
  const other = locales.find((candidate) => candidate !== locale) ?? locale;

  const listed = await apiCall<{ reviews: ApiManagerReview[] }>('GET', `/v1/manage/beaches/${beachSlug}/reviews`, { token });
  const reviews = listed.ok ? listed.data.reviews : [];
  const common = { lang: locale, beach: beachSlug };

  return (
    <ManageShell
      locale={locale}
      beachSlug={beachSlug}
      beachName={membership.beachName}
      role={membership.role}
      active="reviews"
      userName={me.user.name}
      alternatePath={manageReviewsPath(other, beachSlug)}
      crumbs={[
        { label: t.account.overviewTitle, href: accountPath(locale, 'overview') },
        { label: membership.beachName, href: accountPath(locale, 'manage', beachSlug) },
        { label: r.short },
      ]}
    >
      <PageHead title={r.manageTitle} lead={r.manageLead} />
      <section className="section">
        <div className="container stack">
          <Notice locale={locale} query={query} />
          {!listed.ok ? (
            <p className="alert" role="alert">{t.account.errors.unavailable}</p>
          ) : reviews.length === 0 ? (
            <p className="prose">{r.none}</p>
          ) : (
            <ul className="layout-spots">
              {reviews.map((review) => {
                const htmlId = `recensione-${review.reviewId}`;
                // Il periodo del soggiorno: una giornata sola in parole, il dal–al per esteso.
                const stay = review.from === review.to ? r.stayOf(formatDate(review.from, locale)) : r.stayOfPeriod(formatPeriod(review.from, review.to, locale));
                return (
                  <li className="layout-spot" key={review.reviewId} id={htmlId} aria-labelledby={`${htmlId}-titolo`}>
                    <p className="layout-spot__head" id={`${htmlId}-titolo`}>
                      <strong>{r.rating(review.rating)}</strong>
                      <span className="badge">{r.by(review.authorName)}</span>
                      <span className="badge">{stay}</span>
                    </p>
                    <p className="layout-spot__contract">
                      {review.groupCode} · {formatDate(review.createdAt.slice(0, 10), locale)}
                    </p>
                    {review.body ? <p className="prose">{review.body}</p> : null}
                    {/* La segnalazione già fatta: la data e il motivo, al posto del modulo. */}
                    {review.status === 'flagged' && review.flaggedAt ? (
                      <p className="layout-warn">
                        {r.flagged(formatDate(review.flaggedAt.slice(0, 10), locale))}
                        {review.flagReason ? ` ${review.flagReason}` : ''}
                      </p>
                    ) : null}
                    {review.reply ? (
                      <p className="prose">
                        <strong>{r.replyLabel}:</strong> {review.reply}
                      </p>
                    ) : null}
                    <form method="post" action="/azioni/recensione-replica" className="stack">
                      <Hidden values={{ ...common, recensione: review.reviewId }} />
                      <div className="field">
                        <label htmlFor={`${htmlId}-replica`}>{r.replyField}</label>
                        <textarea id={`${htmlId}-replica`} name="reply" maxLength={600} rows={3} defaultValue={review.reply ?? ''} required />
                      </div>
                      <button className="button button--secondary button--small" type="submit">
                        {r.replyButton} <span className="visually-hidden">{r.by(review.authorName)}</span>
                      </button>
                    </form>
                    {review.status === 'published' ? (
                      <form method="post" action="/azioni/recensione-segnala" className="stack">
                        <Hidden values={{ ...common, recensione: review.reviewId }} />
                        <div className="field">
                          <label htmlFor={`${htmlId}-motivo`}>{r.flagReason}</label>
                          <input id={`${htmlId}-motivo`} name="reason" minLength={3} maxLength={200} autoComplete="off" required />
                        </div>
                        {/* L'avvertenza sta PRIMA del bottone: il Gestore la legge prima di premere. */}
                        <p className="field__hint">{r.flagWarning}</p>
                        <button className="button button--secondary button--small" type="submit">
                          {r.flagButton} <span className="visually-hidden">{r.by(review.authorName)}</span>
                        </button>
                      </form>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </ManageShell>
  );
}
