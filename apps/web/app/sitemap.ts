import type { MetadataRoute } from 'next';
import { config, defaultLocale, htmlLang, locales, pageIds } from '@ombre/shared';
import { pageUrl } from '@/lib/seo';

export default function sitemap(): MetadataRoute.Sitemap {
  if (!config.indexable) return [];

  return pageIds.flatMap((page) => {
    const languages: Record<string, string> = { 'x-default': pageUrl(page, defaultLocale) };
    for (const locale of locales) languages[htmlLang[locale]] = pageUrl(page, locale);
    return locales.map((locale) => ({ url: pageUrl(page, locale), alternates: { languages } }));
  });
}
