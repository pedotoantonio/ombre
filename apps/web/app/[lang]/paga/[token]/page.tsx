import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { config, getDictionary, isLocale } from '@ombre/shared';
import { PayView } from '@/components/pay';
import { privateMetadata } from '@/lib/seo';

// The public payment page (spec §4.3). The public addresses are /paga/{token} and
// /en/pay/{token}: next.config.ts rewrites both onto this internal segment, so the
// two languages share one route, like the beach section does. Dynamic by nature —
// every token is checked against the API at request time, never prerendered — and
// `noindex` through privateMetadata, besides the exclusion in robots.txt.

interface Props {
  params: Promise<{ lang: string; token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  return privateMetadata(lang, getDictionary(lang, config.brandName).pay.title);
}

export default async function Page({ params, searchParams }: Props) {
  const { lang, token } = await params;
  if (!isLocale(lang)) notFound();
  return <PayView locale={lang} token={token} query={await searchParams} />;
}
