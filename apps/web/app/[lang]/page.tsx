import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isLocale } from '@ombre/shared';
import { HomePage } from '@/components/pages';
import { PageShell } from '@/components/PageShell';
import { buildMetadata } from '@/lib/seo';

// The home reads the clubs from the API for the map and its list fallback (D69):
// rendered per request, never prerendered with stale (or missing) pins baked in.
export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ lang: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  return isLocale(lang) ? buildMetadata('home', lang) : {};
}

export default async function Page({ params }: Props) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  return (
    <PageShell locale={lang} page="home">
      <HomePage locale={lang} />
    </PageShell>
  );
}
