import { cache } from 'react';
import { defaultLocale, type Locale } from '@ombre/shared';

// The not-found page receives no parameters. The layout, which does, leaves the language of the
// address here for it. The holder lives for one request: nothing is shared between visitors.
const holder = cache((): { locale: Locale } => ({ locale: defaultLocale }));

export function rememberLocale(locale: Locale): void {
  holder().locale = locale;
}

export function rememberedLocale(): Locale {
  return holder().locale;
}
