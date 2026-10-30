<script lang="ts" generics="T extends object">
  import type { Component } from 'svelte';
  import { QueryClientProvider, type QueryClient } from '@tanstack/svelte-query';
  let {
    component: View,
    componentProps,
    client,
  }: { component: Component<T>; componentProps: T; client: QueryClient } = $props();
</script>

<QueryClientProvider {client}><View {...componentProps} /></QueryClientProvider>
