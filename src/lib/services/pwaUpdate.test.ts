import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/utils/appVersion', () => ({
  APP_VERSION: '0.13.2',
  BUILD_SHA: 'current123',
}));

vi.mock('$lib/utils/platform', () => ({ isStandalone: () => false }));

import { setAppDirty } from '$lib/services/appDirty';
import {
  __resetPwaUpdateForTests,
  __setPwaUpdateReloadForTests,
  applyPwaUpdate,
  checkForAppUpdate,
  compareBuildShas,
  disposePwaUpdateService,
  handleRemoteAppUpdateEvent,
  parseAppVersionManifest,
  pwaUpdateStatus,
  setPwaUpdateServiceWorkerRegistration,
} from './pwaUpdate';

class FakeRegistration extends EventTarget {
  installing: ServiceWorker | null = null;
  update = vi.fn<() => Promise<void>>().mockResolvedValue();
}

const currentManifest = {
  version: '0.13.2',
  buildSha: 'current123',
  builtAt: '2026-07-18T10:20:00.000Z',
};

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function setOnline(value: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value });
}

describe('pwa update manager', () => {
  let registration: FakeRegistration;
  let serviceWorker: EventTarget;
  let reload: () => void;
  let releaseDirty: (() => void) | undefined;

  beforeEach(async () => {
    __resetPwaUpdateForTests();
    vi.spyOn(console, 'info').mockImplementation(() => {});
    sessionStorage.clear();
    setOnline(true);
    serviceWorker = new EventTarget();
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: serviceWorker,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => currentManifest }),
    );
    reload = vi.fn<() => void>();
    __setPwaUpdateReloadForTests(reload);
    registration = new FakeRegistration();
    setPwaUpdateServiceWorkerRegistration(registration as unknown as ServiceWorkerRegistration);
    await flush();
    vi.clearAllMocks();
  });

  afterEach(() => {
    releaseDirty?.();
    releaseDirty = undefined;
    disposePwaUpdateService();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses build SHA identity and rejects malformed manifests', () => {
    expect(compareBuildShas('current123', 'current123')).toBe('current');
    expect(compareBuildShas('current123', 'next456')).toBe('update-available');
    expect(compareBuildShas('dev', 'next456')).toBe('unavailable');
    expect(parseAppVersionManifest({ ...currentManifest, builtAt: 'not-a-date' })).toBeNull();
    expect(parseAppVersionManifest({ version: '1.0.0', buildSha: 'next456' })).toBeNull();
  });

  it('fetches the manifest with no-store and a cache buster before updating the worker', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...currentManifest, buildSha: 'next456' }),
    } as Response);

    await expect(checkForAppUpdate({ force: true, source: 'manual' })).resolves.toMatchObject({
      status: 'update-available',
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringMatching(/^\/app-version\.json\?t=\d+$/),
      expect.objectContaining({ cache: 'no-store' }),
    );
    expect(registration.update).toHaveBeenCalledTimes(1);
  });

  it('handles malformed manifests and bounded fetch timeouts as recoverable failures', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ version: '0.13.2' }),
    } as Response);
    await expect(checkForAppUpdate({ force: true })).resolves.toMatchObject({ status: 'failed' });
    expect(get(pwaUpdateStatus).error).toBe('invalid-manifest');

    vi.useFakeTimers();
    vi.mocked(fetch).mockImplementationOnce(() => new Promise(() => {}));
    const timedOut = checkForAppUpdate({ force: true });
    await vi.advanceTimersByTimeAsync(8_000);
    await expect(timedOut).resolves.toMatchObject({ status: 'failed' });
    expect(get(pwaUpdateStatus).error).toBe('timeout');
    vi.useRealTimers();
  });

  it('deduplicates concurrent checks and respects the successful-check cooldown', async () => {
    const first = checkForAppUpdate({ force: true, source: 'manual' });
    const second = checkForAppUpdate({ force: true, source: 'visibility' });
    expect(second).toBe(first);
    await first;
    expect(fetch).toHaveBeenCalledTimes(1);

    await expect(checkForAppUpdate({ source: 'visibility' })).resolves.toMatchObject({
      status: 'skipped-cooldown',
    });
    await checkForAppUpdate({ force: true, source: 'manual' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('degrades safely while offline and when a registration cannot be found', async () => {
    setOnline(false);
    await expect(checkForAppUpdate({ force: true, source: 'online' })).resolves.toMatchObject({
      status: 'offline',
    });
    expect(fetch).not.toHaveBeenCalled();

    __resetPwaUpdateForTests();
    await expect(checkForAppUpdate({ force: true })).resolves.toMatchObject({
      status: 'registration-unavailable',
    });
  });

  it('reports worker update failures without throwing out of the app lifecycle', async () => {
    registration.update.mockRejectedValueOnce(new Error('worker update failed'));
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...currentManifest, buildSha: 'next456' }),
    } as Response);

    await expect(checkForAppUpdate({ force: true })).resolves.toMatchObject({ status: 'failed' });
    expect(get(pwaUpdateStatus).error).toBe('registration-update');
  });

  it('never reloads on first installation, but reloads exactly once after a confirmed update', async () => {
    serviceWorker.dispatchEvent(new Event('controllerchange'));
    expect(reload).not.toHaveBeenCalled();

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...currentManifest, buildSha: 'next456' }),
    } as Response);
    await checkForAppUpdate({ force: true });
    serviceWorker.dispatchEvent(new Event('controllerchange'));
    serviceWorker.dispatchEvent(new Event('controllerchange'));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not re-enter a reload loop when the target has already reloaded this session', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...currentManifest, buildSha: 'next456' }),
    } as Response);
    await checkForAppUpdate({ force: true });
    sessionStorage.setItem('apex:pwa-reloaded-for:next456', '1');

    serviceWorker.dispatchEvent(new Event('controllerchange'));
    expect(reload).not.toHaveBeenCalled();
  });

  it('defers a controller-change reload while the user has unsaved work, then applies it explicitly', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...currentManifest, buildSha: 'next456' }),
    } as Response);
    await checkForAppUpdate({ force: true });
    releaseDirty = setAppDirty('create-draft', true);
    serviceWorker.dispatchEvent(new Event('controllerchange'));

    expect(reload).not.toHaveBeenCalled();
    expect(get(pwaUpdateStatus).state).toBe('reload-required');
    expect(await applyPwaUpdate()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reacts to updatefound/worker state events and removes lifecycle listeners on dispose', async () => {
    const worker = new EventTarget() as ServiceWorker;
    Object.defineProperty(worker, 'state', { configurable: true, value: 'installing' });
    registration.installing = worker;
    registration.dispatchEvent(new Event('updatefound'));
    expect(get(pwaUpdateStatus).state).toBe('update-available');

    Object.defineProperty(worker, 'state', { configurable: true, value: 'installed' });
    worker.dispatchEvent(new Event('statechange'));
    expect(get(pwaUpdateStatus).state).toBe('activating');

    disposePwaUpdateService();
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shares the normal check flow with future backend events and ignores the current target', async () => {
    await handleRemoteAppUpdateEvent({ targetBuildSha: 'current123', mode: 'prompt' });
    expect(fetch).not.toHaveBeenCalled();

    await handleRemoteAppUpdateEvent({ targetBuildSha: 'next456', mode: 'force' });
    await handleRemoteAppUpdateEvent({ targetBuildSha: 'next456', mode: 'force' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(registration.update).toHaveBeenCalledTimes(1);
  });
});
