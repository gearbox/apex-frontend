/**
 * Tracks which library action is currently running so a slow navigation action or save can't
 * be double-fired by a second tap. A second `run()` call while one is already pending is a
 * no-op — not a second share sheet, not a second navigation.
 */
export function createActionController() {
  let runningKey = $state<string | null>(null);

  return {
    get pending(): boolean {
      return runningKey !== null;
    },
    isPending(key: string): boolean {
      return runningKey === key;
    },
    async run(key: string, fn: () => void | Promise<void>): Promise<void> {
      if (runningKey !== null) return;
      runningKey = key;
      try {
        await fn();
      } finally {
        runningKey = null;
      }
    },
  };
}

export type ActionController = ReturnType<typeof createActionController>;
