import { cache, type CSSProperties } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  beachPath,
  beachSection,
  bookingSegment,
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
  type SiteContent,
  type SiteTemplate,
} from '@ombre/shared';
import { api, dayPattern, formatDay, formatTime, isDay, slugPattern, uuidPattern, type ApiBeach, type ApiMapSpot, type ApiSpot } from '@/lib/api';
import { JsonLd, privateMetadata } from '@/lib/seo';
import { PageHead, PageShell, type Crumb } from './PageShell';
import { BeachSite, localBusinessData } from './site-view';

type Query = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export function otherLocale(locale: Locale): Locale {
  return locales.find((candidate) => candidate !== locale) ?? locale;
}

/** Checks the localized segments and loads the beach club, or answers 404. Asked once per request. */
export const loadBeach = cache(
  async (
    lang: string,
    section: string,
    slug: string,
  ): Promise<{ locale: Locale; beach: ApiBeach; nextDay: string | null; site: { template: SiteTemplate; content: SiteContent } | null }> => {
    if (!isLocale(lang) || section !== beachSection[lang] || !slugPattern.test(slug)) notFound();
    const result = await api.beach(slug);
    if (!result.ok) {
      if (result.status === 404) notFound();
      throw new Error(`API not available (${result.code})`);
    }
    return { locale: lang, beach: result.data.beach, nextDay: result.data.nextAvailableDay, site: result.data.site };
  },
);

export function crumbsFor(locale: Locale, beach: ApiBeach, last?: string): Crumb[] {
  const t = getDictionary(locale, config.brandName);
  const trail: Crumb[] = [{ label: t.nav.explore, href: pathFor('explore', locale) }];
  if (last) trail.push({ label: beach.name, href: beachPath(locale, beach.slug) }, { label: last });
  else trail.push({ label: beach.name });
  return trail;
}

export function DemoBadge({ locale, beach }: { locale: Locale; beach: ApiBeach }) {
  if (!beach.demo) return null;
  return (
    <p className="container">
      <span className="badge badge--demo">{getDictionary(locale, config.brandName).booking.demoBadge}</span>
    </p>
  );
}

export async function beachMetadata(lang: string, section: string, slug: string, query: Query = {}): Promise<Metadata> {
  const { locale, beach } = await loadBeach(lang, section, slug);
  const t = getDictionary(locale, config.brandName).booking;
  const languages: Record<string, string> = { 'x-default': config.siteUrl + beachPath('it', beach.slug) };
  for (const other of locales) languages[other] = config.siteUrl + beachPath(other, beach.slug);
  // A chosen day or spot is one view of the same page: only the plain address is indexed.
  const filtered = Object.keys(query).length > 0;
  return {
    title: t.beachTitle(beach.name, beach.locality),
    description: t.beachDescription(beach.name, beach.locality),
    alternates: { canonical: config.siteUrl + beachPath(locale, beach.slug), languages },
    // Sample data must never reach a search engine.
    ...(beach.demo ? { robots: { index: false, follow: false } } : filtered ? { robots: { index: false, follow: true } } : {}),
  };
}

/** Title of the pages after the beach page: summary, hold, booking. Never indexed. */
export async function stepMetadata(lang: string, section: string, slug: string, step: string): Promise<Metadata> {
  const { locale, beach } = await loadBeach(lang, section, slug);
  const t = getDictionary(locale, config.brandName);
  const page = step === bookSegment[locale] ? t.booking.summaryTitle : step === bookingSegment[locale] ? t.account.booking : t.booking.holdTitle;
  return privateMetadata(locale, page, { club: beach.name, follow: true });
}

/** Where the day picker and the map start: the target of the button under the lead. */
const pickerAnchor = 'disponibilita';

