import { get } from 'svelte/store';
import { afterEach, describe, expect, it } from 'vitest';
import { appIsDirty } from './appDirty';
import { initGenerationDraftGuard } from './generationDraftGuard';
import { generationStore, markGenerationDraftSaved } from '$lib/stores/generation';

describe('generation draft guard', () => {
  let dispose: (() => void) | undefined;

  afterEach(() => {
    dispose?.();
    dispose = undefined;
    generationStore.reset();
  });

  it('continues protecting the singleton draft after Create would have unmounted', () => {
    dispose = initGenerationDraftGuard();
    generationStore.setPrompt('keep this draft');
    expect(get(appIsDirty)).toBe(true);

    // No route-local cleanup exists: the root guard continues to own it.
    markGenerationDraftSaved();
    expect(get(appIsDirty)).toBe(false);
  });
});
