import { describe, expect, it } from 'vitest';
import { assertTransition, canTransition, transitions } from '../src/index';

describe('state machines', () => {
  it('keeps a hold distinct from a confirmation', () => {
    expect(canTransition('inventory', 'available', 'held')).toBe(true);
    expect(canTransition('inventory', 'available', 'occupied')).toBe(false);
    expect(canTransition('inventory', 'held', 'occupied')).toBe(true);
    expect(canTransition('inventory', 'held', 'available')).toBe(true);
  });

  it('never reopens a cancelled or completed booking', () => {
    expect(transitions.booking.cancelled).toEqual([]);
    expect(transitions.booking.completed).toEqual([]);
    expect(() => assertTransition('booking', 'cancelled', 'confirmed')).toThrow();
  });

  it('allows a payment under review to settle either way', () => {
    expect(canTransition('payment', 'under_review', 'succeeded')).toBe(true);
    expect(canTransition('payment', 'under_review', 'failed')).toBe(true);
    expect(canTransition('payment', 'succeeded', 'failed')).toBe(false);
  });

  it('only lists transitions towards known states', () => {
    for (const table of Object.values(transitions)) {
      const known = Object.keys(table);
      for (const targets of Object.values(table)) {
        for (const target of targets as readonly string[]) expect(known).toContain(target);
      }
    }
  });
});
