import type { Metadata } from 'next';
import { bookingSegment, isLocale } from '@ombre/shared';
import { accountMetadata, AccountRoute, isAccountSection } from '@/components/account';
import { HoldView, stepMetadata } from '@/components/beach';
import { BookingView } from '@/components/booking';

interface Props {
  params: Promise<{ lang: string; slug: string; beach: string; step: string; hold: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug, beach, step, hold } = await params;
  if (isAccountSection(lang, slug)) return accountMetadata(lang, [beach, step, hold]);
  return stepMetadata(lang, slug, beach, step);
}

export default async function Page({ params, searchParams }: Props) {
  const { lang, slug, beach, step, hold } = await params;
  const query = await searchParams;
  if (isAccountSection(lang, slug)) return <AccountRoute locale={lang} segments={[beach, step, hold]} query={query} />;
  if (isLocale(lang) && step === bookingSegment[lang]) {
    const token = query.t;
    return <BookingView lang={lang} section={slug} slug={beach} step={step} bookingId={hold} token={Array.isArray(token) ? token[0] : token} />;
  }
  return <HoldView lang={lang} section={slug} slug={beach} step={step} holdId={hold} />;
}
