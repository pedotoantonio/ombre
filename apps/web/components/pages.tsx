import Link from 'next/link';
import { connection } from 'next/server';
import { beachPath, config, formatMoney, getDictionary, pathFor, type InnerPageId, type Locale } from '@ombre/shared';
import { api, formatDay, isDay, today, type ApiBeachOffer } from '@/lib/api';
import { CoastScene } from '@ombre/ui';
import { breadcrumbData, JsonLd, pageUrl } from '@/lib/seo';
import { Contact, PageHead } from './PageShell';

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

/** Plain form that opens the explore page with the search in the address. It works without scripts. */
function SearchForm({ locale, search }: { locale: Locale; search: ExploreSearch }) {
  const t = getDictionary(locale, config.brandName).search;
  return (
    <form className="portal-search" method="get" action={pathFor('explore', locale)} role="search" aria-label={t.title}>
      <div className="field portal-search__place">
        <label htmlFor="cerca-luogo">{t.place}</label>
        <input id="cerca-luogo" name="place" type="text" maxLength={80} defaultValue={search.place} autoComplete="off" enterKeyHint="search" />
      </div>
      <div className="field">
        <label htmlFor="cerca-giorno">{t.day}</label>
        <input id="cerca-giorno" name="day" type="date" min={today()} defaultValue={search.day ?? ''} />
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

export async function HomePage({ locale }: PageProps) {
  // The search accepts days from today on, so the page is rendered at request time.
  await connection();
  const t = getDictionary(locale, config.brandName);
  const copy = t.pages.home;
  const audienceLinks: readonly InnerPageId[] = ['howItWorks', 'forSeasonHolders', 'forBeachClubs'];

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
          <CoastScene />
        </div>
        <div className="container">
          <div className="portal-hero__panel">
            <h1>{copy.h1}</h1>
            <p className="lead">{copy.lead}</p>
            <SearchForm locale={locale} search={{ place: '', day: null, guests: defaultGuests, sharedOnly: false }} />
            <p className="portal-hero__links">
              <Link href={pathFor('howItWorks', locale)}>{copy.ctaHowItWorks}</Link>
              <Link href={pathFor('forBeachClubs', locale)}>{copy.ctaBeachClubs}</Link>
            </p>
          </div>
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
          <span className="badge badge--demo">{t.booking.demoBadge}</span>
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

  return (
    <>
      <PageHead title={copy.h1} lead={copy.lead} />
      <section className="section portal-explore">
        <div className="container portal-results">
          <div className="portal-search-panel">
            <SearchForm locale={locale} search={search} />
          </div>
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
