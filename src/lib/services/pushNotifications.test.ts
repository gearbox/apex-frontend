import { afterEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import {
  pushDeleteNetworkErrorHandler,
  pushSubscribeFailedHandler,
} from '../../mocks/handlers/push';
import {
  PUSH_SERVICE_WORKER_READY_TIMEOUT_MS,
  getPushSupport,
  isPushNudgeEligible,
  preparePushResources,
  reconcileOnLaunch,
  resetPushNotificationStateForTesting,
  subscribe,
  unsubscribe,
  urlBase64ToUint8Array,
} from './pushNotifications';
import { STORAGE_KEYS } from '$lib/utils/constants';

const BASE = 'http://localhost:8000';

function stubNavigator(overrides: Record<string, unknown> = {}) {
  vi.stubGlobal('navigator', {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    platform: 'Win32',
    maxTouchPoints: 0,
    ...overrides,
  });
}

function stubMatchMedia(matches = false) {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockReturnValue({ matches }),
  });
}

function makeFakeSubscription(endpoint: string) {
  return {
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: 'p256dh-key', auth: 'auth-key' } }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  };
}

function stubPushSupported(
  registration: unknown,
  permission: NotificationPermission = 'granted',
  requestPermission = vi.fn().mockResolvedValue(permission),
) {
  const getRegistration = vi.fn().mockResolvedValue(registration);
  stubNavigator({
    userAgent: 'test-agent',
    serviceWorker: { getRegistration, ready: Promise.resolve(registration) },
  });
  vi.stubGlobal('PushManager', class {});
  vi.stubGlobal('Notification', { permission, requestPermission });
  return { getRegistration, requestPermission };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  resetPushNotificationStateForTesting();
  localStorage.clear();
});

describe('getPushSupport', () => {
  it('returns "supported" when serviceWorker, PushManager, and Notification are all available', () => {
    stubNavigator({ serviceWorker: {} });
    vi.stubGlobal('PushManager', class {});
    vi.stubGlobal('Notification', { permission: 'default' });

    expect(getPushSupport()).toBe('supported');
  });

  it('returns "needs-install" in an iOS browser tab even when push globals are exposed', () => {
    stubNavigator({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      serviceWorker: {},
    });
    stubMatchMedia(false);
    vi.stubGlobal('PushManager', class {});
    vi.stubGlobal('Notification', { permission: 'default' });

    expect(getPushSupport()).toBe('needs-install');
  });

  it('returns "supported" on iOS once installed to home screen with the required APIs', () => {
    stubNavigator({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      serviceWorker: {},
    });
    stubMatchMedia(true);
    vi.stubGlobal('PushManager', class {});
    vi.stubGlobal('Notification', { permission: 'default' });

    expect(getPushSupport()).toBe('supported');
  });

  it('returns "unsupported" on a non-iOS browser without PushManager', () => {
    stubNavigator();
    expect(getPushSupport()).toBe('unsupported');
  });
});

