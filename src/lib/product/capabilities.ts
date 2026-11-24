import { get, writable, type Readable } from 'svelte/store';
import apiClient from '$lib/api/client';

export type Capability = 'studio';
export type CapabilityState = 'unknown' | 'available' | 'unavailable' | 'unreachable';
const studio = writable<CapabilityState>('unknown');
export const studioCapability: Readable<CapabilityState> = { subscribe: studio.subscribe };
type Probe = () => Promise<{ status: number }>;
const defaultProbe: Probe = async () => {
  const { response } = await apiClient.GET('/v1/studio/artists', {
    params: { query: { limit: 1 } },
  });
  return { status: response.status };
};
let pending: Promise<void> | undefined;
let attempted = false;
let firstAttemptFinished = false;
const firstAttemptListeners = new Set<() => void>();
function finishFirstAttempt() {
  firstAttemptFinished = true;
  for (const listener of firstAttemptListeners) listener();
  firstAttemptListeners.clear();
}

/** Probe once per tab, sharing concurrent calls and retrying transient failures once. */
export function probeStudio(probe: Probe = defaultProbe, retryDelayMs = 30_000): Promise<void> {
  if (pending) return pending;
  if (attempted || get(studio) !== 'unknown') return Promise.resolve();
  attempted = true;
  pending = (async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      let status = 0;
      try {
        status = (await probe()).status;
      } catch {
        /* A network failure is transient. */
      }
      if (status === 200 || status === 404) {
        studio.set(status === 200 ? 'available' : 'unavailable');
        if (attempt === 0) finishFirstAttempt();
        return;
      }
      if (attempt === 0) finishFirstAttempt();
      console.warn('studio.capability.probe_failed', { status });
      if (attempt === 0) await new Promise<void>((resolve) => setTimeout(resolve, retryDelayMs));
    }
    studio.set('unreachable');
  })().finally(() => {
    pending = undefined;
  });
  return pending;
}

/** Retry an exhausted probe after an explicit user action. */
export function retryStudioProbe(
  probe: Probe = defaultProbe,
  retryDelayMs = 30_000,
): Promise<void> {
  if (get(studio) !== 'unreachable') return Promise.resolve();
  attempted = false;
  firstAttemptFinished = false;
  studio.set('unknown');
  return probeStudio(probe, retryDelayMs);
}

export function isCapabilityAvailable(state: CapabilityState): boolean {
  return state === 'available';
}

export function setStudioCapabilityForTest(state: CapabilityState): void {
  studio.set(state);
}

/** Wait no longer than the first attempt or the caller's deadline. */
export function settleCapability(
  capability: Capability,
  timeoutMs = 2500,
): Promise<CapabilityState> {
  if (capability !== 'studio') return Promise.resolve('unknown');
  const current = get(studio);
  if (current !== 'unknown' || firstAttemptFinished) return Promise.resolve(current);
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      firstAttemptListeners.delete(finish);
      resolve(get(studio));
    };
    const timer = setTimeout(finish, timeoutMs);
    firstAttemptListeners.add(finish);
    void probeStudio();
  });
}
