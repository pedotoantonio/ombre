import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { config, defaultLocale, getDictionary, isLocale, locales } from '@ombre/shared';
import { PayUnavailable } from '@/components/pay';
import { privateMetadata } from '@/lib/seo';

// The polite page of an unusable payment link, served BY THE PROXY with status 404:
// plain server HTML, readable without scripts (spec §4.3 and §5). The not-found
// boundary of this section cannot do that job — the framework renders boundaries
// only through scripts on dynamic routes — so the proxy rewrites here instead,
// exactly like unknown addresses land on `pagina-non-trovata`. Reached directly,
// this address is rewritten onto itself, still with status 404: one address, one answer.

export function generateStaticParams(): { lang: string }[] {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const locale = isLocale(lang) ? lang : defaultLocale;
  return privateMetadata(locale, getDictionary(locale, config.brandName).pay.unavailableTitle);
}

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return <PayUnavailable locale={lang} />;
}
