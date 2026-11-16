import { spotZones, type SpotZone } from './layout';

/**
 * What the "suggested spot" heuristic needs to know about a sellable spot. Both the
 * public availability and the front-desk inventory expose exactly these fields, so
 * the two channels always reach the same suggestion.
 */
export interface SuggestableSpot {
  spotId: string;
  /** People who fit under the spot. */
  maxGuests: number;
  /** Price the guest would really pay for the day. */
  priceCents: number;
  zone: SpotZone;
  rowNumber: number;
  col: number;
}

/**
 * Total order of the suggestion (spec §3.3): smaller capacity surplus first (do not
 * waste a large spot), then lower price, then the zone closest to the sea
 * (riva, ombrelloni, monte), then the lower row, then the lower column.
 * Deterministic and documented: no AI, no randomness, no data touched.
 */
export function compareSuggestable(a: SuggestableSpot, b: SuggestableSpot): number {
  // Among spots that fit the same party, the smaller surplus is the smaller capacity.
  return (
    a.maxGuests - b.maxGuests ||
    a.priceCents - b.priceCents ||
    spotZones.indexOf(a.zone) - spotZones.indexOf(b.zone) ||
    a.rowNumber - b.rowNumber ||
    a.col - b.col
  );
}

/**
 * The best spot for a day and a party, among those that are free and fit the guests.
 * Pure function with a total order: the same input always gives the same suggestion,
 * whatever the order of the list. Null when nothing fits.
 */
export function suggestSpot<T extends SuggestableSpot>(spots: readonly T[], guests: number): T | null {
  if (!Number.isInteger(guests) || guests < 1) throw new RangeError('guests must be a positive integer');
  let best: T | null = null;
  for (const candidate of spots) {
    if (candidate.maxGuests < guests) continue;
    if (!best || compareSuggestable(candidate, best) < 0) best = candidate;
  }
  return best;
}
