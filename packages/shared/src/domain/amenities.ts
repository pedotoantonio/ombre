/**
 * The fixed, translatable catalogue of beach club amenities (D49). The stable
 * identifiers live here and in the CHECK of beach_amenity (migration 021): the
 * two lists must change together. The labels live ONLY in the it/en dictionaries
 * (`amenities`), never in the database.
 */
export const beachAmenities = [
  'bar',
  'restaurant',
  'parking',
  'hot_showers',
  'playground',
  'accessible',
  'pets',
  'wifi',
  'lifeguard',
  'cabins',
  'sunset_bar',
  'card_payments',
] as const;

export type BeachAmenity = (typeof beachAmenities)[number];

export function isBeachAmenity(value: string): value is BeachAmenity {
  return (beachAmenities as readonly string[]).includes(value);
}
