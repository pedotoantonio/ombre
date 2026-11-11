import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { config, getDictionary, isLocale } from '@ombre/shared';
import { NotFoundPage } from '@/components/PageShell';
import { privateMetadata } from '@/lib/seo';

// The page served, with status 404, for every address that matches no page (see proxy.ts).
// It is rendered on the server like any other page, so it reads without scripts.

interface Props {
  params: Promise<{ lang: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  return isLocale(lang) ? privateMetadata(lang, getDictionary(lang, config.brandName).notFound.title) : {};
}

export default async function Page({ params }: Props) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return <NotFoundPage locale={lang} />;
}
