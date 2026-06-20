import { describe, it, expect, vi, afterEach } from 'vitest';
import { isAtLeast18 } from './age';

afterEach(() => {
  vi.useRealTimers();
});

function frozenToday(year: number, month: number, day: number) {
  // month is 1-based
  vi.setSystemTime(new Date(year, month - 1, day));
}

describe('isAtLeast18()', () => {
  it('returns true for someone clearly over 18', () => {
    frozenToday(2026, 6, 19);
    expect(isAtLeast18('1990-01-01')).toBe(true);
  });

  it('returns false for someone clearly under 18', () => {
    frozenToday(2026, 6, 19);
    expect(isAtLeast18('2015-06-19')).toBe(false);
  });

  it('returns true for someone who turns exactly 18 today', () => {
    frozenToday(2026, 6, 19);
    expect(isAtLeast18('2008-06-19')).toBe(true);
  });

  it('returns false for someone who turns 18 tomorrow', () => {
    frozenToday(2026, 6, 19);
    expect(isAtLeast18('2008-06-20')).toBe(false);
  });

  it('returns true for someone who turned 18 yesterday', () => {
    frozenToday(2026, 6, 19);
    expect(isAtLeast18('2008-06-18')).toBe(true);
  });

  it('handles birthday earlier in the same month correctly', () => {
    frozenToday(2026, 6, 19);
    // Born June 1, 2008 — turned 18 on June 1, 2026 (before today)
    expect(isAtLeast18('2008-06-01')).toBe(true);
  });

  it('handles birthday in a later month — not yet turned 18 this year', () => {
    frozenToday(2026, 6, 19);
    // Born July 1, 2008 — turns 18 on July 1, 2026 (in the future)
    expect(isAtLeast18('2008-07-01')).toBe(false);
  });

  it('returns false for malformed input', () => {
    for (const bad of ['', 'not-a-date', '2000/01/01', '2000-1-1', '20000101']) {
      expect(isAtLeast18(bad)).toBe(false);
    }
  });

  it('returns false for impossible calendar dates', () => {
    expect(isAtLeast18('2001-13-01')).toBe(false);
    expect(isAtLeast18('2000-02-31')).toBe(false);
  });

  it('returns false for future dates', () => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    expect(isAtLeast18(d.toISOString().split('T')[0])).toBe(false);
  });
});
