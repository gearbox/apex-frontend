import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { setAuthStatus } from '$lib/stores/auth';
import type { Writable } from 'svelte/store';
import type { CapabilityState } from '$lib/product/capabilities';
const state = vi.hoisted(() => ({
  goto: vi.fn(),
  probe: vi.fn(),
  retry: vi.fn(),
  home: vi.fn().mockResolvedValue('/app/create'),
}));
vi.mock('$app/navigation', () => ({ goto: state.goto }));
vi.mock('$lib/product/home', () => ({ resolveHomeRoute: state.home }));
vi.mock('$lib/product/capabilities', async () => {
  const { writable } = await import('svelte/store');
  return {
    studioCapability: writable('unknown'),
    probeStudio: state.probe,
    retryStudioProbe: state.retry,
  };
});
import { studioCapability } from '$lib/product/capabilities';
import Harness from './CapabilityGateHarness.svelte';
const capability = studioCapability as Writable<CapabilityState>;
beforeEach(() => {
  capability.set('unknown');
  setAuthStatus('authenticated');
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  setAuthStatus('unknown');
});
describe('CapabilityGate', () => {
  it('probes authenticated users and renders children only when available', async () => {
    render(Harness);
    expect(state.probe).toHaveBeenCalledOnce();
    expect(screen.queryByText('Gated content')).toBeNull();
    capability.set('available');
    expect(await screen.findByText('Gated content')).toBeTruthy();
  });
  it('does not probe anonymously', () => {
    setAuthStatus('unauthenticated');
    render(Harness);
    expect(state.probe).not.toHaveBeenCalled();
  });
  it('redirects unavailable users once to the resolved home', async () => {
    render(Harness);
    capability.set('unavailable');
    await waitFor(() =>
      expect(state.goto).toHaveBeenCalledWith('/app/create', { replaceState: true }),
    );
    capability.set('unavailable');
    expect(state.goto).toHaveBeenCalledOnce();
  });
  it('offers an explicit retry after an unreachable probe', async () => {
    render(Harness);
    capability.set('unreachable');
    await fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(state.retry).toHaveBeenCalledOnce();
  });
});
