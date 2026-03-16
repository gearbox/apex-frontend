import { describe, it, expect, vi } from 'vitest';

// Mock the locale store so format.ts doesn't require $paraglide/runtime
vi.mock('$lib/stores/locale', async () => {
  const { writable } = await import('svelte/store');
  return { locale: writable('en') };
});

import { formatNumber, formatDate, formatUsd, formatTokens, formatBytes, truncate } from './format';

describe('formatNumber()', () => {
  it('formats with English thousands separator', () => {
    expect(formatNumber(1247, 'en')).toBe('1,247');
  });

  it('formats with Serbian thousands separator (dot)', () => {
    // Serbian uses period as thousands separator
    expect(formatNumber(1247, 'sr')).toMatch(/1[.,]247/);
  });

  it('formats zero', () => {
    expect(formatNumber(0, 'en')).toBe('0');
  });
});

describe('formatDate()', () => {
  it('contains abbreviated month name in English', () => {
    expect(formatDate('2026-03-14', 'en')).toMatch(/Mar/);
  });

  it('returns a non-empty string for Russian locale', () => {
    const result = formatDate('2026-03-14', 'ru');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('formatUsd()', () => {
  it('formats USD with dollar sign for English locale', () => {
    expect(formatUsd(12.5, 'en')).toBe('$12.50');
  });

  it('accepts string input', () => {
    expect(formatUsd('12.50', 'en')).toBe('$12.50');
  });
});

describe('formatTokens()', () => {
  it('prepends ◈ symbol', () => {
    expect(formatTokens(500)).toMatch(/^◈/);
  });

  it('includes the number', () => {
    expect(formatTokens(1500)).toContain('1');
  });
});

describe('formatBytes()', () => {
  it('formats bytes', () => {
    expect(formatBytes(512)).toBe('512 B');
  });

  it('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
  });

  it('formats megabytes', () => {
    expect(formatBytes(1048576)).toBe('1.0 MB');
  });
});

describe('truncate()', () => {
  it('returns string unchanged if within limit', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('truncates and appends ellipsis', () => {
    expect(truncate('hello world', 6)).toBe('hello…');
  });
});
