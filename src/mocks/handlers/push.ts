import { http, HttpResponse } from 'msw';
import { MOCK_BASE_URL as BASE } from '../config';

/**
 * A structurally valid base64url string (mirrors a real 65-byte uncompressed EC point,
 * like an actual VAPID key) — a hand-picked string risks an invalid base64 length,
 * which urlBase64ToUint8Array() would (correctly) reject.
 */
function makeMockVapidPublicKey(): string {
  const bytes = new Uint8Array(65);
  bytes[0] = 4;
  for (let i = 1; i < bytes.length; i++) bytes[i] = i % 256;
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const MOCK_VAPID_PUBLIC_KEY = makeMockVapidPublicKey();

export const pushHandlers = [
  http.get(`${BASE}/v1/push/vapid-public-key`, () =>
    HttpResponse.json({ public_key: MOCK_VAPID_PUBLIC_KEY }),
  ),

  http.post(`${BASE}/v1/push/subscriptions`, () =>
    HttpResponse.json(
      {
        id: 'push_sub_mock_001',
        endpoint: 'https://push.example.com/subscription/mock-001',
        created_at: new Date().toISOString(),
      },
      { status: 201 },
    ),
  ),

  http.delete(`${BASE}/v1/push/subscriptions`, () => new HttpResponse(null, { status: 204 })),
];

export const pushSubscribeFailedHandler = http.post(`${BASE}/v1/push/subscriptions`, () =>
  HttpResponse.json({ status_code: 400, detail: 'Invalid subscription' }, { status: 400 }),
);

/** Simulates a network failure (not just a 4xx) to exercise the offline-tolerant unsubscribe path. */
export const pushDeleteNetworkErrorHandler = http.delete(`${BASE}/v1/push/subscriptions`, () =>
  HttpResponse.error(),
);
