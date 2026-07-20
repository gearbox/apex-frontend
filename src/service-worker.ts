/// <reference lib="webworker" />
export {};

// SvelteKit's default tsconfig excludes src/service-worker.ts from the main
// (DOM-lib) program, so the webworker lib reference above doesn't conflict —
// Vite/esbuild still transpiles and bundles this file normally.

import { clientsClaim } from 'workbox-core';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
  type PrecacheEntry,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import {
  PWA_BUILD_INFO,
  PWA_GET_BUILD_INFO,
  isMatchingPwaActivationMessage,
  isPwaClientToWorkerMessage,
} from './lib/pwa/protocol';

declare const __BUILD_SHA__: string;

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<PrecacheEntry | string>;
};

/* ─── Lifecycle ───
 *
 * A new worker must remain waiting while an existing page may hold an
 * unrecoverable draft. Do not accept generic SKIP_WAITING messages: an older
 * auto-update client can still send one during the transition release.
 */
clientsClaim();

self.addEventListener('message', (event) => {
  const data: unknown = event.data;
  if (!isPwaClientToWorkerMessage(data)) return;

  if (data.type === PWA_GET_BUILD_INFO) {
    event.ports[0]?.postMessage({ type: PWA_BUILD_INFO, buildSha: __BUILD_SHA__ });
    return;
  }

  if (isMatchingPwaActivationMessage(data, __BUILD_SHA__)) {
    event.waitUntil(self.skipWaiting());
  }
});

/* ─── Precaching ─── */
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

/* ─── SPA navigation fallback — mirrors the previous generateSW config exactly ─── */
const NAVIGATE_FALLBACK_DENYLIST = [/^\/v1\//, /^\/api\//, /^\/docs\//];

registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/'), {
    denylist: NAVIGATE_FALLBACK_DENYLIST,
  }),
);

/* ─── Runtime cache: billing packages/pricing — same cache name + TTL as before ─── */
registerRoute(
  /\/v1\/billing\/(packages|pricing)/,
  new StaleWhileRevalidate({
    cacheName: 'billing-cache',
    plugins: [new ExpirationPlugin({ maxAgeSeconds: 3600 })],
  }),
);

/* ─── Web Push ─── */

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  category?: 'job' | 'gpu_credit' | 'system' | 'balance';
  level?: 'info' | 'warning' | 'critical';
}

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload: PushPayload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  const url = payload.url ?? '/';

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      data: { url },
      icon: '/icon-192.png',
      badge: '/icon-192.png',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? '/';

  event.waitUntil(
    (async () => {
      const clientsList = (await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })) as WindowClient[];

      const existing = clientsList[0];
      if (existing) {
        await existing.focus();
        await existing.navigate(url);
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});

// pushsubscriptionchange fires when the browser silently rotates the push
// subscription endpoint (e.g. after key rotation or extended inactivity).
// The service worker has no access to the user's Bearer token, so it cannot
// call the authenticated POST /v1/push/subscriptions endpoint from here.
// Re-sync instead happens via reconcileOnLaunch() in pushNotifications.ts,
// invoked once from the authenticated root layout, which compares the live
// browser subscription against the last endpoint we POSTed and re-registers
// it if they've diverged.
self.addEventListener('pushsubscriptionchange', () => {});