describe('urlBase64ToUint8Array', () => {
  function toUrlBase64(bytes: Uint8Array): string {
    let binary = '';
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  it('round-trips arbitrary bytes through url-safe base64', () => {
    const original = new Uint8Array([251, 239, 190, 0, 1, 255, 16, 32, 127]);
    expect(Array.from(urlBase64ToUint8Array(toUrlBase64(original)))).toEqual(Array.from(original));
  });
});

describe('subscribe', () => {
  it('requests default permission before any service-worker or VAPID work', async () => {
    let resolvePermission!: (permission: NotificationPermission) => void;
    const permissionRequest = new Promise<NotificationPermission>((resolve) => {
      resolvePermission = resolve;
    });
    const requestPermission = vi.fn().mockReturnValue(permissionRequest);
    const { getRegistration } = stubPushSupported(
      { pushManager: { getSubscription: vi.fn(), subscribe: vi.fn() } },
      'default',
      requestPermission,
    );

    const result = subscribe();

    expect(requestPermission).toHaveBeenCalledOnce();
    expect(getRegistration).not.toHaveBeenCalled();
    resolvePermission('denied');
    await expect(result).resolves.toEqual({ status: 'permission-denied' });
    expect(getRegistration).not.toHaveBeenCalled();
  });

  it('continues to subscription after permission is granted', async () => {
    const fakeSub = makeFakeSubscription('https://push.example.com/granted');
    const subscribeMock = vi.fn().mockResolvedValue(fakeSub);
    const { requestPermission } = stubPushSupported(
      {
        pushManager: { getSubscription: vi.fn().mockResolvedValue(null), subscribe: subscribeMock },
      },
      'default',
      vi.fn().mockResolvedValue('granted'),
    );

    await expect(subscribe()).resolves.toEqual({ status: 'enabled' });

    expect(requestPermission).toHaveBeenCalledOnce();
    expect(subscribeMock).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
  });

  it('does not subscribe or POST when permission is denied', async () => {
    const subscribeMock = vi.fn();
    let postCalled = false;
    stubPushSupported(
      { pushManager: { getSubscription: vi.fn(), subscribe: subscribeMock } },
      'default',
      vi.fn().mockResolvedValue('denied'),
    );
    server.use(
      http.post(`${BASE}/v1/push/subscriptions`, () => {
        postCalled = true;
        return HttpResponse.json({}, { status: 201 });
      }),
    );

    await expect(subscribe()).resolves.toEqual({ status: 'permission-denied' });

    expect(subscribeMock).not.toHaveBeenCalled();
    expect(postCalled).toBe(false);
  });

  it('does not subscribe when the permission prompt is dismissed', async () => {
    const subscribeMock = vi.fn();
    stubPushSupported(
      { pushManager: { getSubscription: vi.fn(), subscribe: subscribeMock } },
      'default',
      vi.fn().mockResolvedValue('default'),
    );

    await expect(subscribe()).resolves.toEqual({ status: 'permission-dismissed' });
    expect(subscribeMock).not.toHaveBeenCalled();
  });

  it('skips requestPermission when permission is already granted', async () => {
    const fakeSub = makeFakeSubscription('https://push.example.com/already-granted');
    const requestPermission = vi.fn();
    stubPushSupported(
      {
        pushManager: {
          getSubscription: vi.fn().mockResolvedValue(null),
          subscribe: vi.fn().mockResolvedValue(fakeSub),
        },
      },
      'granted',
      requestPermission,
    );

    await expect(subscribe()).resolves.toEqual({ status: 'enabled' });
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('reuses an existing browser subscription and re-POSTs it', async () => {
    const fakeSub = makeFakeSubscription('https://push.example.com/existing');
    const subscribeMock = vi.fn();
    stubPushSupported({
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue(fakeSub),
        subscribe: subscribeMock,
      },
    });

    let capturedBody: unknown;
    server.use(
      http.post(`${BASE}/v1/push/subscriptions`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({}, { status: 201 });
      }),
    );

    await expect(subscribe()).resolves.toEqual({ status: 'enabled' });

    expect(subscribeMock).not.toHaveBeenCalled();
    expect(capturedBody).toMatchObject({
      endpoint: 'https://push.example.com/existing',
      keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
      user_agent: 'test-agent',
    });
    expect(localStorage.getItem(STORAGE_KEYS.PUSH_ENDPOINT)).toBe(
      'https://push.example.com/existing',
    );
  });

  it('rolls back a newly created browser subscription when backend registration fails', async () => {
    const fakeSub = makeFakeSubscription('https://push.example.com/new-failure');
    stubPushSupported({
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue(null),
        subscribe: vi.fn().mockResolvedValue(fakeSub),
      },
    });
    server.use(pushSubscribeFailedHandler);

    await expect(subscribe()).resolves.toEqual({ status: 'backend-registration-failed' });
    expect(fakeSub.unsubscribe).toHaveBeenCalledOnce();
    expect(localStorage.getItem(STORAGE_KEYS.PUSH_ENDPOINT)).toBeNull();
  });

  it('does not remove a pre-existing browser subscription when backend registration fails', async () => {
    const fakeSub = makeFakeSubscription('https://push.example.com/existing-failure');
    stubPushSupported({
      pushManager: { getSubscription: vi.fn().mockResolvedValue(fakeSub), subscribe: vi.fn() },
    });
    server.use(pushSubscribeFailedHandler);

    await expect(subscribe()).resolves.toEqual({ status: 'backend-registration-failed' });
    expect(fakeSub.unsubscribe).not.toHaveBeenCalled();
  });
});

