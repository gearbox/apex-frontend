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
    expect(get(studioCapability)).toBe('unreachable');
    await probeStudio(probe, 100);
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it('exhausted retries end in unreachable', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { probeStudio, studioCapability } = await import('./capabilities');
    const probe = vi.fn().mockResolvedValue({ status: 503 });

    const request = probeStudio(probe, 100);
    await vi.advanceTimersByTimeAsync(100);
    await request;

    expect(probe).toHaveBeenCalledTimes(2);
    expect(get(studioCapability)).toBe('unreachable');
    await probeStudio(probe, 100);
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it('retryStudioProbe re-probes only from unreachable', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { probeStudio, retryStudioProbe, studioCapability } = await import('./capabilities');
    const failedProbe = vi.fn().mockRejectedValue(new Error('offline'));
    const exhausted = probeStudio(failedProbe, 100);
    await vi.advanceTimersByTimeAsync(100);
    await exhausted;

    const successfulProbe = vi.fn().mockResolvedValue({ status: 200 });
    await retryStudioProbe(successfulProbe, 100);
    expect(successfulProbe).toHaveBeenCalledTimes(1);
    expect(get(studioCapability)).toBe('available');

    await retryStudioProbe(vi.fn().mockResolvedValue({ status: 200 }), 100);
    expect(successfulProbe).toHaveBeenCalledTimes(1);
  });

  it.each([
    [200, 'available'],
    [404, 'unavailable'],
  ] as const)('does not retryStudioProbe from settled state %s', async (status, expected) => {
    const { probeStudio, retryStudioProbe, studioCapability } = await import('./capabilities');
    await probeStudio(async () => ({ status }));
    const retry = vi.fn().mockResolvedValue({ status: 200 });

    await retryStudioProbe(retry);

    expect(get(studioCapability)).toBe(expected);
    expect(retry).not.toHaveBeenCalled();
  });
});
