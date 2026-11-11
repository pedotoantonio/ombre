import type { Locale } from '../i18n/routes';

/** Amounts are always whole euro cents. */
export type Cents = number;

export function assertCents(value: number, label = 'amount'): asserts value is Cents {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${label} must be a whole number of cents`);
}

const numberLocale: Record<Locale, string> = { it: 'it-IT', en: 'en-GB' };

export function formatMoney(cents: Cents, locale: Locale): string {
  assertCents(cents);
  return new Intl.NumberFormat(numberLocale[locale], { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

/** Reads an amount typed by a person, such as "30", "30,50" or "30.5", as whole cents. */
export function parseEuro(text: string): Cents | null {
  const match = /^(\d{1,6})(?:[.,](\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  return Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
}
