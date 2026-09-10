<script lang="ts">
  import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
  import type { GpuSessionListItemResponse } from '$lib/api/sessions';
  import type { ProvidersResponse } from '$lib/queries/providers';
  import SessionCardContainer from './SessionCardContainer.svelte';

  let {
    queryClient,
    session,
    providers = undefined,
    onStop = () => {},
  }: {
    queryClient: QueryClient;
    session: GpuSessionListItemResponse;
    providers?: ProvidersResponse;
    onStop?: (id: string) => void;
  } = $props();
</script>

<QueryClientProvider client={queryClient}>
  <SessionCardContainer {session} {providers} {onStop} />
</QueryClientProvider>
