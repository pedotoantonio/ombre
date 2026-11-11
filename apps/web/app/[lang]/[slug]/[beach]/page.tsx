import type { Metadata } from 'next';
import { AccountRoute, isAccountSection } from '@/components/account';
import { beachMetadata, BeachView, privateMetadata } from '@/components/beach';

interface Props {
  params: Promise<{ lang: string; slug: string; beach: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { lang, slug, beach } = await params;
  return isAccountSection(lang, slug) ? { ...privateMetadata, robots: { index: false, follow: false } } : beachMetadata(lang, slug, beach, await searchParams);
}

export default async function Page({ params, searchParams }: Props) {
  const { lang, slug, beach } = await params;
  const query = await searchParams;
  if (isAccountSection(lang, slug)) return <AccountRoute locale={lang} segments={[beach]} query={query} />;
  return <BeachView lang={lang} section={slug} slug={beach} query={query} />;
}
