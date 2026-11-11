import type { ReactNode } from 'react';
import Link from 'next/link';
import { accountPath, config, getDictionary, locales, pathFor, type InnerPageId, type Locale, type PageId } from '@ombre/shared';
import { Logo } from '@ombre/ui';

const navPages: readonly InnerPageId[] = ['explore', 'howItWorks', 'forBeachClubs', 'forSeasonHolders', 'help'];

export interface Crumb {
  label: string;
  href?: string;
}

interface PageShellProps {
  locale: Locale;
  /** Fixed page this is, or the one whose section it belongs to. */
  page: PageId;
  /** False when the page belongs to no section of the navigation, like the reserved area. */
  highlight?: boolean;
  /** Address of this same page in the other language, when it is not a fixed page. */
  alternatePath?: string;
  /** Trail after the home page, when it is not a fixed page. */
  crumbs?: Crumb[];
  children: ReactNode;
}

export function PageShell({ locale, page, highlight = true, alternatePath, crumbs, children }: PageShellProps) {
  const t = getDictionary(locale, config.brandName);
  const otherLocale = locales.find((candidate) => candidate !== locale) ?? locale;

  return (
    <>
      <a className="skip-link" href="#contenuto">
        {t.nav.skip}
      </a>
      {config.bookingsOpen ? null : <p className="notice">{t.notice.preLaunch}</p>}
      <header className="site-header">
        <div className="container site-header__inner">
          <Link className="brand" href={pathFor('home', locale)} aria-label={`${config.brandName}, ${t.nav.home}`}>
            <Logo />
            <span>{config.brandName}</span>
          </Link>
          <nav className="site-nav" aria-label={t.nav.label}>
            <ul>
              {navPages.map((id) => (
                <li key={id}>
                  <Link href={pathFor(id, locale)} aria-current={highlight && id === page ? 'page' : undefined}>
                    {t.nav[id]}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <Link className="lang-switch" href={alternatePath ?? pathFor(page, otherLocale)} hrefLang={otherLocale} lang={otherLocale}>
            <span className="visually-hidden">{t.nav.languageLabel}: </span>
            {t.nav.switchLanguage}
          </Link>
        </div>
      </header>
      <main id="contenuto">
        {page === 'home' ? null : (
          <nav className="container breadcrumb" aria-label={t.nav.breadcrumb}>
            <ol>
              <li>
                <Link href={pathFor('home', locale)}>{config.brandName}</Link>
              </li>
              {(crumbs ?? [{ label: t.pages[page].h1 }]).map((crumb, index, all) =>
                index === all.length - 1 || !crumb.href ? (
                  <li key={crumb.label} aria-current={index === all.length - 1 ? 'page' : undefined}>
                    {crumb.label}
                  </li>
                ) : (
                  <li key={crumb.label}>
                    <Link href={crumb.href}>{crumb.label}</Link>
                  </li>
                ),
              )}
            </ol>
          </nav>
        )}
        {children}
      </main>
      <footer className="site-footer">
        <div className="container site-footer__grid">
          <div>
            <Link className="brand" href={pathFor('home', locale)} aria-label={`${config.brandName}, ${t.nav.home}`}>
              <Logo pole="#fff8e7" background="#023047" wave="#5bc0d4" />
              <span>{config.brandName}</span>
            </Link>
            <p>{t.footer.tagline}</p>
            <p>{t.footer.status}</p>
          </div>
          <nav aria-label={t.footer.pagesTitle}>
            <h2>{t.footer.pagesTitle}</h2>
            <ul>
              {navPages.map((id) => (
                <li key={id}>
                  <Link href={pathFor(id, locale)}>{t.nav[id]}</Link>
                </li>
              ))}
              <li>
                <Link href={accountPath(locale, 'signIn')}>{t.nav.reservedArea}</Link>
              </li>
            </ul>
          </nav>
        </div>
      </footer>
    </>
  );
}

export function PageHead({ title, lead }: { title: string; lead: string }) {
  return (
    <div className="container page-head">
      <h1>{title}</h1>
      <p className="lead">{lead}</p>
    </div>
  );
}

export function Contact({ locale }: { locale: Locale }) {
  const t = getDictionary(locale, config.brandName).contact;
  return (
    <section className="section">
      <div className="container">
        <h2>{t.title}</h2>
        {config.contactEmail ? (
          <p className="prose">
            {t.withEmail} <a href={`mailto:${config.contactEmail}`}>{config.contactEmail}</a>.
          </p>
        ) : (
          <p className="prose">{t.missing}</p>
        )}
      </div>
    </section>
  );
}