function SpotCard({ locale, beach, spot, day, selected }: { locale: Locale; beach: ApiBeach; spot: ApiSpot; day: string; selected: boolean }) {
  const t = getDictionary(locale, config.brandName).booking;
  const href = `${bookPath(locale, beach.slug)}?spot=${spot.spotId}&day=${day}`;
  return (
    <li className={selected ? 'spot plan-chosen' : 'spot'} aria-current={selected ? 'true' : undefined}>
      <span className="spot__code">{spot.code}</span>
      <p>{t.equipment(spot.umbrellas, spot.sunbeds)}</p>
      <p>{t.guests(spot.maxGuests)}</p>
      {spot.shared || selected ? (
        <p className="plan-tags">
          {spot.shared ? <span className="badge">{t.sharedDay}</span> : null}
          {selected ? <span className="badge">{t.status.selected}</span> : null}
        </p>
      ) : null}
      <span className="spot__price">{formatMoney(spot.priceCents, locale)}</span>
      <Link className="button button--secondary" href={href}>
        {t.choose(spot.code)}
      </Link>
    </li>
  );
}

// Corners of an umbrella seen from above: eight sides, flat at the top.
const canopy = [
  [41.55, 31.27],
  [31.27, 41.55],
  [16.73, 41.55],
  [6.45, 31.27],
  [6.45, 16.73],
  [16.73, 6.45],
  [31.27, 6.45],
  [41.55, 16.73],
] as const;
const canopyPath = `M${canopy.map((corner) => corner.join(' ')).join('L')}Z`;
const ribsPath = canopy.slice(0, 4).map((corner, index) => `M${corner.join(' ')}L${canopy[index + 4]!.join(' ')}`).join('');
const stripesPath = [0, 2, 4, 6].map((index) => `M24 24L${canopy[index]!.join(' ')}L${canopy[index + 1]!.join(' ')}Z`).join('');

/**
 * The mark of a spot on the map. The state is in the drawing, not only in the colour:
 * a full canopy is free, a canopy in alternate wedges is a shared day, a crossed one is not available.
 */
function UmbrellaMark({ status, selected = false }: { status: ApiMapSpot['status']; selected?: boolean }) {
  return (
    <svg className={`plan-mark plan-mark--${status}`} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path className="plan-mark__canopy" d={canopyPath} />
      {status === 'shared' ? (
        <>
          <path className="plan-mark__stripes" d={stripesPath} />
          <path className="plan-mark__outline" d={canopyPath} />
        </>
      ) : null}
      {status === 'unavailable' ? (
        <path className="plan-mark__cross" d="M16 16l16 16M32 16L16 32" />
      ) : (
        <>
          <path className="plan-mark__ribs" d={ribsPath} />
          <circle className="plan-mark__top" cx="24" cy="24" r="3" />
        </>
      )}
      {selected ? (
        <>
          <circle className="plan-mark__badge" cx="38" cy="10" r="8.5" />
          <path className="plan-mark__check" d="M33.8 10.2l3 3 5.4-6" />
        </>
      ) : null}
    </svg>
  );
}

function MapSpot({ locale, beach, spot, day, selected }: { locale: Locale; beach: ApiBeach; spot: ApiMapSpot; day: string; selected: boolean }) {
  const t = getDictionary(locale, config.brandName).booking;
  const content = (
    <>
      <UmbrellaMark status={spot.status} selected={selected} />
      <span className="plan-spot__code" aria-hidden="true">
        {spot.code}
      </span>
      <span className="visually-hidden">
        {t.mapSpot(spot.code, t.status[spot.status], spot.priceCents === null ? undefined : formatMoney(spot.priceCents, locale))}
        {selected ? `. ${t.status.selected}` : ''}
      </span>
    </>
  );
  if (spot.status === 'unavailable') {
    return (
      <li>
        <span className="plan-spot plan-spot--taken">{content}</span>
      </li>
    );
  }
  // The choice is a new address of this same page: it works without scripts and can be shared.
  // It points at the spot itself, so that the map comes back scrolled, also sideways, to the chosen spot.
  return (
    <li id={`postazione-${spot.code}`}>
      <Link
        className={`plan-spot plan-spot--${spot.status}${selected ? ' plan-spot--selected' : ''}`}
        href={`${beachPath(locale, beach.slug)}?day=${day}&spot=${spot.spotId}#postazione-${spot.code}`}
        prefetch={false}
        aria-current={selected ? 'true' : undefined}
      >
        {content}
      </Link>
    </li>
  );
}

