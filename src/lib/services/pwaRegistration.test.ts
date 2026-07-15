import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/services/pushNotifications', () => ({
  reportPushFailure: vi.fn(),
  setPushServiceWorkerRegistration: vi.fn(),
}));

import { registerPwaServiceWorker } from './pwaRegistration';
import * as pushNotifications from '$lib/services/pushNotifications';

describe('registerPwaServiceWorker', () => {
  beforeEach(() => vi.clearAllMocks());

  it('handles a rejected dynamic import without an unhandled rejection', async () => {
    await expect(
      registerPwaServiceWorker(() => Promise.reject(new Error('virtual module unavailable'))),
    ).resolves.toBeUndefined();

    expect(pushNotifications.reportPushFailure).toHaveBeenCalledWith(
      'pwa-registration-import',
      expect.any(Error),
    );
  });

  it('handles synchronous registerSW setup failures', async () => {
    await expect(
      registerPwaServiceWorker(async () => ({
        registerSW: () => {
          throw new Error('setup failed');
        },
      })),
    ).resolves.toBeUndefined();

    expect(pushNotifications.reportPushFailure).toHaveBeenCalledWith(
      'pwa-registration-setup',
      expect.any(Error),
    );
  });

  it('captures a successful PWA registration for push preparation', async () => {
    const registration = { pushManager: {} } as ServiceWorkerRegistration;

    await registerPwaServiceWorker(async () => ({
      registerSW: ({ onRegisteredSW }) => onRegisteredSW?.('/sw.js', registration),
    }));

    expect(pushNotifications.setPushServiceWorkerRegistration).toHaveBeenCalledWith(registration);
  });
});
