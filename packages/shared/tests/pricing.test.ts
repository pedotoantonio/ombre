import { describe, expect, it } from 'vitest';
import { formatMoney, percentOf, quoteDay, splitAmount } from '../src/index';

const shares = [
  { party: 'seasonHolder', bps: 5000 },
  { party: 'beachClub', bps: 4000 },
  { party: 'platform', bps: 1000 },
] as const;

describe('quoteDay', () => {
  it('applies MARE10 to the reference day: 30.00 becomes 27.00', () => {
    expect(quoteDay(3000, { code: 'MARE10', percentBps: 1000 })).toEqual({
      listPrice: 3000,
      discount: 300,
      total: 2700,
      promoCode: 'MARE10',
    });
  });

  it('leaves the price untouched without a promotion', () => {
    expect(quoteDay(3000)).toEqual({ listPrice: 3000, discount: 0, total: 3000, promoCode: null });
  });

  it('rejects amounts that are not whole cents', () => {
    expect(() => quoteDay(29.99)).toThrow(RangeError);
    expect(() => quoteDay(-100)).toThrow(RangeError);
  });
});

describe('percentOf', () => {
  it('rounds half up to the cent', () => {
    expect(percentOf(2995, 1000)).toBe(300);
    expect(percentOf(2994, 1000)).toBe(299);
    expect(percentOf(1, 5000)).toBe(1);
  });
});

describe('splitAmount', () => {
  it('splits the reference day 50/40/10: 13.50, 10.80, 2.70', () => {
    expect(splitAmount(2700, shares, 'beachClub')).toEqual({ seasonHolder: 1350, beachClub: 1080, platform: 270 });
  });

  it('always adds up to the total and gives the leftover cents to the named party', () => {
    for (let total = 0; total <= 5000; total += 7) {
      const parts = splitAmount(total, shares, 'beachClub');
      expect(parts.seasonHolder + parts.beachClub + parts.platform).toBe(total);
      expect(parts.seasonHolder).toBe(Math.floor(total / 2));
      expect(parts.platform).toBe(Math.floor(total / 10));
    }
    expect(splitAmount(2701, shares, 'beachClub')).toEqual({ seasonHolder: 1350, beachClub: 1081, platform: 270 });
  });

  it('rejects shares that do not add up to 100%', () => {
    expect(() => splitAmount(2700, [{ party: 'a', bps: 5000 }, { party: 'b', bps: 4000 }], 'a')).toThrow(RangeError);
    expect(() => splitAmount(2700, shares, 'nobody' as 'platform')).toThrow(RangeError);
  });
});

describe('formatMoney', () => {
  it('formats cents for each language', () => {
    expect(formatMoney(2700, 'it').replace(/\s/g, ' ')).toBe('27,00 €');
    expect(formatMoney(2700, 'en')).toBe('€27.00');
  });
});
