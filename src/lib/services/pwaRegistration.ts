import {
  reportPushFailure,
  setPushServiceWorkerRegistration,
} from '$lib/services/pushNotifications';

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
          if (registration) setPushServiceWorkerRegistration(registration);
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
