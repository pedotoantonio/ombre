import { assertCents, type Cents } from './money';

/** Percentages are expressed in basis points: 10% = 1000, 100% = 10000. */
export type BasisPoints = number;
const FULL: BasisPoints = 10_000;

function assertBasisPoints(value: number): asserts value is BasisPoints {
  if (!Number.isInteger(value) || value < 0 || value > FULL) {
    throw new RangeError('percentage must be between 0 and 10000 basis points');
  }
}

/** Share of an amount, rounded half up to the cent using integer arithmetic only. */
export function percentOf(amount: Cents, bps: BasisPoints): Cents {
  assertCents(amount);
  assertBasisPoints(bps);
  if (amount < 0) throw new RangeError('amount must not be negative');
  return Math.floor((amount * bps + FULL / 2) / FULL);
}

export interface DayQuote {
  listPrice: Cents;
  discount: Cents;
  total: Cents;
  promoCode: string | null;
}

export function quoteDay(listPrice: Cents, promo?: { code: string; percentBps: BasisPoints }): DayQuote {
  assertCents(listPrice, 'list price');
  if (listPrice < 0) throw new RangeError('list price must not be negative');
  const discount = promo ? percentOf(listPrice, promo.percentBps) : 0;
  return { listPrice, discount, total: listPrice - discount, promoCode: promo?.code ?? null };
}

/**
 * Price of a day under a hotel convention (spec §4.1, D30): a percent discount works
 * like a promotion; a fixed price means the guest pays `min(list price, fixed price)`,
 * so the discount is never negative, as the whole quote→hold→booking chain assumes.
 * The guest sees the outcome in the same promoCode/discount fields as a promotion.
 */
export function quoteConventionDay(listPrice: Cents, code: string, pricing: { percentBps: BasisPoints | null; fixedPriceCents: Cents | null }): DayQuote {
  if (pricing.percentBps !== null) return quoteDay(listPrice, { code, percentBps: pricing.percentBps });
  assertCents(listPrice, 'list price');
  if (listPrice < 0) throw new RangeError('list price must not be negative');
  const fixed = pricing.fixedPriceCents;
  if (fixed === null) throw new RangeError('a convention must carry a percent discount or a fixed price');
  assertCents(fixed, 'fixed price');
  if (fixed < 0) throw new RangeError('fixed price must not be negative');
  const total = Math.min(listPrice, fixed);
  return { listPrice, discount: listPrice - total, total, promoCode: code };
}

export interface Share<Party extends string> {
  party: Party;
  bps: BasisPoints;
}

/**
 * Splits a total among parties. Each share is rounded down; the cents left over
 * go to the party named in `residualTo`, so the parts always add up to the total.
 */
export function splitAmount<Party extends string>(
  total: Cents,
  shares: readonly Share<Party>[],
  residualTo: Party,
): Record<Party, Cents> {
  assertCents(total, 'total');
  if (total < 0) throw new RangeError('total must not be negative');
  const parties = new Set(shares.map((share) => share.party));
  if (parties.size !== shares.length) throw new RangeError('each party must appear once');
  if (!parties.has(residualTo)) throw new RangeError('the residual party must be one of the shares');
  let bpsSum = 0;
  for (const share of shares) {
    assertBasisPoints(share.bps);
    bpsSum += share.bps;
  }
  if (bpsSum !== FULL) throw new RangeError('shares must add up to 10000 basis points');

  const result = {} as Record<Party, Cents>;
  let assigned = 0;
  for (const share of shares) {
    const part = Math.floor((total * share.bps) / FULL);
    result[share.party] = part;
    assigned += part;
  }
  result[residualTo] += total - assigned;
  return result;
}
