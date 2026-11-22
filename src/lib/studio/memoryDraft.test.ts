import { afterEach, describe, expect, it } from 'vitest';
import { deriveMemoryTitle, todayLocalIsoDate } from './memoryDraft';

describe('deriveMemoryTitle', () => {
  it('uses the first non-blank NFC line, collapses whitespace, and enforces code-point limits', () => {
    expect(deriveMemoryTitle(' \n\t\n  Café   after   rain  \nnext line')).toBe('Café after rain');

    const wordBoundary = `${'x'.repeat(61)} ${'y'.repeat(80)}`;
    expect(deriveMemoryTitle(wordBoundary)).toBe('x'.repeat(61));

    const noBoundary = 'x'.repeat(130);
    expect(Array.from(deriveMemoryTitle(noBoundary))).toHaveLength(120);
    expect(deriveMemoryTitle(noBoundary)).toBe('x'.repeat(120));

    const composedBody = `${'🙂'.repeat(119)}e\u0301 extra`;
    expect(Array.from(deriveMemoryTitle(composedBody))).toHaveLength(120);
    expect(deriveMemoryTitle(composedBody)).toBe(`${'🙂'.repeat(119)}é`);
    expect(deriveMemoryTitle('\n \t\n')).toBe('');
  });
});

describe('todayLocalIsoDate', () => {
  const previousTimezone = process.env.TZ;

  afterEach(() => {
    if (previousTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimezone;
  });

  it.each(['Europe/Belgrade', 'America/Los_Angeles'])(
    'uses the local calendar date at 23:59 in %s',
    (timezone) => {
      process.env.TZ = timezone;
      const localLateDate = new Date(2026, 10, 22, 23, 59);
      expect(todayLocalIsoDate(localLateDate)).toBe('2026-11-22');
    },
  );
});
