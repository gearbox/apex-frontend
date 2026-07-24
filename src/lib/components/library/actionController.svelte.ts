import { SvelteSet } from 'svelte/reactivity';

export type ActionGroup = 'save' | 'navigate';

/** Tracks per-action pending state while serializing navigation actions that would otherwise
 * race each other. Save actions remain independent, but a second tap on the same one is ignored. */
export function createActionController() {
  const running = new SvelteSet<string>();
  const groups = new SvelteSet<ActionGroup>();

  return {
    isPending(key: string): boolean {
      return running.has(key);
    },
    isGroupPending(group: ActionGroup): boolean {
      return groups.has(group);
    },
    async run(key: string, group: ActionGroup, fn: () => void | Promise<void>): Promise<void> {
      if (running.has(key) || (group === 'navigate' && groups.has(group))) return;

      running.add(key);
      if (group === 'navigate') groups.add(group);

      try {
        await fn();
      } finally {
        running.delete(key);
        if (group === 'navigate') groups.delete(group);
      }
    },
  };
}

export type ActionController = ReturnType<typeof createActionController>;
