import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { innerPageIds, isLocale, locales, pageFromSlug, pathFor, slugs } from '@ombre/shared';
import { otherLocale } from '@/components/beach';
import { InnerPage, readSearch, searchQuery } from '@/components/pages';
import { PageShell } from '@/components/PageShell';
import { buildMetadata } from '@/lib/seo';

interface Props {
  params: Promise<{ lang: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return locales.flatMap((lang) => innerPageIds.map((id) => ({ lang, slug: slugs[id][lang] })));
}

async function resolve(params: Props['params']) {
  const { lang, slug } = await params;
  if (!isLocale(lang)) return null;
  const page = pageFromSlug(lang, slug);
  return page ? { locale: lang, page } : null;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const found = await resolve(params);
  if (!found) return {};
  const metadata = buildMetadata(found.page, found.locale);
  // A search is one view of the same list: it is not indexed, and its canonical stays the plain address.
  // The manager page with a query is a form outcome (D71): same rule, the plain address stays canonical.
  if ((found.page === 'search' || found.page === 'managerGuide') && Object.keys(await searchParams).length > 0) return { ...metadata, robots: { index: false, follow: true } };
  return metadata;
}

export default async function Page({ params, searchParams }: Props) {
  const found = await resolve(params);
  if (!found) notFound();
  // Only the search and the manager page read the address (errors e conferma del
  // modulo di richiamata, D71): the others stay prerendered.
  const query = found.page === 'search' || found.page === 'managerGuide' ? await searchParams : {};
  const search = searchQuery(readSearch(query));

  return (
    <PageShell locale={found.locale} page={found.page} alternatePath={search ? pathFor(found.page, otherLocale(found.locale)) + search : undefined}>
      <InnerPage locale={found.locale} page={found.page} query={query} />
    </PageShell>
  );
}
