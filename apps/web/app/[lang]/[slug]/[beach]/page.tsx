import type { Metadata } from 'next';
import { beachMetadata, BeachView } from '@/components/beach';

interface Props {
  params: Promise<{ lang: string; slug: string; beach: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug, beach } = await params;
  return beachMetadata(lang, slug, beach);
}

export default async function Page({ params, searchParams }: Props) {
  const { lang, slug, beach } = await params;
  return <BeachView lang={lang} section={slug} slug={beach} query={await searchParams} />;
}
