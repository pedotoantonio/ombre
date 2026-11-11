import { bookingSegment, isLocale } from '@ombre/shared';
import { HoldView, privateMetadata } from '@/components/beach';
import { BookingView } from '@/components/booking';

interface Props {
  params: Promise<{ lang: string; slug: string; beach: string; step: string; hold: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const metadata = privateMetadata;

export default async function Page({ params, searchParams }: Props) {
  const { lang, slug, beach, step, hold } = await params;
  if (isLocale(lang) && step === bookingSegment[lang]) {
    const token = (await searchParams).t;
    return <BookingView lang={lang} section={slug} slug={beach} step={step} bookingId={hold} token={Array.isArray(token) ? token[0] : token} />;
  }
  return <HoldView lang={lang} section={slug} slug={beach} step={step} holdId={hold} />;
}