describe('preparePushResources', () => {
  it('is idempotent while it resolves', async () => {
    const registration = { pushManager: { getSubscription: vi.fn(), subscribe: vi.fn() } };
    const { getRegistration } = stubPushSupported(registration);
    let vapidRequests = 0;
    server.use(
      http.get(`${BASE}/v1/push/vapid-public-key`, () => {
        vapidRequests += 1;
        return HttpResponse.json({ public_key: 'BA' });
      }),
    );

    const [first, second] = await Promise.all([preparePushResources(), preparePushResources()]);

    expect(first).toEqual({ status: 'prepared' });
    expect(second).toEqual({ status: 'prepared' });
    expect(getRegistration).toHaveBeenCalledOnce();
    expect(vapidRequests).toBe(1);
  });

  it('allows a failed preparation to be retried', async () => {
    const registration = { pushManager: { getSubscription: vi.fn(), subscribe: vi.fn() } };
    const { getRegistration } = stubPushSupported(registration);
    getRegistration.mockRejectedValueOnce(new Error('registration race'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(preparePushResources()).resolves.toEqual({ status: 'service-worker-unavailable' });
    await expect(preparePushResources()).resolves.toEqual({ status: 'prepared' });

    expect(getRegistration).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('returns a retryable typed failure when service-worker readiness times out', async () => {
    vi.useFakeTimers();
    const neverReady = new Promise<ServiceWorkerRegistration>(() => undefined);
    stubNavigator({
      userAgent: 'test-agent',
      serviceWorker: { getRegistration: vi.fn().mockResolvedValue(undefined), ready: neverReady },
    });
    vi.stubGlobal('PushManager', class {});
    vi.stubGlobal('Notification', { permission: 'granted' });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = preparePushResources();
    await vi.advanceTimersByTimeAsync(PUSH_SERVICE_WORKER_READY_TIMEOUT_MS);

    await expect(result).resolves.toEqual({ status: 'service-worker-unavailable' });
    warn.mockRestore();
  });
});

describe('unsubscribe', () => {
  it('is a no-op when there is no active subscription, and clears any stale flag', async () => {
    stubPushSupported({ pushManager: { getSubscription: vi.fn().mockResolvedValue(null) } });
    localStorage.setItem(STORAGE_KEYS.PUSH_ENDPOINT, 'stale-endpoint');

    await expect(unsubscribe()).resolves.toBeUndefined();
    expect(localStorage.getItem(STORAGE_KEYS.PUSH_ENDPOINT)).toBeNull();
  });

  it('is offline-tolerant: a network failure on DELETE still unsubscribes locally', async () => {
    const fakeSub = makeFakeSubscription('https://push.example.com/xyz');
    stubPushSupported({ pushManager: { getSubscription: vi.fn().mockResolvedValue(fakeSub) } });
    localStorage.setItem(STORAGE_KEYS.PUSH_ENDPOINT, 'https://push.example.com/xyz');
    server.use(pushDeleteNetworkErrorHandler);

    await unsubscribe();
    expect(fakeSub.unsubscribe).toHaveBeenCalledOnce();
    expect(localStorage.getItem(STORAGE_KEYS.PUSH_ENDPOINT)).toBeNull();
  });
});

describe('reconcileOnLaunch', () => {
  it('re-POSTs and updates the stored endpoint when the browser rotated it', async () => {
    const fakeSub = makeFakeSubscription('https://push.example.com/rotated');
    stubPushSupported({ pushManager: { getSubscription: vi.fn().mockResolvedValue(fakeSub) } });
    localStorage.setItem(STORAGE_KEYS.PUSH_ENDPOINT, 'https://push.example.com/old');

    let postCalled = false;
    server.use(
      http.post(`${BASE}/v1/push/subscriptions`, () => {
        postCalled = true;
        return HttpResponse.json({}, { status: 201 });
      }),
    );

    await reconcileOnLaunch();

    expect(postCalled).toBe(true);
    expect(localStorage.getItem(STORAGE_KEYS.PUSH_ENDPOINT)).toBe(
      'https://push.example.com/rotated',
    );
  });

  it('clears the stored endpoint when the browser subscription is gone', async () => {
    stubPushSupported({ pushManager: { getSubscription: vi.fn().mockResolvedValue(null) } });
    localStorage.setItem(STORAGE_KEYS.PUSH_ENDPOINT, 'https://push.example.com/gone');

    await reconcileOnLaunch();
    expect(localStorage.getItem(STORAGE_KEYS.PUSH_ENDPOINT)).toBeNull();
  });

  it('deduplicates overlapping reconciliation requests', async () => {
    let resolveSubscription!: (subscription: ReturnType<typeof makeFakeSubscription>) => void;
    const subscriptionPromise = new Promise<ReturnType<typeof makeFakeSubscription>>((resolve) => {
      resolveSubscription = resolve;
    });
    const getSubscription = vi.fn().mockReturnValue(subscriptionPromise);
    stubPushSupported({ pushManager: { getSubscription } });

    const first = reconcileOnLaunch();
    const second = reconcileOnLaunch();
    resolveSubscription(makeFakeSubscription('https://push.example.com/same'));
    await Promise.all([first, second]);

    expect(getSubscription).toHaveBeenCalledOnce();
  });
});

describe('isPushNudgeEligible', () => {
  it('is eligible when supported, permission default, not subscribed, not dismissed', () => {
    expect(
      isPushNudgeEligible({
        support: 'supported',
        permission: 'default',
        subscribed: false,
        dismissed: false,
      }),
    ).toBe(true);
  });

  it.each([
    {
      support: 'needs-install' as const,
      permission: 'default' as const,
      subscribed: false,
      dismissed: false,
    },
    {
      support: 'unsupported' as const,
      permission: 'default' as const,
      subscribed: false,
      dismissed: false,
    },
    {
      support: 'supported' as const,
      permission: 'granted' as const,
      subscribed: false,
      dismissed: false,
    },
    {
      support: 'supported' as const,
      permission: 'denied' as const,
      subscribed: false,
      dismissed: false,
    },
    {
      support: 'supported' as const,
      permission: 'default' as const,
      subscribed: true,
      dismissed: false,
    },
    {
      support: 'supported' as const,
      permission: 'default' as const,
      subscribed: false,
      dismissed: true,
    },
  ])('is not eligible for %o', (input) => {
    expect(isPushNudgeEligible(input)).toBe(false);
  });
});
