---
name: Svelte 5 + TanStack Svelte-query v5 pattern
description: How to correctly use TanStack Svelte-query v5 with Svelte 5 runes — query results accessed without $ prefix
type: feedback
---

Always use the Svelte 5 runes pattern with TanStack Svelte-query v5:

1. `createQuery` and `createMutation` take an **accessor function**, not a plain object:
   ```ts
   // ✅ Correct
   const q = createQuery(() => myQueryOptions(params));
   const m = createMutation(() => myMutationOptions(queryClient));

   // ❌ Wrong — plain object, not an accessor
   const q = createQuery(myQueryOptions(params));
   ```

2. Query/mutation results are **reactive proxy objects** — access fields **without** the `$` prefix:
   ```svelte
   <!-- ✅ Correct -->
   {#if q.isPending}...{/if}
   {#if q.data}...{/if}
   await m.mutateAsync(payload);
   m.isPending

   <!-- ❌ Wrong — $ prefix makes Svelte treat it as a store (breaks) -->
   {#if $q.isPending}...{/if}
   ```

3. For reactive query params driven by `$state`, wrap with an accessor so reactivity flows:
   ```ts
   let filter = $state('');
   const q = createQuery(() => queryOptions({ queryKey: ['items', filter], ... }));
   ```

4. Use `untrack(() => value)` from `svelte` when snapshotting stable props inside modals/components to suppress false-positive reactive-capture warnings from Svelte 5.

**Why:** TanStack Svelte-query v5 returns a Svelte 5 reactive proxy, not a Svelte store. Using `$` prefix causes "needs a subscribe method" errors. Discovered during the admin section implementation (March 2026).

**How to apply:** Every time you write new Svelte components that use `createQuery` or `createMutation`, follow the accessor + no-$ pattern above from the start.
