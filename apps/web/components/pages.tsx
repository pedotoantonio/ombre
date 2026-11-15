import Link from 'next/link';
import { connection } from 'next/server';
import { beachPath, config, formatMoney, getDictionary, pathFor, type InnerPageId, type Locale } from '@ombre/shared';
import { api, formatDay, isDay, today, type ApiBeachOffer } from '@/lib/api';
import { FeatureIcon, type FeatureIconName } from '@ombre/ui';
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
  guests: number;
  sharedOnly: boolean;
}

/** Reads a search from the address. What is not valid is left out, never refused. */
export function readSearch(query: Query): ExploreSearch {
  const day = first(query.day);
  const guests = Number(first(query.guests));
  return {
    place: (first(query.place) ?? '').trim().slice(0, 80),
    day: isDay(day) ? day : null,
    guests: Number.isInteger(guests) && guests >= 1 && guests <= maxGuests ? guests : defaultGuests,
    sharedOnly: first(query.shared) === '1',
  };
}

/** The search as it is written in the address. Empty when nothing was asked. */
export function searchQuery(search: ExploreSearch): string {
  const query = new URLSearchParams();
  if (search.place) query.set('place', search.place);
  if (search.day) query.set('day', search.day);
  if (search.day || search.guests !== defaultGuests) query.set('guests', String(search.guests));
  if (search.sharedOnly) query.set('shared', '1');
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
function mapLabels(locale: Locale, where: 'home' | 'explore'): MapLabels {
  const t = getDictionary(locale, config.brandName).map;
  return {
    invite: where === 'home' ? t.inviteExplore : t.inviteList,
    inviteCta: where === 'home' ? t.goExplore : t.goList,
    inviteHref: where === 'home' ? pathFor('explore', locale) : `#${resultsAnchor}`,
    unavailable: t.unavailable,
    region: t.region,
    open: t.open,
    zoomIn: t.zoomIn,
    zoomOut: t.zoomOut,
  };
}

/** Plain form that opens the explore page with the search in the address. It works without scripts. */
function SearchForm({ locale, search, minDay }: { locale: Locale; search: ExploreSearch; minDay?: string }) {
  const t = getDictionary(locale, config.brandName).search;
  return (
    <form className="portal-search" method="get" action={`${pathFor('explore', locale)}#${resultsAnchor}`} role="search" aria-label={t.title}>
      <div className="field portal-search__place">
        <label htmlFor="cerca-luogo">{t.place}</label>
        <input id="cerca-luogo" name="place" type="text" maxLength={80} defaultValue={search.place} autoComplete="off" enterKeyHint="search" />
      </div>
      <div className="field">
        <label htmlFor="cerca-giorno">{t.day}</label>
        <input id="cerca-giorno" name="day" type="date" min={minDay} defaultValue={search.day ?? ''} />
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
      <button className="button portal-search__submit" type="submit">
        {t.submit}
      </button>
    </form>
  );
}

export function HomePage({ locale }: PageProps) {
  const t = getDictionary(locale, config.brandName);
  const copy = t.pages.home;
  const audienceLinks: readonly InnerPageId[] = ['howItWorks', 'forSeasonHolders', 'forBeachClubs'];
  const featureLinks: readonly { icon: FeatureIconName; page: InnerPageId }[] = [
    { icon: 'search', page: 'explore' },
    { icon: 'map', page: 'howItWorks' },
    { icon: 'pass', page: 'howItWorks' },
    { icon: 'share', page: 'forSeasonHolders' },
    { icon: 'manager', page: 'forBeachClubs' },
  ];


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
            <SearchForm locale={locale} search={{ place: '', day: null, guests: defaultGuests, sharedOnly: false }} />
            {/* The list way in comes before the map box in the reading order: search form, then Explore. */}
            <p className="portal-hero__links">
              <Link href={pathFor('explore', locale)}>{t.nav.explore}</Link>
              <Link href={pathFor('howItWorks', locale)}>{copy.ctaHowItWorks}</Link>
              <Link href={pathFor('forBeachClubs', locale)}>{copy.ctaBeachClubs}</Link>
            </p>
          </div>
        </div>
      </section>
      <section className="section portal-map-section" aria-labelledby="mappa-titolo">
        <div className="container">
          <h2 id="mappa-titolo">{t.map.homeTitle}</h2>
          <p className="portal-map-lead">{t.map.homeLead}</p>
          {/* The page is prerendered: the pins arrive later, from an internal route of this site. */}
          <MapPanel sourceUrl={`/dati/mappa?lang=${locale}`} labels={mapLabels(locale, 'home')} />
        </div>
      </section>
      <section className="section">
        <div className="container">
          <h2>{copy.featuresTitle}</h2>
          <ul className="portal-features">
            {copy.features.map((feature, index) => (
              <li key={feature.title}>
                <Link className="portal-feature" href={pathFor(featureLinks[index]?.page ?? 'explore', locale)}>
                  <span className="portal-feature__icon">
                    <FeatureIcon name={featureLinks[index]?.icon ?? 'search'} />
                  </span>
                  <span className="portal-feature__title">{feature.title}</span>
                  <span className="portal-feature__text">{feature.text}</span>
                </Link>
              </li>
            ))}
          </ul>
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
                <Link className="card__link" href={pathFor(audienceLinks[index] ?? 'howItWorks', locale)}>
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

function BeachCard({ locale, beach, day }: { locale: Locale; beach: ApiBeachOffer; day: string | null }) {
  const t = getDictionary(locale, config.brandName);
  const copy = t.pages.explore;
  return (
    <li className="card portal-club">
      {beach.cover ? (
        <img className="portal-club__cover" src={beach.cover.src} alt={beach.cover.alt[locale] ?? ''} width={1200} height={800} loading="lazy" />
      ) : (
        <div className="portal-club__cover portal-club__cover--empty" aria-hidden="true" />
      )}
      <h3>{beach.name}</h3>
      <p>{beach.locality}</p>
      {day && beach.freeSpots ? (
        <p className="portal-club__offer">
          <span className="portal-club__free">{copy.freeSpots(beach.freeSpots)}</span>
          {typeof beach.priceFromCents === 'number' ? (
            <span className="portal-club__price">
              {copy.priceFrom(formatMoney(beach.priceFromCents, locale))}
              <span className="portal-club__price-note">{copy.priceNote}</span>
            </span>
          ) : null}
        </p>
      ) : null}
      {beach.demo ? (
        <p>
          <span className="badge badge--demo">{t.booking.demoBadgeShort}</span>
        </p>
      ) : null}
      <Link className="card__link" href={`${beachPath(locale, beach.slug)}${day ? `?day=${day}` : ''}`}>
        {copy.viewBeach}
        <span className="visually-hidden">: {beach.name}</span>
      </Link>
    </li>
  );
}

async function ExplorePage({ locale, query = {} }: PageProps & { query?: Query }) {
  // The list comes from the API at request time: this page is never prerendered.
  await connection();
  const t = getDictionary(locale, config.brandName);
  const copy = t.pages.explore;
  const asked = readSearch(query);
  const dayPast = asked.day !== null && asked.day < today();
  const search = { ...asked, day: dayPast ? null : asked.day };
  const result = await api.beaches({ locality: search.place || undefined, day: search.day ?? undefined, guests: search.guests, sharedOnly: search.sharedOnly });
  const beaches = result.ok ? result.data.beaches : [];
  // With a day, a beach club is a result only if it has something to sell for this search.
  const open = search.day ? beaches.filter((beach) => (beach.freeSpots ?? 0) > 0) : beaches;
  const full = search.day ? beaches.filter((beach) => (beach.freeSpots ?? 0) === 0) : [];
  const notes = search.day ? [copy.resultsFor(search.guests), ...(search.sharedOnly ? [copy.sharedOnlyNote] : [])] : [copy.needDay];
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
            href: `${beachPath(locale, beach.slug)}${search.day ? `?day=${search.day}` : ''}`,
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
            {!result.ok ? (
              <div className="empty">
                <h2>{copy.unavailableTitle}</h2>
                <p>{copy.unavailableText}</p>
              </div>
            ) : beaches.length === 0 && !search.place ? (
              <div className="empty">
                <h2>{copy.emptyTitle}</h2>
                <p>{copy.emptyText}</p>
                <Link className="button button--secondary" href={pathFor('howItWorks', locale)}>
                  {copy.emptyLink}
                </Link>
              </div>
            ) : beaches.length === 0 ? (
              <div className="empty">
                <h2>{copy.noMatchTitle}</h2>
                <p>{copy.noMatchText(search.place)}</p>
                <Link className="button button--secondary" href={pathFor('explore', locale)}>
                  {copy.showAll}
                </Link>
              </div>
            ) : (
              <>
                {markers.length > 0 ? (
                  <div className="portal-map-block" aria-labelledby="mappa-risultati">
                    <h2 id="mappa-risultati">{t.map.exploreTitle}</h2>
                    <p className="portal-map-lead">{t.map.exploreLead}</p>
                    <MapPanel markers={markers} labels={mapLabels(locale, 'explore')} />
                  </div>
                ) : null}
                <div className="portal-results__head">
                  <h2>{search.day ? copy.resultsTitle(formatDay(search.day, locale)) : copy.listTitle}</h2>
                  <p>{notes.join(' ')}</p>
                </div>
                {open.length === 0 ? (
                  <div className="empty">
                    <h3>{copy.noFreeTitle}</h3>
                    <p>{copy.noFreeText}</p>
                    <Link className="button button--secondary" href={pathFor('explore', locale)}>
                      {copy.showAll}
                    </Link>
                  </div>
                ) : (
                  <ul className="cards">
                    {open.map((beach) => (
                      <BeachCard key={beach.slug} locale={locale} beach={beach} day={search.day} />
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

function HowItWorksPage({ locale }: PageProps) {
  const copy = getDictionary(locale, config.brandName).pages.howItWorks;
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
      <NextStep title={copy.nextTitle} text={copy.nextText} action={{ label: copy.nextAction, href: pathFor('explore', locale) }} />
    </>
  );
}

function ForBeachClubsPage({ locale }: PageProps) {
  const copy = getDictionary(locale, config.brandName).pages.forBeachClubs;
  return (
    <>
      <PageHead title={copy.h1} lead={copy.lead} />
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
        action={{ label: copy.nextAction, href: pathFor('explore', locale) }}
        secondary={{ label: copy.nextSecondary, href: pathFor('howItWorks', locale) }}
      />
    </>
  );
}

function ForSeasonHoldersPage({ locale }: PageProps) {
  const copy = getDictionary(locale, config.brandName).pages.forSeasonHolders;
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
      <NextStep title={copy.nextTitle} text={copy.nextText} action={{ label: copy.nextAction, href: pathFor('explore', locale) }} />
    </>
  );
}

const innerPages: Record<InnerPageId, (props: PageProps & { query?: Query }) => React.ReactNode | Promise<React.ReactNode>> = {
  explore: ExplorePage,
  howItWorks: HowItWorksPage,
  forBeachClubs: ForBeachClubsPage,
  forSeasonHolders: ForSeasonHoldersPage,
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
