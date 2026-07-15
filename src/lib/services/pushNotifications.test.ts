import { afterEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import {
  pushDeleteNetworkErrorHandler,
  pushSubscribeFailedHandler,
} from '../../mocks/handlers/push';
import {
  PUSH_SERVICE_WORKER_READY_TIMEOUT_MS,
  detachPushOnLogout,
  getPushPromptPreference,
  getPushSupport,
  isPushNudgeEligible,
  parseStoredPushRegistration,
  preparePushResources,
  readStoredPushRegistration,
  reconcileOnLaunch,
  resetPushNotificationStateForTesting,
  storePushRegistration,
  subscribe,
  unsubscribe,
  updatePushPromptPreference,
  urlBase64ToUint8Array,
} from './pushNotifications';
import { STORAGE_KEYS } from '$lib/utils/constants';

const BASE = 'http://localhost:8000';
const USER_A = 'user-a';
const USER_B = 'user-b';

function stubNavigator(overrides: Record<string, unknown> = {}) {
  vi.stubGlobal('navigator', {
    userAgent: 'test-agent',
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

function makeFakeSubscription(endpoint: string, unsubscribe = vi.fn().mockResolvedValue(true)) {
  return {
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: 'p256dh-key', auth: 'auth-key' } }),
    unsubscribe,
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

function expectRegistration(userId: string, endpoint: string) {
  expect(readStoredPushRegistration()).toEqual({ version: 1, userId, endpoint });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  resetPushNotificationStateForTesting();
  localStorage.clear();
});

describe('getPushSupport', () => {
  it('returns supported when the required browser APIs exist', () => {
    stubNavigator({ serviceWorker: {} });
    vi.stubGlobal('PushManager', class {});
    vi.stubGlobal('Notification', { permission: 'default' });

    expect(getPushSupport()).toBe('supported');
  });

  it('returns needs-install in an iOS browser tab even if push globals are exposed', () => {
    stubNavigator({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      serviceWorker: {},
    });
    stubMatchMedia(false);
    vi.stubGlobal('PushManager', class {});
    vi.stubGlobal('Notification', { permission: 'default' });

    expect(getPushSupport()).toBe('needs-install');
  });

  it('returns supported after the iOS app is installed to the Home Screen', () => {
    stubNavigator({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      serviceWorker: {},
    });
    stubMatchMedia(true);
    vi.stubGlobal('PushManager', class {});
    vi.stubGlobal('Notification', { permission: 'default' });

    expect(getPushSupport()).toBe('supported');
  });
});

describe('storage records', () => {
  it('rejects malformed or legacy registration data without treating it as enabled state', () => {
    expect(parseStoredPushRegistration('{bad json')).toBeNull();
    expect(parseStoredPushRegistration(JSON.stringify({ endpoint: 'legacy' }))).toBeNull();

    localStorage.setItem(STORAGE_KEYS.PUSH_REGISTRATION, '{bad json');
    expect(readStoredPushRegistration()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.PUSH_REGISTRATION)).toBeNull();
  });

  it('keeps prompt dismissal and retry state isolated for each account', () => {
    updatePushPromptPreference(USER_A, { dismissed: true, retryPending: false });
    expect(getPushPromptPreference(USER_A)).toEqual({ dismissed: true, retryPending: false });
    expect(getPushPromptPreference(USER_B)).toEqual({ dismissed: false, retryPending: false });

    updatePushPromptPreference(USER_B, { retryPending: true });
    expect(getPushPromptPreference(USER_A)).toEqual({ dismissed: true, retryPending: false });
    expect(getPushPromptPreference(USER_B)).toEqual({ dismissed: false, retryPending: true });
  });
});

describe('urlBase64ToUint8Array', () => {
  it('round-trips arbitrary bytes through url-safe base64', () => {
    const original = new Uint8Array([251, 239, 190, 0, 1, 255, 16, 32, 127]);
    let binary = '';
    original.forEach((b) => (binary += String.fromCharCode(b)));
    const encoded = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(Array.from(urlBase64ToUint8Array(encoded))).toEqual(Array.from(original));
  });
});

describe('subscribe', () => {
  it('requests default permission synchronously before any awaited work', async () => {
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

    const result = subscribe(USER_A);

    expect(requestPermission).toHaveBeenCalledOnce();
    expect(getRegistration).not.toHaveBeenCalled();
    resolvePermission('denied');
    await expect(result).resolves.toEqual({ status: 'permission-denied' });
  });

  it('stores a versioned, user-owned registration after successful POST', async () => {
    const fakeSub = makeFakeSubscription('https://push.example.com/granted');
    const subscribeMock = vi.fn().mockResolvedValue(fakeSub);
    const { requestPermission } = stubPushSupported(
      {
        pushManager: { getSubscription: vi.fn().mockResolvedValue(null), subscribe: subscribeMock },
      },
      'default',
      vi.fn().mockResolvedValue('granted'),
    );
    localStorage.setItem(STORAGE_KEYS.PUSH_ENDPOINT, fakeSub.endpoint);

    await expect(subscribe(USER_A)).resolves.toEqual({ status: 'enabled' });

    expect(requestPermission).toHaveBeenCalledOnce();
    expect(subscribeMock).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
    expectRegistration(USER_A, fakeSub.endpoint);
    expect(localStorage.getItem(STORAGE_KEYS.PUSH_ENDPOINT)).toBeNull();
  });

  it('clears a matching confirmed record when an existing subscription POST fails', async () => {
    const fakeSub = makeFakeSubscription('https://push.example.com/existing-failure');
    stubPushSupported({
      pushManager: { getSubscription: vi.fn().mockResolvedValue(fakeSub), subscribe: vi.fn() },
    });
    storePushRegistration({ version: 1, endpoint: fakeSub.endpoint, userId: USER_A });
    server.use(pushSubscribeFailedHandler);

    await expect(subscribe(USER_A)).resolves.toEqual({ status: 'backend-registration-failed' });

    expect(fakeSub.unsubscribe).not.toHaveBeenCalled();
    expect(readStoredPushRegistration()).toBeNull();
    await reconcileOnLaunch(USER_A);
    expect(readStoredPushRegistration()).toBeNull();
  });

  it('rolls back a newly created subscription and checks an unsuccessful rollback safely', async () => {
    const unsubscribeMock = vi.fn().mockResolvedValue(false);
    const fakeSub = makeFakeSubscription('https://push.example.com/new-failure', unsubscribeMock);
    stubPushSupported({
      pushManager: {
        getSubscription: vi.fn().mockResolvedValue(null),
        subscribe: vi.fn().mockResolvedValue(fakeSub),
      },
    });
    server.use(pushSubscribeFailedHandler);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(subscribe(USER_A)).resolves.toEqual({ status: 'backend-registration-failed' });

    expect(unsubscribeMock).toHaveBeenCalledOnce();
    expect(readStoredPushRegistration()).toBeNull();
    expect(warn).toHaveBeenCalledWith('[push] operation failed', {
      stage: 'browser-subscription-rollback-failed',
      category: 'UnknownError',
    });
    warn.mockRestore();
  });

  it('keeps a pre-existing browser subscription when backend registration fails', async () => {
    const fakeSub = makeFakeSubscription('https://push.example.com/existing');
    stubPushSupported({
      pushManager: { getSubscription: vi.fn().mockResolvedValue(fakeSub), subscribe: vi.fn() },
    });
    server.use(pushSubscribeFailedHandler);

    await expect(subscribe(USER_A)).resolves.toEqual({ status: 'backend-registration-failed' });
    expect(fakeSub.unsubscribe).not.toHaveBeenCalled();
  });
});

describe('preparePushResources', () => {
  it('is idempotent while it resolves and retries after a failure', async () => {
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
  it('returns disabled only after a local unsubscribe resolves true', async () => {
    const fakeSub = makeFakeSubscription('https://push.example.com/disable');
    stubPushSupported({ pushManager: { getSubscription: vi.fn().mockResolvedValue(fakeSub) } });
    storePushRegistration({ version: 1, endpoint: fakeSub.endpoint, userId: USER_A });

    await expect(unsubscribe(USER_A)).resolves.toEqual({ status: 'disabled' });

    expect(fakeSub.unsubscribe).toHaveBeenCalledOnce();
    expect(readStoredPushRegistration()).toBeNull();
  });

  it('does not claim disabled or delete backend state when local unsubscribe resolves false', async () => {
    const fakeSub = makeFakeSubscription(
      'https://push.example.com/false',
      vi.fn().mockResolvedValue(false),
    );
    stubPushSupported({ pushManager: { getSubscription: vi.fn().mockResolvedValue(fakeSub) } });
    storePushRegistration({ version: 1, endpoint: fakeSub.endpoint, userId: USER_A });
    let deleteCalled = false;
    server.use(
      http.delete(`${BASE}/v1/push/subscriptions`, () => {
        deleteCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await expect(unsubscribe(USER_A)).resolves.toEqual({ status: 'browser-unsubscribe-failed' });

    expect(deleteCalled).toBe(false);
    expectRegistration(USER_A, fakeSub.endpoint);

    let postCalled = false;
    server.use(
      http.post(`${BASE}/v1/push/subscriptions`, () => {
        postCalled = true;
        return HttpResponse.json({}, { status: 201 });
      }),
    );
    await reconcileOnLaunch(USER_A);
    expect(postCalled).toBe(false);
  });

  it('does not claim disabled when local unsubscribe rejects', async () => {
    const fakeSub = makeFakeSubscription(
      'https://push.example.com/reject',
      vi.fn().mockRejectedValue(new Error('browser refused')),
    );
    stubPushSupported({ pushManager: { getSubscription: vi.fn().mockResolvedValue(fakeSub) } });
    storePushRegistration({ version: 1, endpoint: fakeSub.endpoint, userId: USER_A });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(unsubscribe(USER_A)).resolves.toEqual({ status: 'browser-unsubscribe-failed' });
    expectRegistration(USER_A, fakeSub.endpoint);
    warn.mockRestore();
  });

  it('cleans a stored current-user endpoint when no browser subscription exists', async () => {
    stubPushSupported({ pushManager: { getSubscription: vi.fn().mockResolvedValue(null) } });
    storePushRegistration({
      version: 1,
      endpoint: 'https://push.example.com/stored',
      userId: USER_A,
    });
    let deletedEndpoint = '';
    server.use(
      http.delete(`${BASE}/v1/push/subscriptions`, async ({ request }) => {
        deletedEndpoint = ((await request.json()) as { endpoint: string }).endpoint;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await expect(unsubscribe(USER_A)).resolves.toEqual({ status: 'disabled' });
    expect(deletedEndpoint).toBe('https://push.example.com/stored');
    expect(readStoredPushRegistration()).toBeNull();
  });

  it('stays disabled after local success even if backend DELETE fails', async () => {
    const fakeSub = makeFakeSubscription('https://push.example.com/offline-delete');
    stubPushSupported({ pushManager: { getSubscription: vi.fn().mockResolvedValue(fakeSub) } });
    storePushRegistration({ version: 1, endpoint: fakeSub.endpoint, userId: USER_A });
    server.use(pushDeleteNetworkErrorHandler);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(unsubscribe(USER_A)).resolves.toEqual({ status: 'disabled' });
    expect(readStoredPushRegistration()).toBeNull();
    warn.mockRestore();
  });
});

describe('reconcileOnLaunch', () => {
  it('forces an initial authenticated upsert even when this user already owns the endpoint', async () => {
    const fakeSub = makeFakeSubscription('https://push.example.com/initial');
    stubPushSupported({ pushManager: { getSubscription: vi.fn().mockResolvedValue(fakeSub) } });
    storePushRegistration({ version: 1, endpoint: fakeSub.endpoint, userId: USER_A });
    let posts = 0;
    server.use(
      http.post(`${BASE}/v1/push/subscriptions`, () => {
        posts += 1;
        return HttpResponse.json({}, { status: 201 });
      }),
    );

    await reconcileOnLaunch(USER_A, true);

    expect(posts).toBe(1);
    expectRegistration(USER_A, fakeSub.endpoint);
  });

  it('forces an upsert for User B when User A owned the same live endpoint', async () => {
    const fakeSub = makeFakeSubscription('https://push.example.com/shared');
    stubPushSupported({ pushManager: { getSubscription: vi.fn().mockResolvedValue(fakeSub) } });
    storePushRegistration({ version: 1, endpoint: fakeSub.endpoint, userId: USER_A });
    let posts = 0;
    server.use(
      http.post(`${BASE}/v1/push/subscriptions`, () => {
        posts += 1;
        return HttpResponse.json({}, { status: 201 });
      }),
    );

    await reconcileOnLaunch(USER_B);

    expect(posts).toBe(1);
    expectRegistration(USER_B, fakeSub.endpoint);
  });

  it('does not treat the legacy bare endpoint as a current-user confirmation', async () => {
    const fakeSub = makeFakeSubscription('https://push.example.com/legacy');
    stubPushSupported({ pushManager: { getSubscription: vi.fn().mockResolvedValue(fakeSub) } });
    localStorage.setItem(STORAGE_KEYS.PUSH_ENDPOINT, fakeSub.endpoint);
    let posts = 0;
    server.use(
      http.post(`${BASE}/v1/push/subscriptions`, () => {
        posts += 1;
        return HttpResponse.json({}, { status: 201 });
      }),
    );

    await reconcileOnLaunch(USER_A);

    expect(posts).toBe(1);
    expectRegistration(USER_A, fakeSub.endpoint);
    expect(localStorage.getItem(STORAGE_KEYS.PUSH_ENDPOINT)).toBeNull();
  });

  it('deletes a stale backend row when the current user has no live subscription', async () => {
    stubPushSupported({ pushManager: { getSubscription: vi.fn().mockResolvedValue(null) } });
    storePushRegistration({
      version: 1,
      endpoint: 'https://push.example.com/gone',
      userId: USER_A,
    });
    let deletes = 0;
    server.use(
      http.delete(`${BASE}/v1/push/subscriptions`, () => {
        deletes += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await reconcileOnLaunch(USER_A);

    expect(deletes).toBe(1);
    expect(readStoredPushRegistration()).toBeNull();
  });

  it('deduplicates only within a user, never across accounts', async () => {
    let resolveSubscription!: (subscription: ReturnType<typeof makeFakeSubscription>) => void;
    const subscriptionPromise = new Promise<ReturnType<typeof makeFakeSubscription>>((resolve) => {
      resolveSubscription = resolve;
    });
    const getSubscription = vi.fn().mockReturnValue(subscriptionPromise);
    stubPushSupported({ pushManager: { getSubscription } });

    const firstA = reconcileOnLaunch(USER_A);
    const secondA = reconcileOnLaunch(USER_A);
    const firstB = reconcileOnLaunch(USER_B);
    resolveSubscription(makeFakeSubscription('https://push.example.com/same'));
    await Promise.all([firstA, secondA, firstB]);

    expect(getSubscription).toHaveBeenCalledTimes(2);
  });
});

describe('detachPushOnLogout', () => {
  it('detaches the backend registration before auth cleanup and keeps a reusable browser subscription', async () => {
    const fakeSub = makeFakeSubscription('https://push.example.com/logout');
    stubPushSupported({ pushManager: { getSubscription: vi.fn().mockResolvedValue(fakeSub) } });
    storePushRegistration({ version: 1, endpoint: fakeSub.endpoint, userId: USER_A });
    let deleted = false;
    server.use(
      http.delete(`${BASE}/v1/push/subscriptions`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await detachPushOnLogout(USER_A);

    expect(deleted).toBe(true);
    expect(fakeSub.unsubscribe).not.toHaveBeenCalled();
    expect(readStoredPushRegistration()).toBeNull();
  });

  it('uses local unsubscribe as the privacy fallback after a backend detach failure', async () => {
    const fakeSub = makeFakeSubscription('https://push.example.com/logout-fallback');
    stubPushSupported({ pushManager: { getSubscription: vi.fn().mockResolvedValue(fakeSub) } });
    storePushRegistration({ version: 1, endpoint: fakeSub.endpoint, userId: USER_A });
    server.use(pushDeleteNetworkErrorHandler);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await detachPushOnLogout(USER_A);

    expect(fakeSub.unsubscribe).toHaveBeenCalledOnce();
    expect(readStoredPushRegistration()).toBeNull();
    warn.mockRestore();
  });

  it('retains the confirmed record when both backend detach and local unsubscribe fail', async () => {
    const fakeSub = makeFakeSubscription(
      'https://push.example.com/logout-retain',
      vi.fn().mockResolvedValue(false),
    );
    stubPushSupported({ pushManager: { getSubscription: vi.fn().mockResolvedValue(fakeSub) } });
    storePushRegistration({ version: 1, endpoint: fakeSub.endpoint, userId: USER_A });
    server.use(pushDeleteNetworkErrorHandler);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await detachPushOnLogout(USER_A);

    expectRegistration(USER_A, fakeSub.endpoint);
    warn.mockRestore();
  });
});

describe('isPushNudgeEligible', () => {
  it('allows granted-permission retry state after a reload and isolates dismissal', () => {
    expect(
      isPushNudgeEligible({
        support: 'supported',
        permission: 'granted',
        subscribed: false,
        dismissed: false,
        retryPending: true,
      }),
    ).toBe(true);
    expect(
      isPushNudgeEligible({
        support: 'supported',
        permission: 'granted',
        subscribed: false,
        dismissed: true,
        retryPending: true,
      }),
    ).toBe(false);
  });
});
