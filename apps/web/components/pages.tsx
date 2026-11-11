import Link from 'next/link';
import { config, getDictionary, pathFor, type InnerPageId, type Locale } from '@ombre/shared';
import { BeachScene } from '@ombre/ui';
import { breadcrumbData, JsonLd, pageUrl } from '@/lib/seo';
import { Contact, PageHead } from './PageShell';

interface PageProps {
  locale: Locale;
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

export function HomePage({ locale }: PageProps) {
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
      <section className="hero">
        <div className="container hero__grid">
          <div>
            <h1>{copy.h1}</h1>
            <p className="lead">{copy.lead}</p>
            <div className="actions">
              {config.bookingsOpen ? (
                <Link className="button" href={pathFor('explore', locale)}>
                  {copy.ctaExplore}
                </Link>
              ) : (
                <Link className="button" href={pathFor('howItWorks', locale)}>
                  {copy.ctaHowItWorks}
                </Link>
              )}
              <Link className="button button--secondary" href={pathFor('forBeachClubs', locale)}>
                {copy.ctaBeachClubs}
              </Link>
            </div>
          </div>
          <div className="hero__art">
            <BeachScene />
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

function ExplorePage({ locale }: PageProps) {
  const copy = getDictionary(locale, config.brandName).pages.explore;
  return (
    <>
      <PageHead title={copy.h1} lead={copy.lead} />
      <section className="section">
        <div className="container">
          <div className="empty">
            <h2>{copy.emptyTitle}</h2>
            <p>{copy.emptyText}</p>
            <Link className="button button--secondary" href={pathFor('howItWorks', locale)}>
              {copy.emptyLink}
            </Link>
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

const innerPages: Record<InnerPageId, (props: PageProps) => React.ReactNode> = {
  explore: ExplorePage,
  howItWorks: HowItWorksPage,
  forBeachClubs: ForBeachClubsPage,
  forSeasonHolders: ForSeasonHoldersPage,
  help: HelpPage,
};

export function InnerPage({ page, locale }: PageProps & { page: InnerPageId }) {
  const Content = innerPages[page];
  return (
    <>
      <JsonLd data={breadcrumbData(page, locale)} />
      <Content locale={locale} />
    </>
  );
}
