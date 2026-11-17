import { describe, expect, it } from 'vitest';
import { getDictionary, locales } from '../src/index';

/**
 * The three role names and nothing else (spec §5, D42): everywhere the public reads a role
 * it is «Ospite», «Stagionale» or «Gestore stabilimento» (Guest, Season holder, Beach
 * manager). The old formulas must never come back into the dictionaries. The list below
 * is the census of the names banished on 17/11/2026; matches ignore case.
 */
const forbidden: Record<(typeof locales)[number], readonly string[]> = {
  it: [
    // The old audience pages and navigation entries.
    'per gli stabilimenti',
    'per gli stagionali',
    // «Condividi giornate» as a label of the season holder's role or entry. The feature
    // itself keeps its own name, «giornate condivise», which these strings do not match.
    'condividi giornate',
    'condividi le giornate',
    // The old home tile of the management area.
    'area gestore',
  ],
  en: [
    'for beach clubs',
    'for season holders',
    // "Share days" as a role label; the feature name "shared days" does not match these.
    'share days',
    'share your days',
    // The old home tile; "management area" is fine and does not match.
    'manager area',
  ],
};

/** Every string of the dictionary, functions excluded: those are covered by the smoke suite. */
function strings(value: unknown, path: string): { path: string; text: string }[] {
  if (typeof value === 'string') return [{ path, text: value }];
  if (Array.isArray(value)) return value.flatMap((inner, index) => strings(inner, `${path}[${index}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, inner]) => strings(inner, path ? `${path}.${key}` : key));
  }
  return [];
}

describe('the three role names (D42)', () => {
  for (const locale of locales) {
    it(`keep every banished formula out of the ${locale} dictionary`, () => {
      const texts = strings(getDictionary(locale, 'Marchio'), '');
      for (const formula of forbidden[locale]) {
        const offenders = texts.filter((entry) => entry.text.toLowerCase().includes(formula));
        expect(offenders, `«${formula}» found in: ${offenders.map((entry) => entry.path).join(', ')}`).toEqual([]);
      }
    });
  }

  it('write the role names in the labels that present the roles', () => {
    const it_ = getDictionary('it', 'Marchio');
    const en = getDictionary('en', 'Marchio');
    expect(it_.account.roles.manager).toBe('Gestore stabilimento');
    expect(en.account.roles.manager).toBe('Beach manager');
    expect(it_.pages.home.audiences.map((audience) => audience.title)).toEqual(['Ospite', 'Stagionale', 'Gestore stabilimento']);
    expect(en.pages.home.audiences.map((audience) => audience.title)).toEqual(['Guest', 'Season holder', 'Beach manager']);
  });
});
