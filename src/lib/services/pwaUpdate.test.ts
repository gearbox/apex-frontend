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

class FakeWorker extends EventTarget {
  state: ServiceWorkerState = 'installed';
  readonly postMessage = vi.fn((message: unknown, transfer?: Transferable[]) => {
    const data = message as { type?: string };
    if (data.type === 'APEX_GET_BUILD_INFO') {
      (transfer?.[0] as MessagePort | undefined)?.postMessage({
        type: 'APEX_BUILD_INFO',
        buildSha: this.buildSha,
      });
    }
    this.onMessage?.(message);
  });

  constructor(
    readonly buildSha: string | undefined,
    private readonly onMessage?: (message: unknown) => void,
  ) {
    super();
  }
}

class FakeRegistration extends EventTarget {
  installing: ServiceWorker | null = null;
  waiting: ServiceWorker | null = null;
  active: ServiceWorker | null = null;
  update = vi.fn<() => Promise<void>>().mockResolvedValue();
}

class FakeServiceWorkerContainer extends EventTarget {
  controller: ServiceWorker | null = null;
}

const currentManifest = {
  version: '0.13.2',
  buildSha: 'current123',
  builtAt: '2026-07-18T10:20:00.000Z',
};

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function setOnline(value: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value });
}

describe('pwa update manager', () => {
  let registration: FakeRegistration;
  let serviceWorker: FakeServiceWorkerContainer;
  let reload: () => void;
  let releaseDirty: (() => void) | undefined;

  beforeEach(async () => {
    __resetPwaUpdateForTests();
    vi.spyOn(console, 'info').mockImplementation(() => {});
    sessionStorage.clear();
    setOnline(true);
    serviceWorker = new FakeServiceWorkerContainer();
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

  async function discoverTargetWithWaitingWorker(
    options: { dirty?: boolean; autoControl?: boolean } = {},
  ): Promise<FakeWorker> {
    const worker = new FakeWorker('next456', (message) => {
      if ((message as { type?: string }).type === 'APEX_ACTIVATE_UPDATE' && options.autoControl) {
        registration.waiting = null;
        registration.active = worker as unknown as ServiceWorker;
        serviceWorker.controller = worker as unknown as ServiceWorker;
        serviceWorker.dispatchEvent(new Event('controllerchange'));
      }
    });
    registration.waiting = worker as unknown as ServiceWorker;
    if (options.dirty) releaseDirty = setAppDirty('create-draft', true);
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...currentManifest, buildSha: 'next456' }),
    } as Response);
    await checkForAppUpdate({ force: true, source: 'manual' });
    await flush();
    return worker;
  }

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

  it('handles malformed manifests, timeouts, offline mode, and registration update failures', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ version: '0.13.2' }),
    } as Response);
    await expect(checkForAppUpdate({ force: true })).resolves.toMatchObject({ status: 'failed' });
    expect(get(pwaUpdateStatus).error).toBe('invalid-manifest');

    setOnline(false);
    await expect(checkForAppUpdate({ force: true })).resolves.toMatchObject({ status: 'offline' });
    setOnline(true);

    registration.update.mockRejectedValueOnce(new Error('worker update failed'));
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...currentManifest, buildSha: 'next456' }),
    } as Response);
    await expect(checkForAppUpdate({ force: true })).resolves.toMatchObject({ status: 'failed' });
    expect(get(pwaUpdateStatus).error).toBe('registration-update');
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
  });

  it('never reloads for initial installation and recovers a controller change before manifest resolution', async () => {
    serviceWorker.dispatchEvent(new Event('controllerchange'));
    await flush();
    expect(reload).not.toHaveBeenCalled();

    const active = new FakeWorker('next456');
    registration.active = active as unknown as ServiceWorker;
    serviceWorker.controller = active as unknown as ServiceWorker;
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...currentManifest, buildSha: 'next456' }),
    } as Response);
    await checkForAppUpdate({ force: true });
    await flush();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('discovers an already-waiting worker and leaves it waiting while the app is dirty', async () => {
    const worker = await discoverTargetWithWaitingWorker({ dirty: true });
    expect(get(pwaUpdateStatus).state).toBe('ready-to-activate');
    expect(worker.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'APEX_ACTIVATE_UPDATE' }),
    );
  });

  it('clean matching waiting workers activate through the custom protocol and reload exactly once', async () => {
    const worker = await discoverTargetWithWaitingWorker({ autoControl: true });
    await flush();
    expect(worker.postMessage).toHaveBeenCalledWith({
      type: 'APEX_ACTIVATE_UPDATE',
      targetBuildSha: 'next456',
    });
    expect(reload).toHaveBeenCalledTimes(1);

    serviceWorker.dispatchEvent(new Event('controllerchange'));
    await flush();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('uses the same identity-checked activation path for Update anyway', async () => {
    const worker = await discoverTargetWithWaitingWorker({ dirty: true, autoControl: true });
    expect(await applyPwaUpdate()).toBe(true);
    expect(worker.postMessage).toHaveBeenCalledWith({
      type: 'APEX_ACTIVATE_UPDATE',
      targetBuildSha: 'next456',
    });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('rejects unknown waiting workers rather than sending a generic legacy activation message', async () => {
    const oldWorker = new FakeWorker(undefined);
    registration.waiting = oldWorker as unknown as ServiceWorker;
    releaseDirty = setAppDirty('create-draft', true);
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ...currentManifest, buildSha: 'next456' }),
    } as Response);
    await checkForAppUpdate({ force: true });
    expect(await applyPwaUpdate()).toBe(false);
    expect(oldWorker.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'SKIP_WAITING' }),
    );
    expect(get(pwaUpdateStatus).state).toBe('failed');
    expect(get(pwaUpdateStatus).error).toBe('worker-build-mismatch');
  });

  it('reconciles updatefound/worker states and removes lifecycle listeners on dispose', async () => {
    const worker = new FakeWorker('next456');
    worker.state = 'installing';
    registration.installing = worker as unknown as ServiceWorker;
    registration.dispatchEvent(new Event('updatefound'));
    await flush();
    expect(get(pwaUpdateStatus).state).toBe('downloading');

    worker.state = 'redundant';
    worker.dispatchEvent(new Event('statechange'));
    expect(get(pwaUpdateStatus).error).toBe('worker-redundant');

    disposePwaUpdateService();
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shares the normal check flow with backend events and ignores the current target', async () => {
    await handleRemoteAppUpdateEvent({ targetBuildSha: 'current123', mode: 'prompt' });
    expect(fetch).not.toHaveBeenCalled();

    await handleRemoteAppUpdateEvent({ targetBuildSha: 'next456', mode: 'force' });
    await handleRemoteAppUpdateEvent({ targetBuildSha: 'next456', mode: 'force' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