function BeachMap({ locale, beach, layout, day, selected }: { locale: Locale; beach: ApiBeach; layout: ApiMapSpot[]; day: string; selected: ApiMapSpot | undefined }) {
  const t = getDictionary(locale, config.brandName).booking;
  const rows = [...new Set(layout.map((spot) => spot.rowNumber))].sort((a, b) => a - b);
  const free = layout.filter((spot) => spot.status !== 'unavailable').length;
  // The longest row sets the width the map needs: the hint about scrolling shows only when it does not fit.
  const widest = Math.max(...rows.map((row) => layout.filter((spot) => spot.rowNumber === row).length));
  return (
    <div className="plan" id="planimetria" role="group" aria-labelledby="planimetria-titolo" style={{ '--plan-cols': widest } as CSSProperties}>
      <div className="plan__head">
        <h3 id="planimetria-titolo">{t.planTitle}</h3>
        <p>{t.planLead}</p>
        <p className="plan__count">
          <strong>{t.freeCount(free, layout.length)}</strong>
          {free > 0 ? <a href="#elenco">{t.toList}</a> : null}
        </p>
      </div>
      {selected ? (
        <p className="plan__notice">
          <strong>{t.selectedNotice(selected.code)}</strong> <a href="#scelta">{t.toBar}</a>
        </p>
      ) : null}
      <ul className="plan-legend" aria-label={t.legendTitle}>
        <li>
          <UmbrellaMark status="free" />
          {t.status.free}
        </li>
        <li>
          <UmbrellaMark status="shared" />
          {t.status.shared}
        </li>
        <li>
          <UmbrellaMark status="unavailable" />
          {t.status.unavailable}
        </li>
        <li>
          <UmbrellaMark status="free" selected />
          {t.status.selected}
        </li>
      </ul>
      <div className="plan__map">
        <p className="plan__hint" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4" />
          </svg>
          {t.planScrollHint}
        </p>
        {/* Every row stays on one line: the map scrolls sideways inside this region, the page never does. */}
        <div className="plan__scroll" role="region" aria-label={t.planRegion} tabIndex={0}>
          <div className="plan__rows">
            <p className="plan__sea">
              <span className="plan__sea-label">
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M2 9c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2M2 15c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2" />
                </svg>
                {t.planSea}
                <span className="visually-hidden">, {t.planSeaNote}</span>
              </span>
            </p>
            {rows.map((row) => (
              <div className="plan-row" key={row}>
                <p className="plan-row__label" id={`planimetria-fila-${row}`}>
                  {t.row(row)}
                </p>
                <ol className="plan-row__spots" aria-labelledby={`planimetria-fila-${row}`}>
                  {layout
                    .filter((spot) => spot.rowNumber === row)
                    .map((spot) => (
                      <MapSpot key={spot.code} locale={locale} beach={beach} spot={spot} day={day} selected={spot.spotId === selected?.spotId} />
                    ))}
                </ol>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Bottom bar with the chosen spot and the one step forward. It stays in the flow of the page, so it never hides its end. */
function SelectionBar({ locale, beach, spot, day }: { locale: Locale; beach: ApiBeach; spot: ApiMapSpot & { priceCents: number }; day: string }) {
  const t = getDictionary(locale, config.brandName).booking;
  return (
    <aside className="plan-bar" id="scelta" aria-label={t.barLabel}>
      <div className="container plan-bar__inner">
        <p className="plan-bar__title">
          {t.spot(spot.code)}, {t.row(spot.rowNumber)}
        </p>
        <p className="plan-bar__price">{formatMoney(spot.priceCents, locale)}</p>
        <p className="plan-bar__detail">
          {t.equipment(spot.umbrellas, spot.sunbeds)}. {t.guests(spot.maxGuests)}.{spot.status === 'shared' ? ` ${t.sharedDay}.` : ''}
        </p>
        <Link className="button plan-bar__go" href={`${bookPath(locale, beach.slug)}?spot=${spot.spotId}&day=${day}`}>
          {t.barContinue}
        </Link>
      </div>
    </aside>
  );
}

export async function BeachView({ lang, section, slug, query }: { lang: string; section: string; slug: string; query: Query }) {
  const { locale, beach, nextDay, site } = await loadBeach(lang, section, slug);
  const t = getDictionary(locale, config.brandName).booking;
  const texts = site ? site.content[locale] : null;
  const asked = first(query.day);
  const day = isDay(asked) ? asked : nextDay;
  const availability = day ? await api.availability(beach.slug, day) : null;
  const spots = availability?.ok ? availability.data.spots : [];
  const layout = availability?.ok ? availability.data.layout : [];
  const rows = [...new Set(spots.map((spot) => spot.rowNumber))].sort((a, b) => a - b);
  const taken = layout.filter((spot) => spot.status === 'unavailable').map((spot) => spot.code);

  const askedSpot = first(query.spot);
  const picked = askedSpot && uuidPattern.test(askedSpot) ? layout.find((spot) => spot.spotId === askedSpot) : undefined;
  const selected = picked && picked.priceCents !== null ? { ...picked, priceCents: picked.priceCents } : undefined;
  const alternateQuery = isDay(asked) ? `?day=${asked}${selected ? `&spot=${selected.spotId}` : ''}` : '';

  return (
    <PageShell locale={locale} page="explore" alternatePath={beachPath(otherLocale(locale), beach.slug) + alternateQuery} crumbs={crumbsFor(locale, beach)}>
      <PageHead title={beach.name} lead={t.beachLead(beach.locality)}>
        {site && texts ? (
          <p className="actions">
            <a className="button" href={`#${pickerAnchor}`}>
              {t.chooseCta}
            </a>
          </p>
        ) : null}
      </PageHead>
      <DemoBadge locale={locale} beach={beach} />
      {site && texts ? (
        <section className="section">
          <div className="container">
            <BeachSite locale={locale} template={site.template} texts={texts} />
            {beach.demo ? null : <JsonLd data={localBusinessData(beach, texts, config.siteUrl + beachPath(locale, beach.slug))} />}
          </div>
        </section>
      ) : null}
      <section className="section" id={pickerAnchor}>
        <div className="container">
          {first(query.taken) ? <p className="alert" role="alert">{t.takenNotice}</p> : null}
          {picked && !selected ? <p className="alert" role="alert">{t.selectionGone}</p> : null}
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
              ) : (
                <>
                  {layout.length > 0 ? <BeachMap locale={locale} beach={beach} layout={layout} day={day} selected={selected} /> : null}
                  {spots.length === 0 ? (
                    <div className="empty">
                      <h3>{t.noSpotsTitle}</h3>
                      <p>{t.noSpotsText}</p>
                    </div>
                  ) : (
                    <div className="plan-list" id="elenco">
                      <h2>{t.listTitle}</h2>
                      <div className="spot-rows">
                        {rows.map((row) => (
                          <div className="spot-row" key={row}>
                            <h3>{t.row(row)}</h3>
                            <ul className="spots">
                              {spots
                                .filter((spot) => spot.rowNumber === row)
                                .map((spot) => (
                                  <SpotCard key={spot.spotId} locale={locale} beach={beach} spot={spot} day={day} selected={spot.spotId === selected?.spotId} />
                                ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                      {taken.length > 0 ? <p className="plan-list__taken">{t.unavailableList(taken.join(', '))}</p> : null}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </section>
      {selected && day ? <SelectionBar locale={locale} beach={beach} spot={selected} day={day} /> : null}
    </PageShell>
  );
}

export function PriceSummary({ locale, rows, quote }: { locale: Locale; rows: [string, string][]; quote: { listPriceCents: number; discountCents: number; totalCents: number; promoCode: string | null } }) {
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
                <button className="button button--block" type="submit">
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
  const c = getDictionary(locale, config.brandName).checkout;
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
              <form method="post" action="/azioni/prenotazione" className="stack">
                <input type="hidden" name="lang" value={locale} />
                <input type="hidden" name="beach" value={beach.slug} />
                <input type="hidden" name="hold" value={held.holdId} />
                <h2>{c.title}</h2>
                <div className="field">
                  <label htmlFor="nome">{c.name}</label>
                  <input id="nome" name="name" autoComplete="name" maxLength={120} required />
                </div>
                <div className="field">
                  <label htmlFor="email">{c.email}</label>
                  <input id="email" name="email" type="email" autoComplete="email" maxLength={200} required />
                </div>
                <button className="button button--block" type="submit">{c.button}</button>
              </form>
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
