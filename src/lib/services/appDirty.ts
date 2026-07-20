import { derived, writable } from 'svelte/store';

/**
 * A small cross-screen contract for client-only work that cannot safely be
 * recreated after an application-shell reload. Sources own their own cleanup.
 */
const dirtySources = writable<ReadonlySet<string>>(new Set());

export const appDirtySources = { subscribe: dirtySources.subscribe };
export const appIsDirty = derived(dirtySources, (sources) => sources.size > 0);

export function setAppDirty(source: string, dirty: boolean): () => void {
  if (!source) return () => {};

  dirtySources.update((current) => {
    const next = new Set(current);
    if (dirty) next.add(source);
    else next.delete(source);
    return next;
  });

  // A page can be destroyed while still dirty. The returned release makes the
  // registration safe to use from Svelte effects and onDestroy callbacks.
  return () => {
    dirtySources.update((current) => {
      if (!current.has(source)) return current;
      const next = new Set(current);
      next.delete(source);
      return next;
    });
  };
}

export function isAppDirty(): boolean {
  let dirty = false;
  const unsubscribe = appIsDirty.subscribe((value) => {
    dirty = value;
  });
  unsubscribe();
  return dirty;
}
