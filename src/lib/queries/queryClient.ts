import { QueryClient } from '@tanstack/svelte-query';

/**
 * A module-level singleton is safe here ONLY because the app runs with `ssr = false`
 * (see src/routes/+layout.ts) — there is exactly one server-less browser instance per
 * tab, so this module never straddles multiple concurrent users the way it would under SSR.
 *
 * Lazily constructed: `resetAppState.ts` (imported by `stores/auth.ts`, imported by most of the
 * app) must not construct a real QueryClient merely by being imported — several component tests
 * replace '@tanstack/svelte-query' with a partial mock for isolated rendering and would fail at
 * import time otherwise. Construction happens on first real use (the root layout's
 * QueryClientProvider, or a test that calls getQueryClient() directly).
 */
let instance: QueryClient | undefined;

export function getQueryClient(): QueryClient {
  if (!instance) {
    instance = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 1000 * 60 * 5, // 5 minutes
          retry: 1,
          refetchOnWindowFocus: false,
        },
      },
    });
  }
  return instance;
}

/** Drops every cached query result. No-ops if the client was never constructed. */
export function resetQueryCache(): void {
  instance?.clear();
}
