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

/** Structured data. It must only repeat what the page shows. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  const json = JSON.stringify({ '@context': 'https://schema.org', ...data }).replace(/</g, '\\u003c');
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

export function breadcrumbData(page: Exclude<PageId, 'home'>, locale: Locale): Record<string, unknown> {
  const dictionary = getDictionary(locale, config.brandName);
  return {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: config.brandName, item: pageUrl('home', locale) },
      { '@type': 'ListItem', position: 2, name: dictionary.pages[page].h1, item: pageUrl(page, locale) },
    ],
  };
}
