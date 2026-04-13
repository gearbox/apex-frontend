import { describe, it, expect, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';

// We re-import the module fresh for each test group by using vi.resetModules()
// but since Svelte stores are module-level singletons we test initNetworkListener
// directly by mocking navigator.onLine and dispatching events.

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    writable: true,
    value,
  });
}

describe('networkStatus store', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initNetworkListener syncs initial state and updates on events', async () => {
    setOnline(true);

    const { networkStatus, isOffline, initNetworkListener } = await import('./network');

    const cleanup = initNetworkListener();

    expect(get(networkStatus)).toBe('online');
    expect(get(isOffline)).toBe(false);

    // Simulate going offline
    setOnline(false);
    window.dispatchEvent(new Event('offline'));
    expect(get(networkStatus)).toBe('offline');
    expect(get(isOffline)).toBe(true);

    // Simulate coming back online
    setOnline(true);
    window.dispatchEvent(new Event('online'));
    expect(get(networkStatus)).toBe('online');
    expect(get(isOffline)).toBe(false);

    cleanup();
  });

  it('cleanup removes event listeners', async () => {
    setOnline(true);
    const { networkStatus, initNetworkListener } = await import('./network');

    const cleanup = initNetworkListener();
    cleanup();

    // After cleanup, dispatching offline should not update the store
    // (store remains at whatever it was set to by initNetworkListener)
    const stateBefore = get(networkStatus);
    setOnline(false);
    window.dispatchEvent(new Event('offline'));
    // The store may still be online (listeners removed)
    // We can only verify no error was thrown; the store won't update
    expect(get(networkStatus)).toBe(stateBefore);
  });

  it('isOffline is true when offline', async () => {
    setOnline(false);
    const { isOffline, initNetworkListener } = await import('./network');
    const cleanup = initNetworkListener();
    expect(get(isOffline)).toBe(true);
    cleanup();
  });

  it('isOffline is false when online', async () => {
    setOnline(true);
    const { isOffline, initNetworkListener } = await import('./network');
    const cleanup = initNetworkListener();
    expect(get(isOffline)).toBe(false);
    cleanup();
  });
});
