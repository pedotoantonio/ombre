import type { Metadata } from 'next';
import { bookingSegment, isLocale } from '@ombre/shared';
import { HoldView, stepMetadata } from '@/components/beach';
import { BookingView } from '@/components/booking';

interface Props {
  params: Promise<{ lang: string; slug: string; beach: string; step: string; hold: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug, beach, step } = await params;
  return stepMetadata(lang, slug, beach, step);
}

export default async function Page({ params, searchParams }: Props) {
  const { lang, slug, beach, step, hold } = await params;
  if (isLocale(lang) && step === bookingSegment[lang]) {
    const token = (await searchParams).t;
    return <BookingView lang={lang} section={slug} slug={beach} step={step} bookingId={hold} token={Array.isArray(token) ? token[0] : token} />;
  }
  return <HoldView lang={lang} section={slug} slug={beach} step={step} holdId={hold} />;
}
