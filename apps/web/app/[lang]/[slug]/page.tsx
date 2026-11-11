import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { innerPageIds, isLocale, locales, pageFromSlug, slugs } from '@ombre/shared';
import { InnerPage } from '@/components/pages';
import { PageShell } from '@/components/PageShell';
import { buildMetadata } from '@/lib/seo';

interface Props {
  params: Promise<{ lang: string; slug: string }>;
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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await resolve(params);
  return found ? buildMetadata(found.page, found.locale) : {};
}

export default async function Page({ params }: Props) {
  const found = await resolve(params);
  if (!found) notFound();

  return (
    <PageShell locale={found.locale} page={found.page}>
      <InnerPage locale={found.locale} page={found.page} />
    </PageShell>
  );
}
