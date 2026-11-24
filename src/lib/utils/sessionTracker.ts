import { onDestroy } from 'svelte';

export interface Session {
  readonly active: boolean;
}

export interface SessionTracker {
  capture(): Session;
  invalidate(): void;
}

export function createSessionTracker(): SessionTracker {
  let generation = 0;
  return {
    capture() {
      const id = generation;
      return {
        get active() {
          return id === generation;
        },
      };
    },
    invalidate() {
      generation += 1;
    },
  };
}

export function componentSession(): SessionTracker {
  const tracker = createSessionTracker();
  onDestroy(tracker.invalidate);
  return tracker;
}
