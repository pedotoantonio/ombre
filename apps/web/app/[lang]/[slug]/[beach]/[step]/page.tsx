import type { Metadata } from 'next';
import { cartSegment, isLocale } from '@ombre/shared';
import { accountMetadata, AccountRoute, isAccountSection } from '@/components/account';
import { BookView, stepMetadata } from '@/components/beach';
import { CartPage } from '@/components/cart';

interface Props {
  params: Promise<{ lang: string; slug: string; beach: string; step: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug, beach, step } = await params;
  return isAccountSection(lang, slug) ? accountMetadata(lang, [beach, step]) : stepMetadata(lang, slug, beach, step);
}

export default async function Page({ params, searchParams }: Props) {
  const { lang, slug, beach, step } = await params;
  const query = await searchParams;
  if (isAccountSection(lang, slug)) return <AccountRoute locale={lang} segments={[beach, step]} query={query} />;
  // The cart of the beach club (D46), next to the «prenota» summary of the quick path.
  if (isLocale(lang) && step === cartSegment[lang]) return <CartPage lang={lang} section={slug} slug={beach} step={step} query={query} />;
  return <BookView lang={lang} section={slug} slug={beach} step={step} query={query} />;
}
