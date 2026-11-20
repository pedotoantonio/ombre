import Link from 'next/link';
import { connection } from 'next/server';
import { accountPath, beachAmenities, beachPath, config, formatMoney, getDictionary, pathFor, type BeachAmenity, type InnerPageId, type Locale } from '@ombre/shared';
import { api, formatDay, formatPeriod, formatRating, isDay, periodDays, today, type ApiBeachOffer } from '@/lib/api';
import { breadcrumbData, JsonLd, pageUrl } from '@/lib/seo';
import { Contact, NextStep, PageHead } from './PageShell';
import { MapPanel, type MapLabels, type MapMarker } from './map-panel';

interface PageProps {
  locale: Locale;
}

type Query = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const defaultGuests = 2;
const maxGuests = 20;

export interface ExploreSearch {
  place: string;
  day: string | null;
  /** Last day of the dal–al period (D39): null means the one day. A backwards or too
   * long period is kept and the refusal of the API is rendered in words. */
  to: string | null;
  guests: number;
  sharedOnly: boolean;
  /** The ticked amenities of the catalogue (D49), in catalogue order. */
  amenities: BeachAmenity[];
}

/** Reads a search from the address. What is not valid is left out, never refused. */
export function readSearch(query: Query): ExploreSearch {
  const day = first(query.day);
  const to = first(query.to);
  const guests = Number(first(query.guests));
  // The ticked boxes arrive as repeated `srv` values (D49): only catalogue identifiers count.
  const ticked = query.srv === undefined ? [] : Array.isArray(query.srv) ? query.srv : [query.srv];
  return {
    place: (first(query.place) ?? '').trim().slice(0, 80),
    day: isDay(day) ? day : null,
    to: isDay(day) && isDay(to) && to !== day ? to : null,
    guests: Number.isInteger(guests) && guests >= 1 && guests <= maxGuests ? guests : defaultGuests,
    sharedOnly: first(query.shared) === '1',
    amenities: beachAmenities.filter((id) => ticked.includes(id)),
  };
}

/** The search as it is written in the address. Empty when nothing was asked. */
export function searchQuery(search: ExploreSearch): string {
  const query = new URLSearchParams();
  if (search.place) query.set('place', search.place);
  if (search.day) query.set('day', search.day);
  if (search.day && search.to) query.set('to', search.to);
  if (search.day || search.guests !== defaultGuests) query.set('guests', String(search.guests));
  if (search.sharedOnly) query.set('shared', '1');
  for (const id of search.amenities) query.append('srv', id);
  const text = query.toString();
  return text ? `?${text}` : '';
}

function StepList({ steps }: { steps: readonly { title: string; text: string }[] }) {
  return (
    <ol className="steps">
      {steps.map((step) => (
        <li key={step.title}>
          <h3>{step.title}</h3>
          <p>{step.text}</p>
        </li>
      ))}
    </ol>
  );
}

/** Where a search lands on the explore page: the results, not the form again. */
const resultsAnchor = 'risultati';

/** Texts of the map box as plain strings: they cross to the client component. */
function mapLabels(locale: Locale, where: 'home' | 'search'): MapLabels {
  const t = getDictionary(locale, config.brandName).map;
  return {
    invite: where === 'home' ? t.inviteSearch : t.inviteList,
    inviteCta: where === 'home' ? t.goSearch : t.goList,
    inviteHref: where === 'home' ? pathFor('search', locale) : `#${resultsAnchor}`,
    region: t.region,
    open: t.open,
    zoomIn: t.zoomIn,
    zoomOut: t.zoomOut,
  };
}

/** The server-rendered stand-in for the map (D69): the same clubs as the pins, name in
 * sight, locality and link. Without JavaScript this is what the box shows; with JavaScript
 * the Leaflet map replaces it once ready, and if map or tiles fail the list stays. */
