import type { Metadata } from 'next';
import { config, defaultLocale, getDictionary, isLocale } from '@ombre/shared';
import { PayUnavailable } from '@/components/pay';
import { rememberedLocale } from '@/lib/locale';
import { privateMetadata } from '@/lib/seo';

// Any unusable token — unknown, expired, cancelled, already paid — lands here with
// status 404: the same polite message for every case, revealing nothing (spec §4.3).

export async function generateMetadata({ params }: { params?: Promise<{ lang?: string }> }): Promise<Metadata> {
  const lang = (await params)?.lang;
  const locale = lang && isLocale(lang) ? lang : defaultLocale;
  return privateMetadata(locale, getDictionary(locale, config.brandName).pay.unavailableTitle);
}

export default function NotFound() {
  return <PayUnavailable locale={rememberedLocale()} />;
}
