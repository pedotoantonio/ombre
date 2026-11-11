import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  beachPath,
  beachSection,
  bookPath,
  bookSegment,
  config,
  formatMoney,
  getDictionary,
  holdSegment,
  isLocale,
  locales,
  pathFor,
  type Locale,
} from '@ombre/shared';
import { api, dayPattern, formatDay, formatTime, slugPattern, uuidPattern, type ApiBeach, type ApiSpot } from '@/lib/api';
import { PageHead, PageShell, type Crumb } from './PageShell';

type Query = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function otherLocale(locale: Locale): Locale {
  return locales.find((candidate) => candidate !== locale) ?? locale;
}

/** Checks the localized segments and loads the beach club, or answers 404. */
async function loadBeach(lang: string, section: string, slug: string): Promise<{ locale: Locale; beach: ApiBeach; nextDay: string | null }> {
  if (!isLocale(lang) || section !== beachSection[lang] || !slugPattern.test(slug)) notFound();
  const result = await api.beach(slug);
  if (!result.ok) {
    if (result.status === 404) notFound();
    throw new Error(`API not available (${result.code})`);
  }
  return { locale: lang, beach: result.data.beach, nextDay: result.data.nextAvailableDay };
}

function crumbsFor(locale: Locale, beach: ApiBeach, last?: string): Crumb[] {
  const t = getDictionary(locale, config.brandName);
  const trail: Crumb[] = [{ label: t.nav.explore, href: pathFor('explore', locale) }];
  if (last) trail.push({ label: beach.name, href: beachPath(locale, beach.slug) }, { label: last });
  else trail.push({ label: beach.name });
  return trail;
}

function DemoBadge({ locale, beach }: { locale: Locale; beach: ApiBeach }) {
  if (!beach.demo) return null;
  return (
    <p className="container">
      <span className="badge badge--demo">{getDictionary(locale, config.brandName).booking.demoBadge}</span>
    </p>
  );
}

export async function beachMetadata(lang: string, section: string, slug: string): Promise<Metadata> {
  const { locale, beach } = await loadBeach(lang, section, slug);
  const t = getDictionary(locale, config.brandName).booking;
  const languages: Record<string, string> = { 'x-default': config.siteUrl + beachPath('it', beach.slug) };
  for (const other of locales) languages[other] = config.siteUrl + beachPath(other, beach.slug);
  return {
    title: t.beachTitle(beach.name, beach.locality),
    description: t.beachDescription(beach.name, beach.locality),
    alternates: { canonical: config.siteUrl + beachPath(locale, beach.slug), languages },
    // Sample data must never reach a search engine.
    ...(beach.demo ? { robots: { index: false, follow: false } } : {}),
  };
}

export const privateMetadata: Metadata = { robots: { index: false, follow: true } };

function SpotCard({ locale, beach, spot, day }: { locale: Locale; beach: ApiBeach; spot: ApiSpot; day: string }) {
  const t = getDictionary(locale, config.brandName).booking;
  const href = `${bookPath(locale, beach.slug)}?spot=${spot.spotId}&day=${day}`;
  return (
    <li className="spot">
      <span className="spot__code">{spot.code}</span>
      <p>{t.equipment(spot.umbrellas, spot.sunbeds)}</p>
      <p>{t.guests(spot.maxGuests)}</p>
      {spot.shared ? (
        <p>
          <span className="badge">{t.sharedDay}</span>
        </p>
      ) : null}
      <span className="spot__price">{formatMoney(spot.priceCents, locale)}</span>
      <Link className="button" href={href}>
        {t.choose(spot.code)}
      </Link>
    </li>
  );
}

