import { describe, expect, it } from 'vitest';
import { expandRecurrence } from '../src/index';

describe('expandRecurrence', () => {
  it('lists every Tuesday and Thursday of the reference fortnight', () => {
    expect(expandRecurrence({ from: '2027-06-14', to: '2027-06-27', weekdays: [2, 4] })).toEqual([
      '2027-06-15',
      '2027-06-17',
      '2027-06-22',
      '2027-06-24',
    ]);
  });

  it('counts Sunday as day 7 and includes both ends of the period', () => {
    expect(expandRecurrence({ from: '2027-06-20', to: '2027-06-27', weekdays: [7] })).toEqual(['2027-06-20', '2027-06-27']);
  });

  it('refuses impossible dates, reversed periods and runaway ranges', () => {
    expect(() => expandRecurrence({ from: '2027-02-30', to: '2027-03-01', weekdays: [1] })).toThrow(RangeError);
    expect(() => expandRecurrence({ from: '2027-06-20', to: '2027-06-01', weekdays: [1] })).toThrow(RangeError);
    expect(() => expandRecurrence({ from: '2027-06-01', to: '2027-06-30', weekdays: [8] })).toThrow(RangeError);
    expect(() => expandRecurrence({ from: '2020-01-01', to: '2030-01-01', weekdays: [1, 2, 3, 4, 5, 6, 7] })).toThrow(RangeError);
  });
});
