import type { Metadata } from 'next';
import {
  absoluteUrl,
  config,
  defaultLocale,
  getDictionary,
  htmlLang,
  locales,
  ogLocale,
  pathFor,
  type Locale,
  type PageId,
} from '@ombre/shared';

export function pageUrl(page: PageId, locale: Locale): string {
  return absoluteUrl(config.siteUrl, pathFor(page, locale));
}

export function buildMetadata(page: PageId, locale: Locale): Metadata {
  const copy = getDictionary(locale, config.brandName).pages[page];
  const languages: Record<string, string> = { 'x-default': pageUrl(page, defaultLocale) };
  for (const other of locales) languages[htmlLang[other]] = pageUrl(page, other);

  return {
    title: copy.title,
    description: copy.description,
    alternates: { canonical: pageUrl(page, locale), languages },
    openGraph: {
      type: 'website',
      title: copy.title,
      description: copy.description,
      url: pageUrl(page, locale),
      siteName: config.brandName,
      locale: ogLocale[locale],
    },
  };
}

/** Label of a fixed page in the breadcrumb. Explore keeps the name it has in the navigation. */
export function crumbLabel(page: Exclude<PageId, 'home'>, locale: Locale): string {
  const dictionary = getDictionary(locale, config.brandName);
  return page === 'explore' ? dictionary.nav.explore : dictionary.pages[page].h1;
}

/**
 * Metadata of a page that is never indexed: reserved area, summary, hold, booking.
 * With a beach club the title is "<page> · <club> | <brand>", otherwise "<page> | <brand>".
 */
export function privateMetadata(locale: Locale, page: string, options: { club?: string; follow?: boolean } = {}): Metadata {
  const t = getDictionary(locale, config.brandName).meta;
  return {
    title: options.club ? t.beachPageTitle(page, options.club) : t.pageTitle(page),
    robots: { index: false, follow: options.follow ?? false },
  };
}

/** Structured data. It must only repeat what the page shows. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  const json = JSON.stringify({ '@context': 'https://schema.org', ...data }).replace(/</g, '\\u003c');
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

export function breadcrumbData(page: Exclude<PageId, 'home'>, locale: Locale): Record<string, unknown> {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: config.brandName, item: pageUrl('home', locale) },
      { '@type': 'ListItem', position: 2, name: crumbLabel(page, locale), item: pageUrl(page, locale) },
    ],
  };
}
