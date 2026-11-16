import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { config, getDictionary, isLocale } from '@ombre/shared';
import { loadPayRequest, PayView } from '@/components/pay';
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
  const query = await searchParams;
  const outcome = query.esito;
  // The request is read HERE, before any JSX: an unusable token answers notFound()
  // while the document can still be rendered on the server, so the polite page
  // reaches the visitor as plain HTML, scripts or not (spec §4.3 and §5). The
  // confirmation after a successful payment needs no request: by then the link is dead.
  const data = outcome === 'ok' ? null : await loadPayRequest(token);
  if (outcome !== 'ok' && !data) notFound();
  return <PayView locale={lang} token={token} query={query} data={data} />;
}
