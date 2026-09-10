import { describe, expect, it } from 'vitest';
import {
  clampProgress,
  formatBytes,
  formatDuration,
  formatTypicalDuration,
  formatOperationRate,
  timestampMs,
} from './operationDisplay';

describe('operation display helpers', () => {
  it('uses backend percentage semantics while clamping only visual width', () => {
    expect(clampProgress(100)).toBe(100);
    expect(clampProgress(120)).toBe(100);
    expect(clampProgress(-5)).toBe(0);
  });

  it('parses a valid ISO timestamp and rejects missing or invalid ones', () => {
    expect(timestampMs('2026-06-20T00:01:00Z')).toBe(Date.parse('2026-06-20T00:01:00Z'));
    expect(timestampMs(null)).toBeNull();
    expect(timestampMs(undefined)).toBeNull();
    expect(timestampMs('not-a-date')).toBeNull();
  });

  it('formats byte counters and server-supplied rates', () => {
    expect(formatBytes(2.4 * 1024 ** 3)).toBe('2.4 GB');
    expect(formatOperationRate({ value: 42 * 1024 ** 2, unit: 'bytes_per_second' })).toBe(
      '42 MB/s',
    );
  });

  it('formats durations without creating an ETA', () => {
    expect(formatDuration(103)).toBe('1m 43s');
    expect(formatTypicalDuration(120)).toBe('2m');
  });
});