export async function BeachView({ lang, section, slug, query }: { lang: string; section: string; slug: string; query: Query }) {
  const { locale, beach, nextDay } = await loadBeach(lang, section, slug);
  const t = getDictionary(locale, config.brandName).booking;
  const asked = first(query.day);
  const day = asked && dayPattern.test(asked) ? asked : nextDay;
  const availability = day ? await api.availability(beach.slug, day) : null;
  const spots = availability?.ok ? availability.data.spots : [];
  const rows = [...new Set(spots.map((spot) => spot.rowNumber))].sort((a, b) => a - b);

  return (
    <PageShell locale={locale} page="explore" alternatePath={beachPath(otherLocale(locale), beach.slug)} crumbs={crumbsFor(locale, beach)}>
      <PageHead title={beach.name} lead={t.beachLead(beach.locality)} />
      <DemoBadge locale={locale} beach={beach} />
      <section className="section">
        <div className="container">
          {first(query.taken) ? <p className="alert" role="alert">{t.takenNotice}</p> : null}
          {!day ? (
            <div className="empty">
              <h2>{t.noDayTitle}</h2>
              <p>{t.noDayText}</p>
            </div>
          ) : (
            <div className="stack">
              <form className="form-row" method="get" action={beachPath(locale, beach.slug)}>
                <div className="field">
                  <label htmlFor="giorno">{t.dayLabel}</label>
                  <input id="giorno" type="date" name="day" defaultValue={day} required />
                </div>
                <button className="button button--secondary" type="submit">
                  {t.showDay}
                </button>
              </form>
              <h2>{t.freeTitle(formatDay(day, locale))}</h2>
              {!availability?.ok ? (
                <div className="empty">
                  <h3>{t.unavailableTitle}</h3>
                  <p>{t.unavailableText}</p>
                </div>
              ) : spots.length === 0 ? (
                <div className="empty">
                  <h3>{t.noSpotsTitle}</h3>
                  <p>{t.noSpotsText}</p>
                </div>
              ) : (
                <div className="spot-rows" style={{ width: '100%' }}>
                  {rows.map((row) => (
                    <div className="spot-row" key={row}>
                      <h3>{t.row(row)}</h3>
                      <ul className="spots">
                        {spots
                          .filter((spot) => spot.rowNumber === row)
                          .map((spot) => (
                            <SpotCard key={spot.spotId} locale={locale} beach={beach} spot={spot} day={day} />
                          ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </PageShell>
  );
}

function PriceSummary({ locale, rows, quote }: { locale: Locale; rows: [string, string][]; quote: { listPriceCents: number; discountCents: number; totalCents: number; promoCode: string | null } }) {
  const t = getDictionary(locale, config.brandName).booking;
  return (
    <dl className="summary">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
      <div>
        <dt>{t.listPrice}</dt>
        <dd>{formatMoney(quote.listPriceCents, locale)}</dd>
      </div>
      {quote.promoCode ? (
        <div>
          <dt>{t.discount(quote.promoCode)}</dt>
          <dd>{formatMoney(-quote.discountCents, locale)}</dd>
        </div>
      ) : null}
      <div className="summary__total">
        <dt>{t.total}</dt>
        <dd>{formatMoney(quote.totalCents, locale)}</dd>
      </div>
    </dl>
  );
}

export async function BookView({ lang, section, slug, step, query }: { lang: string; section: string; slug: string; step: string; query: Query }) {
  const { locale, beach } = await loadBeach(lang, section, slug);
  if (step !== bookSegment[locale]) notFound();
  const t = getDictionary(locale, config.brandName).booking;
  const spotId = first(query.spot) ?? '';
  const day = first(query.day) ?? '';
  if (!uuidPattern.test(spotId) || !dayPattern.test(day)) notFound();

  const promoAsked = first(query.promo)?.trim().slice(0, 40) || undefined;
  const request = { beachSlug: beach.slug, spotId, day };
  let quote = await api.quote({ ...request, promoCode: promoAsked });
  let promoRefused = Boolean(first(query.promoError));
  if (!quote.ok && quote.code === 'promo_not_applicable') {
    promoRefused = true;
    quote = await api.quote(request);
  }
  const availability = await api.availability(beach.slug, day);
  const spot = availability.ok ? availability.data.spots.find((candidate) => candidate.spotId === spotId) : undefined;
  const backHref = `${beachPath(locale, beach.slug)}?day=${day}`;
  const selfHref = bookPath(locale, beach.slug);
  const alternate = `${bookPath(otherLocale(locale), beach.slug)}?spot=${spotId}&day=${day}`;

  return (
    <PageShell locale={locale} page="explore" alternatePath={alternate} crumbs={crumbsFor(locale, beach, t.summaryTitle)}>
      <PageHead title={t.bookTitle(beach.name)} lead={t.holdNote} />
      <DemoBadge locale={locale} beach={beach} />
      <section className="section">
        <div className="container">
          {!quote.ok || !spot ? (
            <div className="empty">
              <h2>{quote.ok || quote.code === 'inventory_conflict' ? t.notAvailableTitle : t.unavailableTitle}</h2>
              <p>{quote.ok || quote.code === 'inventory_conflict' ? t.notAvailableText : t.unavailableText}</p>
              <Link className="button button--secondary" href={backHref}>
                {t.backToBeach}
              </Link>
            </div>
          ) : (
            <div className="stack">
              <h2>{t.summaryTitle}</h2>
              {promoRefused ? <p className="alert" role="alert">{t.promoInvalid}</p> : null}
              <PriceSummary
                locale={locale}
                quote={quote.data}
                rows={[
                  [t.dayRow, formatDay(day, locale)],
                  [t.spotRow, `${spot.code}, ${t.row(spot.rowNumber)}`],
                  [t.equipmentRow, t.equipment(spot.umbrellas, spot.sunbeds)],
                ]}
              />
              <form className="form-row" method="get" action={selfHref}>
                <input type="hidden" name="spot" value={spotId} />
                <input type="hidden" name="day" value={day} />
                <div className="field">
                  <label htmlFor="promo">{t.promoLabel}</label>
                  <input id="promo" name="promo" defaultValue={quote.data.promoCode ?? ''} maxLength={40} autoComplete="off" autoCapitalize="characters" />
                </div>
                <button className="button button--secondary" type="submit">
                  {t.promoApply}
                </button>
              </form>
              <div>
                <h3>{t.conditionsTitle}</h3>
                <p className="prose">{t.conditionsMissing}</p>
              </div>
              <form method="post" action="/azioni/riserva">
                <input type="hidden" name="lang" value={locale} />
                <input type="hidden" name="beach" value={beach.slug} />
                <input type="hidden" name="spot" value={spotId} />
                <input type="hidden" name="day" value={day} />
                <input type="hidden" name="promo" value={quote.data.promoCode ?? ''} />
                <input type="hidden" name="key" value={`web-${crypto.randomUUID()}`} />
                <button className="button" type="submit">
                  {t.holdButton}
                </button>
              </form>
            </div>
          )}
        </div>
      </section>
    </PageShell>
  );
}

export async function HoldView({ lang, section, slug, step, holdId }: { lang: string; section: string; slug: string; step: string; holdId: string }) {
  const { locale, beach } = await loadBeach(lang, section, slug);
  if (step !== holdSegment[locale] || !uuidPattern.test(holdId)) notFound();
  const t = getDictionary(locale, config.brandName).booking;
  const result = await api.getHold(beach.slug, holdId);
  if (!result.ok) {
    if (result.status === 404) notFound();
    throw new Error(`API not available (${result.code})`);
  }
  const held = result.data;
  const active = held.status === 'active';
  const alternate = `${beachPath(otherLocale(locale), beach.slug)}/${holdSegment[otherLocale(locale)]}/${holdId}`;

  return (
    <PageShell locale={locale} page="explore" alternatePath={alternate} crumbs={crumbsFor(locale, beach, t.holdTitle)}>
      <PageHead
        title={active ? t.holdActiveTitle : t.holdEndedTitle}
        lead={active ? t.holdUntil(formatTime(held.expiresAt, locale, beach.timezone)) : t.holdEndedText}
      />
      <DemoBadge locale={locale} beach={beach} />
      <section className="section">
        <div className="container stack">
          {active ? (
            <>
              <PriceSummary
                locale={locale}
                quote={held}
                rows={[
                  [t.dayRow, formatDay(held.day, locale)],
                  [t.spotRow, `${held.spot.code}, ${t.row(held.spot.rowNumber)}`],
                  [t.equipmentRow, t.equipment(held.spot.umbrellas, held.spot.sunbeds)],
                ]}
              />
              <p className="prose">{t.holdNotConfirmation}</p>
              <p className="alert alert--info">{t.paymentMissing}</p>
            </>
          ) : null}
          <Link className="button button--secondary" href={`${beachPath(locale, beach.slug)}?day=${held.day}`}>
            {t.backToBeach}
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
