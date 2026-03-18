import { writable, derived } from 'svelte/store';

export type EventStreamStatus = 'disconnected' | 'connecting' | 'connected' | 'fallback';

const status = writable<EventStreamStatus>('disconnected');

export const eventStreamStatus = { subscribe: status.subscribe };

export function setEventStreamStatus(s: EventStreamStatus): void {
  status.set(s);
}

/** True when SSE is actively connected and delivering events */
export const isSSEConnected = derived(status, ($s) => $s === 'connected');

/** True when SSE failed and we're relying on polling */
export const isSSEFallback = derived(status, ($s) => $s === 'fallback');
