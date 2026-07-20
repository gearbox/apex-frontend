import { generationDraftIsDirty } from '$lib/stores/generation';
import { setAppDirty } from '$lib/services/appDirty';

let stopWatching: (() => void) | undefined;

/**
 * Registers the singleton generation draft with the global reload guard.
 * The root layout owns this lifetime, so client-side navigation away from
 * Create can never make an in-memory draft appear safe to discard.
 */
export function initGenerationDraftGuard(): () => void {
  if (stopWatching) return stopWatching;

  const unsubscribe = generationDraftIsDirty.subscribe((dirty) => {
    setAppDirty('generation-draft', dirty);
  });

  stopWatching = () => {
    unsubscribe();
    setAppDirty('generation-draft', false);
    stopWatching = undefined;
  };
  return stopWatching;
}
