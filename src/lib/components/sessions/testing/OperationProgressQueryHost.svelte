<script lang="ts">
  import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
  import OperationProgress from '../OperationProgress.svelte';

  let {
    queryClient,
    sessionId,
    operationId,
  }: {
    queryClient: QueryClient;
    sessionId: string;
    operationId: string;
  } = $props();
</script>

<QueryClientProvider client={queryClient}>
  <OperationProgress {sessionId} {operationId} />
</QueryClientProvider>
