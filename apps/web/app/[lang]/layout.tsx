import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { notFound } from 'next/navigation';
import { config, htmlLang, isLocale, locales } from '@ombre/shared';
import '@ombre/ui/tokens.css';
import '@ombre/ui/base.css';
import '@ombre/ui/portal.css';

const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], display: 'swap', variable: '--font-jakarta' });

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export const metadata: Metadata = {
  metadataBase: new URL(config.siteUrl),
  applicationName: config.brandName,
  robots: config.indexable ? { index: true, follow: true } : { index: false, follow: false },
};

// `cover` lets the bottom bar of the beach page respect the safe areas of phones.
export const viewport: Viewport = { themeColor: '#ffffff', viewportFit: 'cover' };

export default async function RootLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  return (
    <html lang={htmlLang[lang]} className={jakarta.variable}>
      <body>{children}</body>
    </html>
  );
}