function MapFallback({ locale, markers }: { locale: Locale; markers: MapMarker[] }) {
  if (markers.length === 0) return null;
  const t = getDictionary(locale, config.brandName).map;
  return (
    <div className="portal-map__fallback">
      <p className="portal-map__list-label">{t.list}</p>
      <ul className="portal-map__list">
        {markers.map((marker) => (
          <li key={marker.slug}>
            <Link href={marker.href}>{marker.name}</Link>
            <span className="portal-map__list-place">, {marker.locality}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Plain form that opens the explore page with the search in the address. It works without scripts. */
function SearchForm({ locale, search, minDay }: { locale: Locale; search: ExploreSearch; minDay?: string }) {
  const t = getDictionary(locale, config.brandName).search;
  const a = getDictionary(locale, config.brandName).amenities;
  return (
    <form className="portal-search" method="get" action={`${pathFor('search', locale)}#${resultsAnchor}`} role="search" aria-label={t.title}>
      <div className="field portal-search__place">
        <label htmlFor="cerca-luogo">{t.place}</label>
        <input id="cerca-luogo" name="place" type="text" maxLength={80} defaultValue={search.place} autoComplete="off" enterKeyHint="search" />
      </div>
      <div className="field">
        <label htmlFor="cerca-giorno">{t.dayFrom}</label>
        <input id="cerca-giorno" name="day" type="date" min={minDay} defaultValue={search.day ?? ''} />
      </div>
      {/* «Al» facoltativo (D39): vuoto, la ricerca resta di una sola giornata. */}
      <div className="field">
        <label htmlFor="cerca-al">{t.dayTo}</label>
        <input id="cerca-al" name="to" type="date" min={minDay} defaultValue={search.to ?? ''} />
      </div>
      <div className="field">
        <label htmlFor="cerca-ospiti">{t.guests}</label>
        <input id="cerca-ospiti" name="guests" type="number" inputMode="numeric" min={1} max={maxGuests} defaultValue={search.guests} required />
      </div>
      <div className="portal-search__shared">
        <label className="portal-check" htmlFor="cerca-condivise">
          <input id="cerca-condivise" name="shared" type="checkbox" value="1" defaultChecked={search.sharedOnly} aria-describedby="cerca-condivise-nota" />
          <span>{t.sharedOnly}</span>
        </label>
        <p className="portal-search__hint" id="cerca-condivise-nota">
          {t.sharedHint}
        </p>
      </div>
      {/* Le caselle dei servizi (D49): stesso nome `srv` ripetuto, funziona senza script.
          Dopo l'invio i filtri scelti restano spuntati, letti dall'indirizzo. */}
      <fieldset className="portal-search__services">
        <legend>{a.filterLegend}</legend>
        <p className="portal-search__hint">{a.filterHint}</p>
        <div className="portal-search__services-grid">
          {beachAmenities.map((id) => (
            <label className="portal-check" key={id} htmlFor={`cerca-srv-${id}`}>
              <input id={`cerca-srv-${id}`} name="srv" type="checkbox" value={id} defaultChecked={search.amenities.includes(id)} />
              <span>{a[id]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <button className="button portal-search__submit" type="submit">
        {t.submit}
      </button>
    </form>
  );
}

export async function HomePage({ locale }: PageProps) {
  const t = getDictionary(locale, config.brandName);
  const copy = t.pages.home;
  const audienceLinks: readonly InnerPageId[] = ['guestGuide', 'seasonGuide', 'managerGuide'];

  // The clubs of the map, read from the API at request time (D69): they feed both the pins
  // and the server-rendered list fallback. If the API does not answer, the box falls back
  // to the invitation alone — exactly as before — and the home never breaks.
  let markers: MapMarker[] | null = null;
  try {
    const result = await api.beaches();
    if (result.ok) {
      markers = result.data.beaches.flatMap((beach) =>
        beach.latitude === null || beach.longitude === null
          ? []
          : [
              {
                slug: beach.slug,
                name: beach.name,
                locality: beach.locality,
                latitude: beach.latitude,
                longitude: beach.longitude,
                href: beachPath(locale, beach.slug),
              },
            ],
      );
    }
  } catch {
    markers = null;
  }

  return (
    <>
      <JsonLd
        data={{
          '@type': 'WebSite',
          name: config.brandName,
          url: pageUrl('home', locale),
          description: t.meta.siteDescription,
          inLanguage: locale,
        }}
      />
      <section className="portal-hero">
        <div className="portal-hero__art">
          {/* Decorative: the photograph says nothing the text does not say. */}
          <picture>
            <source media="(max-width: 47.99rem)" type="image/avif" srcSet="/img/costa-mobile.avif" />
            <source media="(max-width: 47.99rem)" type="image/webp" srcSet="/img/costa-mobile.webp" />
            <source media="(max-width: 47.99rem)" srcSet="/img/costa-mobile.jpg" />
            <source type="image/avif" srcSet="/img/costa-1400.avif 1400w, /img/costa-2100.avif 1960w" sizes="100vw" />
            <source type="image/webp" srcSet="/img/costa-1400.webp 1400w, /img/costa-2100.webp 1960w" sizes="100vw" />
            <img
              src="/img/costa-1400.jpg"
              srcSet="/img/costa-1400.jpg 1400w, /img/costa-2100.jpg 1960w"
              sizes="100vw"
              alt=""
              width={1400}
              height={509}
              fetchPriority="high"
              decoding="async"
            />
          </picture>
        </div>
        <div className="container">
          <div className="portal-hero__panel">
            <h1>{copy.h1}</h1>
            <p className="lead">{copy.lead}</p>
            <SearchForm locale={locale} search={{ place: '', day: null, to: null, guests: defaultGuests, sharedOnly: false, amenities: [] }} />
          </div>
        </div>
      </section>
      <section className="section portal-map-section" aria-labelledby="mappa-titolo">
        <div className="container">
          <h2 id="mappa-titolo">{t.map.homeTitle}</h2>
          <p className="portal-map-lead">{t.map.homeLead}</p>
          {/* The pins come with the page; the internal route stays as the fallback source. */}
          {markers ? (
            <MapPanel markers={markers} labels={mapLabels(locale, 'home')} fallback={<MapFallback locale={locale} markers={markers} />} />
          ) : (
            <MapPanel sourceUrl={`/dati/mappa?lang=${locale}`} labels={mapLabels(locale, 'home')} />
          )}
        </div>
      </section>
      <section className="section section--tinted">
        <div className="container">
          <h2>{copy.stepsTitle}</h2>
          <StepList steps={copy.steps} />
        </div>
      </section>
      <section className="section">
        <div className="container">
          <div className="callout">
            <h2>{copy.ideaTitle}</h2>
            <p>{copy.ideaText}</p>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <h2>{copy.audiencesTitle}</h2>
          <ul className="cards">
            {copy.audiences.map((audience, index) => (
              <li className="card" key={audience.title}>
                <h3>{audience.title}</h3>
                <p>{audience.text}</p>
                <Link className="button button--secondary card__cta" href={pathFor(audienceLinks[index] ?? 'guestGuide', locale)}>
                  {audience.link}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}

/** The amenity badges of a result card (D49): at most four, then «+n». */
function AmenityBadges({ locale, amenities }: { locale: Locale; amenities: string[] }) {
  const a = getDictionary(locale, config.brandName).amenities;
  const known = beachAmenities.filter((id) => amenities.includes(id));
  if (known.length === 0) return null;
  const shown = known.slice(0, 4);
  return (
    <ul className="portal-club__amenities">
      {shown.map((id) => (
        <li className="badge" key={id}>
          {a[id]}
        </li>
      ))}
      {known.length > shown.length ? <li className="badge">{a.overflow(known.length - shown.length)}</li> : null}
    </ul>
  );
}

/** The review average of a club (D51): «4,6 su 5 · 12 recensioni», the singular its own form. */
export function RatingLine({ locale, rating }: { locale: Locale; rating: { average: number; count: number } | null }) {
  if (!rating) return null;
  const r = getDictionary(locale, config.brandName).reviews;
  const average = formatRating(rating.average, locale);
  return <p className="rating-line">{rating.count === 1 ? r.averageOne(average) : r.average(average, rating.count)}</p>;
}

function BeachCard({ locale, beach, day, to }: { locale: Locale; beach: ApiBeachOffer; day: string | null; to: string | null }) {
  const t = getDictionary(locale, config.brandName);
  const copy = t.pages.search;
  const query = day ? `?day=${day}${to ? `&to=${to}` : ''}` : '';
  return (
    <li className="card portal-club">
      {beach.cover ? (
        <img className="portal-club__cover" src={beach.cover.src} alt={beach.cover.alt[locale] ?? ''} width={1200} height={800} loading="lazy" />
      ) : (
        <div className="portal-club__cover portal-club__cover--empty" aria-hidden="true" />
      )}
      <h3>{beach.name}</h3>
      <p>{beach.locality}</p>
      <RatingLine locale={locale} rating={beach.rating} />
      <AmenityBadges locale={locale} amenities={beach.amenities} />
      {day && beach.freeSpots ? (
        <p className="portal-club__offer">
          <span className="portal-club__free">{copy.freeSpots(beach.freeSpots)}</span>
          {typeof beach.priceFromCents === 'number' ? (
            <span className="portal-club__price">
              {copy.priceFrom(formatMoney(beach.priceFromCents, locale))}
              <span className="portal-club__price-note">{to ? copy.priceNotePeriod : copy.priceNote}</span>
            </span>
          ) : null}
        </p>
      ) : null}
      {beach.demo ? (
        <p>
          <span className="badge badge--demo">{t.booking.demoBadgeShort}</span>
        </p>
      ) : null}
      <Link className="card__link" href={`${beachPath(locale, beach.slug)}${query}`}>
        {copy.viewBeach}
        <span className="visually-hidden">: {beach.name}</span>
      </Link>
    </li>
  );
}

async function SearchPage({ locale, query = {} }: PageProps & { query?: Query }) {
  // The list comes from the API at request time: this page is never prerendered.
  await connection();
  const t = getDictionary(locale, config.brandName);
  const copy = t.pages.search;
  const asked = readSearch(query);
  const dayPast = asked.day !== null && asked.day < today();
  const search = { ...asked, day: dayPast ? null : asked.day, to: dayPast ? null : asked.to };
  const result = await api.beaches({
    locality: search.place || undefined,
    day: search.day ?? undefined,
    to: search.to ?? undefined,
    guests: search.guests,
    sharedOnly: search.sharedOnly,
    amenities: search.amenities,
  });
  // A refused period (D39) comes back in words: over 31 days, or written backwards.
  const periodError = !result.ok && result.status === 409 ? (result.code === 'cap_reached' ? t.booking.periodTooLong : t.booking.periodBackwards) : null;
  const beaches = result.ok ? result.data.beaches : [];
  // With a day, a beach club is a result only if it has something to sell for this search.
  const open = search.day ? beaches.filter((beach) => (beach.freeSpots ?? 0) > 0) : beaches;
  const full = search.day ? beaches.filter((beach) => (beach.freeSpots ?? 0) === 0) : [];
  const notes = search.day ? [copy.resultsFor(search.guests), ...(search.sharedOnly ? [copy.sharedOnlyNote] : [])] : [copy.needDay];
  if (result.ok && search.day && search.to) notes.unshift(copy.periodNote(periodDays(search.day, search.to)));
  if (search.place) notes.push(copy.placeNote(search.place));

  // The same selection as the list, as pins: a club without coordinates stays in the list only.
  const listed = search.day ? open : beaches;
  const markers: MapMarker[] = listed.flatMap((beach) =>
    beach.latitude === null || beach.longitude === null
      ? []
      : [
          {
            slug: beach.slug,
            name: beach.name,
            locality: beach.locality,
            latitude: beach.latitude,
            longitude: beach.longitude,
            href: `${beachPath(locale, beach.slug)}${search.day ? `?day=${search.day}${search.to ? `&to=${search.to}` : ''}` : ''}`,
            ...(search.day && typeof beach.priceFromCents === 'number'
              ? { priceFromText: copy.priceFrom(formatMoney(beach.priceFromCents, locale)) }
              : {}),
          },
        ],
  );

  return (
    <>
      <PageHead title={copy.h1} lead={copy.lead} />
      <section className="section portal-explore">
        <div className="container portal-results">
          <div className="portal-search-panel">
            <SearchForm locale={locale} search={search} minDay={today()} />
          </div>
          <div className="portal-results__body" id={resultsAnchor}>
            {dayPast ? (
              <p className="alert" role="alert">
                {copy.pastDay}
              </p>
            ) : null}
            {periodError ? (
              <p className="alert" role="alert">
                {periodError}
              </p>
            ) : !result.ok ? (
              <div className="empty">
                <h2>{copy.unavailableTitle}</h2>
                <p>{copy.unavailableText}</p>
              </div>
            ) : beaches.length === 0 && !search.place ? (
              <div className="empty">
                <h2>{copy.emptyTitle}</h2>
                <p>{copy.emptyText}</p>
                <Link className="button button--secondary" href={pathFor('guestGuide', locale)}>
                  {copy.emptyLink}
                </Link>
              </div>
            ) : beaches.length === 0 ? (
              <div className="empty">
                <h2>{copy.noMatchTitle}</h2>
                <p>{copy.noMatchText(search.place)}</p>
                <Link className="button button--secondary" href={pathFor('search', locale)}>
                  {copy.showAll}
                </Link>
              </div>
            ) : (
              <>
                {markers.length > 0 ? (
                  <div className="portal-map-block" aria-labelledby="mappa-risultati">
                    <h2 id="mappa-risultati">{t.map.searchTitle}</h2>
                    <p className="portal-map-lead">{t.map.searchLead}</p>
                    <MapPanel markers={markers} labels={mapLabels(locale, 'search')} fallback={<MapFallback locale={locale} markers={markers} />} />
                  </div>
                ) : null}
                <div className="portal-results__head">
                  <h2>
                    {search.day && search.to
                      ? copy.resultsPeriodTitle(formatPeriod(search.day, search.to, locale))
                      : search.day
                        ? copy.resultsTitle(formatDay(search.day, locale))
                        : copy.listTitle}
                  </h2>
                  <p>{notes.join(' ')}</p>
                </div>
                {open.length === 0 ? (
                  <div className="empty">
                    <h3>{copy.noFreeTitle}</h3>
                    <p>{copy.noFreeText}</p>
                    <Link className="button button--secondary" href={pathFor('search', locale)}>
                      {copy.showAll}
                    </Link>
                  </div>
                ) : (
                  <ul className="cards">
                    {open.map((beach) => (
                      <BeachCard key={beach.slug} locale={locale} beach={beach} day={search.day} to={search.to} />
                    ))}
                  </ul>
                )}
                {full.length > 0 && open.length > 0 ? (
                  <div className="portal-results__full">
                    <p id="senza-posto">{copy.fullLead}</p>
                    <ul aria-labelledby="senza-posto">
                      {full.map((beach) => (
                        <li key={beach.slug}>
                          <Link href={beachPath(locale, beach.slug)}>{beach.name}</Link>, {beach.locality}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

function GuestGuidePage({ locale }: PageProps) {
  const copy = getDictionary(locale, config.brandName).pages.guestGuide;
  return (
    <>
      <PageHead title={copy.h1} lead={copy.lead} />
      <section className="section section--tinted">
        <div className="container">
          <h2>{copy.stepsTitle}</h2>
          <StepList steps={copy.steps} />
        </div>
      </section>
      <section className="section">
        <div className="container">
          <h2>{copy.termsTitle}</h2>
          <dl className="terms">
            {copy.terms.map((entry) => (
              <div key={entry.term}>
                <dt>{entry.term}</dt>
                <dd>{entry.text}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
      <section className="section section--tinted">
        <div className="container">
          <h2>{copy.notesTitle}</h2>
          <ul className="list">
            {copy.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      </section>
      <NextStep title={copy.nextTitle} text={copy.nextText} action={{ label: copy.nextAction, href: pathFor('search', locale) }} />
    </>
  );
}

/** The sign-in door of a role page, in plain sight right under the opening (criterion 6). */
function RoleAccess({ locale, copy }: { locale: Locale; copy: { title: string; text: string; action: string } }) {
  return (
    <section className="section">
      <div className="container">
        <div className="next-step">
          <h2>{copy.title}</h2>
          <p>{copy.text}</p>
          <p className="actions">
            <Link className="button" href={accountPath(locale, 'signIn')}>
              {copy.action}
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}

function ManagerGuidePage({ locale }: PageProps) {
  const copy = getDictionary(locale, config.brandName).pages.managerGuide;
  const screens = ['console-filtri-it-desktop.png', 'planner-it-desktop.png', 'scheda-postazione-it-desktop.png', 'economia-it-desktop.png'];
  return (
    <>
      <PageHead title={copy.h1} lead={copy.lead} />
      <RoleAccess locale={locale} copy={copy.access} />
      <section className="section section--tinted">
        <div className="container">
          <h2>{copy.tourTitle}</h2>
          <p className="prose">{copy.tourLead}</p>
          <ul className="portal-tour">
            {copy.tour.map((screen, index) => (
              <li key={screen.caption}>
                <figure>
                  <img src={`/img/gestionale/${screens[index]}`} alt="" width={1366} height={900} loading="lazy" decoding="async" />
                  <figcaption>{screen.caption}</figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <div className="callout">
            <h2>{copy.controlTitle}</h2>
            <p>{copy.controlText}</p>
          </div>
        </div>
      </section>
      <section className="section section--tinted">
        <div className="container">
          <h2>{copy.includesTitle}</h2>
          <ul className="list">
            {copy.includes.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <h2>{copy.limitsTitle}</h2>
          <ul className="list">
            {copy.limits.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>
      <section className="section section--tinted">
        <div className="container">
          <h2>{copy.activationTitle}</h2>
          <ol className="list">
            {copy.activation.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </div>
      </section>
      <section className="section">
        <div className="container">
          <h2>{copy.pricingTitle}</h2>
          <p className="prose">{copy.pricingText}</p>
        </div>
      </section>
      <Contact locale={locale} />
      <NextStep
        title={copy.nextTitle}
        text={copy.nextText}
        action={{ label: copy.nextAction, href: pathFor('search', locale) }}
        secondary={{ label: copy.nextSecondary, href: pathFor('guestGuide', locale) }}
      />
    </>
  );
}

function SeasonGuidePage({ locale }: PageProps) {
  const copy = getDictionary(locale, config.brandName).pages.seasonGuide;
  return (
    <>
      <PageHead title={copy.h1} lead={copy.lead} />
      <RoleAccess locale={locale} copy={copy.access} />
      <section className="section section--tinted">
        <div className="container">
          <h2>{copy.stepsTitle}</h2>
          <StepList steps={copy.steps} />
        </div>
      </section>
      <section className="section">
        <div className="container">
          <h2>{copy.rulesTitle}</h2>
          <ul className="list">
            {copy.rules.map((rule) => (
              <li key={rule}>{rule}</li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}

function HelpPage({ locale }: PageProps) {
  const copy = getDictionary(locale, config.brandName).pages.help;
  return (
    <>
      <JsonLd
        data={{
          '@type': 'FAQPage',
          mainEntity: copy.faq.map((entry) => ({
            '@type': 'Question',
            name: entry.q,
            acceptedAnswer: { '@type': 'Answer', text: entry.a },
          })),
        }}
      />
      <PageHead title={copy.h1} lead={copy.lead} />
      <section className="section">
        <div className="container">
          <h2>{copy.faqTitle}</h2>
          <div className="faq">
            {copy.faq.map((entry) => (
              <div key={entry.q}>
                <h3>{entry.q}</h3>
                <p>{entry.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      <Contact locale={locale} />
      <NextStep title={copy.nextTitle} text={copy.nextText} action={{ label: copy.nextAction, href: pathFor('search', locale) }} />
    </>
  );
}

const innerPages: Record<InnerPageId, (props: PageProps & { query?: Query }) => React.ReactNode | Promise<React.ReactNode>> = {
  search: SearchPage,
  guestGuide: GuestGuidePage,
  seasonGuide: SeasonGuidePage,
  managerGuide: ManagerGuidePage,
  help: HelpPage,
};

export function InnerPage({ page, locale, query }: PageProps & { page: InnerPageId; query?: Query }) {
  const Content = innerPages[page];
  return (
    <>
      <JsonLd data={breadcrumbData(page, locale)} />
      <Content locale={locale} query={query} />
    </>
  );
}
