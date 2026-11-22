import { afterEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('studio capability probe', () => {
  it.each([
    [200, 'available'],
    [404, 'unavailable'],
  ] as const)('resolves %s to %s', async (status, expected) => {
    const { probeStudio, studioCapability } = await import('./capabilities');
    await probeStudio(async () => ({ status }));
    expect(get(studioCapability)).toBe(expected);
  });
  it('shares the in-flight probe and retries a transient error only once', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { probeStudio, studioCapability } = await import('./capabilities');
    const probe = vi.fn().mockRejectedValue(new Error('network'));
    const first = probeStudio(probe, 100);
    const second = probeStudio(probe, 100);
    expect(first).toBe(second);
    await vi.advanceTimersByTimeAsync(100);
    await first;
    expect(probe).toHaveBeenCalledTimes(2);
    expect(get(studioCapability)).toBe('unknown');
    await probeStudio(probe, 100);
    expect(probe).toHaveBeenCalledTimes(2);
  });
});
