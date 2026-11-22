import { get, writable, type Readable } from 'svelte/store';
import apiClient from '$lib/api/client';

export type Capability = 'studio';
export type CapabilityState = 'unknown' | 'available' | 'unavailable';
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
        return;
      }
      console.warn('studio.capability.probe_failed', { status });
      if (attempt === 0) await new Promise<void>((resolve) => setTimeout(resolve, retryDelayMs));
    }
  })().finally(() => {
    pending = undefined;
  });
  return pending;
}
export function isCapabilityAvailable(state: CapabilityState): boolean {
  return state === 'available';
}
