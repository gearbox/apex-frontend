import { isBrowser } from '$lib/utils/env';
import { STORAGE_KEYS } from '$lib/utils/constants';

function readStored(): boolean {
  if (!isBrowser()) return false;
  return localStorage.getItem(STORAGE_KEYS.VPDEBUG) === '1';
}

class ViewportDebugState {
  enabled = $state(readStored());

  set(value: boolean): void {
    this.enabled = value;
    if (!isBrowser()) return;
    if (value) {
      localStorage.setItem(STORAGE_KEYS.VPDEBUG, '1');
    } else {
      localStorage.removeItem(STORAGE_KEYS.VPDEBUG);
    }
  }

  toggle(): void {
    this.set(!this.enabled);
  }
}

export const viewportDebug = new ViewportDebugState();
