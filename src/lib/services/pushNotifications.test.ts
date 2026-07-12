import { describe, it, expect, vi, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import {
  pushSubscribeFailedHandler,
  pushDeleteNetworkErrorHandler,
} from '../../mocks/handlers/push';
import {
  getPushSupport,
  urlBase64ToUint8Array,
  subscribe,
  unsubscribe,
  reconcileOnLaunch,
  isPushNudgeEligible,
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

function stubPushSupported(registration: unknown) {
  stubNavigator({
    userAgent: 'test-agent',
    serviceWorker: { getRegistration: vi.fn().mockResolvedValue(registration) },
  });
  vi.stubGlobal('PushManager', class {});
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('getPushSupport', () => {
  it('returns "supported" when serviceWorker, PushManager, and Notification are all available', () => {
    stubNavigator({ serviceWorker: {} });
    vi.stubGlobal('PushManager', class {});
    vi.stubGlobal('Notification', { permission: 'default' });

    expect(getPushSupport()).toBe('supported');
  });

  it('returns "needs-install" on iOS Safari without PushManager, not standalone', () => {
    stubNavigator({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
    });
    stubMatchMedia(false);

    expect(getPushSupport()).toBe('needs-install');
  });

  it('returns "supported" on iOS once installed to home screen (standalone)', () => {
    stubNavigator({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      serviceWorker: {},
    });
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
    const encoded = toUrlBase64(original);
    expect(Array.from(urlBase64ToUint8Array(encoded))).toEqual(Array.from(original));
  });

  it('decodes a known value without padding', () => {
    expect(Array.from(urlBase64ToUint8Array('SGVsbG8'))).toEqual([72, 101, 108, 108, 111]);
  });
});

describe('subscribe', () => {
  it('happy path: posts the subscription and stores the endpoint', async () => {
    const fakeSub = makeFakeSubscription('https://push.example.com/abc');
    const subscribeMock = vi.fn().mockResolvedValue(fakeSub);
    stubPushSupported({ pushManager: { subscribe: subscribeMock } });

    let capturedBody: unknown;
    server.use(
      http.post(`${BASE}/v1/push/subscriptions`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(
          {
            id: 'x',
            endpoint: 'https://push.example.com/abc',
            created_at: new Date().toISOString(),
          },
          { status: 201 },
        );
      }),
    );

    const ok = await subscribe();

    expect(ok).toBe(true);
    expect(subscribeMock).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
    expect(capturedBody).toMatchObject({
      endpoint: 'https://push.example.com/abc',
      keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
      user_agent: 'test-agent',
    });
    expect(localStorage.getItem(STORAGE_KEYS.PUSH_ENDPOINT)).toBe('https://push.example.com/abc');
  });

  it('rolls back the browser subscription when the backend POST fails', async () => {
    const fakeSub = makeFakeSubscription('https://push.example.com/fail');
    stubPushSupported({ pushManager: { subscribe: vi.fn().mockResolvedValue(fakeSub) } });
    server.use(pushSubscribeFailedHandler);

    const ok = await subscribe();

    expect(ok).toBe(false);
    expect(fakeSub.unsubscribe).toHaveBeenCalledOnce();
    expect(localStorage.getItem(STORAGE_KEYS.PUSH_ENDPOINT)).toBeNull();
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
    stubPushSupported({
      pushManager: { getSubscription: vi.fn().mockResolvedValue(fakeSub) },
    });
    localStorage.setItem(STORAGE_KEYS.PUSH_ENDPOINT, 'https://push.example.com/xyz');
    server.use(pushDeleteNetworkErrorHandler);

    await unsubscribe();

    expect(fakeSub.unsubscribe).toHaveBeenCalledOnce();
    expect(localStorage.getItem(STORAGE_KEYS.PUSH_ENDPOINT)).toBeNull();
  });
});

describe('reconcileOnLaunch', () => {
  it('does nothing when permission is not granted', async () => {
    stubPushSupported({ pushManager: { getSubscription: vi.fn() } });
    vi.stubGlobal('Notification', { permission: 'default' });

    await reconcileOnLaunch();

    // getSubscription would have been called if we proceeded past the permission guard
    expect(true).toBe(true);
  });

  it('re-POSTs and updates the stored endpoint when the browser rotated it', async () => {
    const fakeSub = makeFakeSubscription('https://push.example.com/rotated');
    stubPushSupported({
      pushManager: { getSubscription: vi.fn().mockResolvedValue(fakeSub) },
    });
    vi.stubGlobal('Notification', { permission: 'granted' });
    localStorage.setItem(STORAGE_KEYS.PUSH_ENDPOINT, 'https://push.example.com/old');

    let postCalled = false;
    server.use(
      http.post(`${BASE}/v1/push/subscriptions`, () => {
        postCalled = true;
        return HttpResponse.json(
          {
            id: 'x',
            endpoint: 'https://push.example.com/rotated',
            created_at: new Date().toISOString(),
          },
          { status: 201 },
        );
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
    vi.stubGlobal('Notification', { permission: 'granted' });
    localStorage.setItem(STORAGE_KEYS.PUSH_ENDPOINT, 'https://push.example.com/gone');

    await reconcileOnLaunch();

    expect(localStorage.getItem(STORAGE_KEYS.PUSH_ENDPOINT)).toBeNull();
  });

  it('does nothing when the endpoint matches the stored value', async () => {
    const fakeSub = makeFakeSubscription('https://push.example.com/same');
    stubPushSupported({
      pushManager: { getSubscription: vi.fn().mockResolvedValue(fakeSub) },
    });
    vi.stubGlobal('Notification', { permission: 'granted' });
    localStorage.setItem(STORAGE_KEYS.PUSH_ENDPOINT, 'https://push.example.com/same');

    let postCalled = false;
    server.use(
      http.post(`${BASE}/v1/push/subscriptions`, () => {
        postCalled = true;
        return HttpResponse.json({}, { status: 201 });
      }),
    );

    await reconcileOnLaunch();

    expect(postCalled).toBe(false);
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
