import {
  reportPushFailure,
  setPushServiceWorkerRegistration,
} from '$lib/services/pushNotifications';
import { setPwaUpdateServiceWorkerRegistration } from '$lib/services/pwaUpdate';

interface RegisterSWOptions {
  immediate?: boolean;
  onRegisteredSW?: (
    swScriptUrl: string,
    registration: ServiceWorkerRegistration | undefined,
  ) => void;
  onRegisterError?: (error: unknown) => void;
}

type RegisterSW = (options: RegisterSWOptions) => unknown;

/**
 * The PWA module is loaded dynamically so an unavailable virtual module cannot produce an
 * unhandled rejection. Push preparation still falls back to its bounded registration lookup.
 */
export async function registerPwaServiceWorker(
  loadRegisterSW: () => Promise<{ registerSW: RegisterSW }>,
): Promise<void> {
  try {
    const { registerSW } = await loadRegisterSW();
    try {
      registerSW({
        immediate: true,
        onRegisteredSW: (_swScriptUrl, registration) => {
          if (registration) {
            // Both consumers receive the same registration from the one
            // existing registerSW() path, so push preparation and update
            // checks cannot race a second service-worker registration.
            setPushServiceWorkerRegistration(registration);
            setPwaUpdateServiceWorkerRegistration(registration);
          }
        },
        onRegisterError: (error) => reportPushFailure('pwa-registration', error),
      });
    } catch (error) {
      reportPushFailure('pwa-registration-setup', error);
    }
  } catch (error) {
    reportPushFailure('pwa-registration-import', error);
  }
}
