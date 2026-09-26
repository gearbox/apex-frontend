<script module lang="ts">
  import type { Component } from 'svelte';
  import type { QueryClient } from '@tanstack/svelte-query';

  type HostedComponent = Component<Record<string, unknown>>;

  /** Type-checks `props` against `component` at the call site, then erases it for the host. */
  export function hostProps<Props extends Record<string, unknown>>(
    queryClient: QueryClient,
    component: Component<Props>,
    props: Props,
  ): { queryClient: QueryClient; component: HostedComponent; props: Record<string, unknown> } {
    return { queryClient, component: component as unknown as HostedComponent, props };
  }
</script>

<script lang="ts">
  import { QueryClientProvider } from '@tanstack/svelte-query';

  let {
    queryClient,
    component: Child,
    props,
  }: {
    queryClient: QueryClient;
    component: HostedComponent;
    props: Record<string, unknown>;
  } = $props();
</script>

<QueryClientProvider client={queryClient}>
  <Child {...props} />
</QueryClientProvider>
