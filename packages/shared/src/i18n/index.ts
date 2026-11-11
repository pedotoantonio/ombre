import { makeEn } from './en';
import { makeIt, type Dictionary } from './it';
import type { Locale } from './routes';

export type { Dictionary } from './it';
export * from './routes';

const builders: Record<Locale, (brand: string) => Dictionary> = { it: makeIt, en: makeEn };

export function getDictionary(locale: Locale, brand: string): Dictionary {
  return builders[locale](brand);
}
