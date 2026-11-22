import { describe, expect, it } from 'vitest';
import { deriveMemoryTitle, todayLocalIsoDate } from './memoryDraft';

describe('memory drafts', () => {
  it('derives a normalized title from the first nonblank line and respects code points', () => {
    expect(deriveMemoryTitle(' \n  Cafe\u0301   at\t night\nsecond line')).toBe('Café at night');
    expect(deriveMemoryTitle(' \n ')).toBe('');
    expect(deriveMemoryTitle(`${'x'.repeat(80)} ${'y'.repeat(60)}`)).toBe('x'.repeat(80));
    expect(Array.from(deriveMemoryTitle('😀'.repeat(130)))).toHaveLength(120);
  });
  it('uses the local calendar date in different time zones', () => {
    const previous = process.env.TZ;
    try {
      for (const zone of ['Europe/Belgrade', 'America/Los_Angeles']) {
        process.env.TZ = zone;
        expect(todayLocalIsoDate(new Date(2026, 10, 22, 23, 59))).toBe('2026-11-22');
      }
    } finally {
      process.env.TZ = previous;
    }
  });
});
