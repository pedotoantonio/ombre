import type { ReactNode } from 'react';
import Link from 'next/link';
import { accountPath, config, getDictionary, locales, pathFor, type InnerPageId, type Locale, type PageId } from '@ombre/shared';
import { Logo, LogoLockup } from '@ombre/ui';
import { crumbLabel } from '@/lib/seo';

/* The five entries of D41, in the committed order: search, then one guide per role, then help. */
const navPages: readonly InnerPageId[] = ['search', 'guestGuide', 'seasonGuide', 'managerGuide', 'help'];

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
  /** Name of the signed-in person, on reserved pages only: public pages never read the session. */
  signedInAs?: string;
  children: ReactNode;
}

/** Who is signed in and the way out, at the top of every reserved page. */
function AccountBar({ locale, name }: { locale: Locale; name: string }) {
  const t = getDictionary(locale, config.brandName).account;
  return (
    <div className="account-bar" role="region" aria-label={t.barLabel}>
      <div className="container account-bar__inner">
        <p className="account-bar__who">
          {t.signedInAs} <strong>{name}</strong>
        </p>
        <form method="post" action="/azioni/uscita" className="inline-form">
          <input type="hidden" name="lang" value={locale} />
          <button className="button button--secondary button--small" type="submit">
            {t.signOut}
          </button>
        </form>
      </div>
    </div>
  );
}

function Notice({ locale }: { locale: Locale }) {
  const t = getDictionary(locale, config.brandName).notice;
  if (config.demoMode) return <p className="notice notice--demo">{t.demo}</p>;
  return config.bookingsOpen ? null : <p className="notice">{t.preLaunch}</p>;
}

export function PageShell({ locale, page, highlight = true, alternatePath, crumbs, signedInAs, children }: PageShellProps) {
  const t = getDictionary(locale, config.brandName);
  const otherLocale = locales.find((candidate) => candidate !== locale) ?? locale;

  return (
    <>
      <a className="skip-link" href="#contenuto">
        {t.nav.skip}
      </a>
      <Notice locale={locale} />
      <header className="site-header">
        <div className="container site-header__inner">
          <Link className="brand" href={pathFor('home', locale)} aria-label={`${config.brandName}, ${t.nav.home}`}>
            {config.brandHasWordmark ? (
              <LogoLockup label={config.brandName} />
            ) : (
              <>
                <Logo />
                <span>{config.brandName}</span>
              </>
            )}
          </Link>
          <nav className="site-nav" aria-label={t.nav.label}>
            <ul>
              {navPages.map((id) => (
                <li key={id}>
                  <Link href={pathFor(id, locale)} aria-current={highlight && id === page ? 'page' : undefined}>
                    {id === 'search' ? (
                      <span className="site-nav__mark" aria-hidden="true">
                        ⛱️
                      </span>
                    ) : null}
                    {t.nav[id]}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="site-header__tools">
            <Link className="lang-switch" href={alternatePath ?? pathFor(page, otherLocale)} hrefLang={otherLocale} lang={otherLocale}>
              <span className="visually-hidden">{t.nav.languageLabel}: </span>
              {t.nav.switchLanguage}
            </Link>
            <Link className="account-link" href={accountPath(locale, 'signIn')}>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c0-3.6 3.6-6 8-6s8 2.4 8 6" />
              </svg>
              <span className="account-link__label">{t.nav.reservedArea}</span>
            </Link>
          </div>
        </div>
      </header>
      {signedInAs ? <AccountBar locale={locale} name={signedInAs} /> : null}
      <main id="contenuto">
        {page === 'home' ? null : (
          <nav className="container breadcrumb" aria-label={t.nav.breadcrumb}>
            <ol>
              <li>
                <Link href={pathFor('home', locale)}>{config.brandName}</Link>
              </li>
              {(crumbs ?? [{ label: crumbLabel(page, locale) }]).map((crumb, index, all) =>
                index === all.length - 1 || !crumb.href ? (
                  <li key={crumb.label} aria-current={index === all.length - 1 ? 'page' : undefined}>
                    <span className="breadcrumb__label">{crumb.label}</span>
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
              {config.brandHasWordmark ? (
                <LogoLockup tone="onDark" label={config.brandName} />
              ) : (
                <>
                  <Logo tone="onDark" />
                  <span>{config.brandName}</span>
                </>
              )}
            </Link>
            <p className="site-footer__tagline">{t.footer.tagline}</p>
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
        <div className="container site-footer__note">
          <p>{t.footer.status}</p>
          {/* Niente profilazione (D54): la riga è l'impegno, nessun banner serve. */}
          <p className="site-footer__privacy">{t.footer.privacy}</p>
        </div>
      </footer>
    </>
  );
}

export function PageHead({ title, lead, children }: { title: string; lead: string; children?: ReactNode }) {
  return (
    <div className="container page-head">
      <h1>{title}</h1>
      <p className="lead">{lead}</p>
      {children}
    </div>
  );
}

/** The page shown for an unknown address, in the normal shell. */
export function NotFoundPage({ locale }: { locale: Locale }) {
  const t = getDictionary(locale, config.brandName);
  const other = locales.find((candidate) => candidate !== locale) ?? locale;
  return (
    <PageShell locale={locale} page="help" highlight={false} alternatePath={pathFor('home', other)} crumbs={[{ label: t.notFound.title }]}>
      <PageHead title={t.notFound.title} lead={t.notFound.lead}>
        <p className="actions">
          <Link className="button" href={pathFor('home', locale)}>
            {t.notFound.home}
          </Link>
          <Link className="button button--secondary" href={pathFor('search', locale)}>
            {t.notFound.search}
          </Link>
        </p>
      </PageHead>
    </PageShell>
  );
}

/** Closing block of an editorial page: one main action, at most one secondary link. */
export function NextStep({ title, text, action, secondary }: { title: string; text: string; action: Crumb & { href: string }; secondary?: Crumb & { href: string } }) {
  return (
    <section className="section">
      <div className="container">
        <div className="next-step">
          <h2>{title}</h2>
          <p>{text}</p>
          <p className="actions">
            <Link className="button" href={action.href}>
              {action.label}
            </Link>
            {secondary ? (
              <Link className="button button--secondary" href={secondary.href}>
                {secondary.label}
              </Link>
            ) : null}
          </p>
        </div>
      </div>
    </section>
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
