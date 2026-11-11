import type { Metadata } from 'next';
import { config, defaultLocale, getDictionary, isLocale } from '@ombre/shared';
import { NotFoundPage } from '@/components/PageShell';
import { rememberedLocale } from '@/lib/locale';
import { privateMetadata } from '@/lib/seo';

// Shown when a page of this language answers "not found": an unknown beach club, an expired link.
// Addresses that match no page at all are sent by the proxy to the page in "pagina-non-trovata".

export async function generateMetadata({ params }: { params?: Promise<{ lang?: string }> }): Promise<Metadata> {
  const lang = (await params)?.lang;
  const locale = lang && isLocale(lang) ? lang : defaultLocale;
  return privateMetadata(locale, getDictionary(locale, config.brandName).notFound.title);
}

export default function NotFound() {
  return <NotFoundPage locale={rememberedLocale()} />;
}
