import { addToast } from '$lib/stores/toasts';
import * as m from '$paraglide/messages';
import { SaveActivationError } from './types';

/** Shared toast policy for a failed saveMedia() call. A 'cancelled' outcome never reaches this — it isn't a throw. */
export function toastSaveError(error: unknown): void {
  if (error instanceof SaveActivationError) {
    addToast({ type: 'info', message: m.library_share_retry() });
  } else {
    addToast({ type: 'error', message: m.library_download_error() });
  }
}
