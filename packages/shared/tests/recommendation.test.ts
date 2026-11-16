import { describe, expect, it } from 'vitest';
import { suggestSpot, type SuggestableSpot } from '../src/index';

let counter = 0;
function spot(partial: Partial<SuggestableSpot>): SuggestableSpot {
  counter += 1;
  return { spotId: partial.spotId ?? `spot-${counter}`, maxGuests: 2, priceCents: 3000, zone: 'ombrelloni', rowNumber: 1, col: counter, ...partial };
}

describe('suggested spot heuristic (spec §3.3)', () => {
  it('ignores spots that do not fit the party and gives null when nothing fits', () => {
    const spots = [spot({ spotId: 'small', maxGuests: 2 }), spot({ spotId: 'big', maxGuests: 4 })];
    expect(suggestSpot(spots, 3)?.spotId).toBe('big');
    expect(suggestSpot(spots, 5)).toBeNull();
    expect(suggestSpot([], 2)).toBeNull();
  });

  it('prefers the smallest capacity surplus even over a lower price', () => {
    const exact = spot({ spotId: 'exact', maxGuests: 2, priceCents: 5000 });
    const cheapButLarge = spot({ spotId: 'large', maxGuests: 6, priceCents: 1000 });
    expect(suggestSpot([cheapButLarge, exact], 2)?.spotId).toBe('exact');
    // With a bigger party, only the large one fits.
    expect(suggestSpot([cheapButLarge, exact], 4)?.spotId).toBe('large');
  });

  it('breaks a surplus tie on the price, before any position', () => {
    const cheapFar = spot({ spotId: 'cheap-far', priceCents: 2000, zone: 'monte', rowNumber: 9, col: 9 });
    const dearShore = spot({ spotId: 'dear-shore', priceCents: 3000, zone: 'riva', rowNumber: 1, col: 1 });
    expect(suggestSpot([dearShore, cheapFar], 2)?.spotId).toBe('cheap-far');
  });

  it('breaks a price tie on the zone (riva, ombrelloni, monte), then the row, then the column', () => {
    const monte = spot({ spotId: 'monte', zone: 'monte', rowNumber: 1, col: 1 });
    const ombrelloni = spot({ spotId: 'ombrelloni', zone: 'ombrelloni', rowNumber: 1, col: 1 });
    const riva = spot({ spotId: 'riva', zone: 'riva', rowNumber: 5, col: 9 });
    expect(suggestSpot([monte, ombrelloni, riva], 2)?.spotId).toBe('riva');

    const rowTwo = spot({ spotId: 'row-2', rowNumber: 2, col: 1 });
    const rowOne = spot({ spotId: 'row-1', rowNumber: 1, col: 7 });
    expect(suggestSpot([rowTwo, rowOne], 2)?.spotId).toBe('row-1');

    const colThree = spot({ spotId: 'col-3', rowNumber: 1, col: 3 });
    const colTwo = spot({ spotId: 'col-2', rowNumber: 1, col: 2 });
    expect(suggestSpot([colThree, colTwo], 2)?.spotId).toBe('col-2');
  });

  it('is stable: the same spots give the same suggestion in any input order', () => {
    const spots = [
      spot({ spotId: 'a', maxGuests: 3, priceCents: 2500, zone: 'ombrelloni', rowNumber: 2, col: 4 }),
      spot({ spotId: 'b', maxGuests: 2, priceCents: 3500, zone: 'monte', rowNumber: 3, col: 1 }),
      spot({ spotId: 'c', maxGuests: 2, priceCents: 3500, zone: 'riva', rowNumber: 1, col: 2 }),
      spot({ spotId: 'd', maxGuests: 4, priceCents: 1000, zone: 'riva', rowNumber: 1, col: 1 }),
    ];
    // Smallest surplus for two guests: b and c (capacity 2); same price; riva wins.
    const expected = 'c';
    expect(suggestSpot(spots, 2)?.spotId).toBe(expected);
    expect(suggestSpot([...spots].reverse(), 2)?.spotId).toBe(expected);
    expect(suggestSpot([spots[2]!, spots[0]!, spots[3]!, spots[1]!], 2)?.spotId).toBe(expected);
  });

  it('refuses a party size that is not a positive integer', () => {
    expect(() => suggestSpot([spot({})], 0)).toThrow(RangeError);
    expect(() => suggestSpot([spot({})], 1.5)).toThrow(RangeError);
  });
});
