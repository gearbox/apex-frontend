<script lang="ts">
  import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
  import type { GpuSessionResponse } from '$lib/api/sessions';
  import StopSessionModal from '../StopSessionModal.svelte';

  let {
    queryClient,
    sessionId,
    onStopped = () => {},
    onClose = () => {},
  }: {
    queryClient: QueryClient;
    sessionId: string;
    onStopped?: (session: GpuSessionResponse) => void;
    onClose?: () => void;
  } = $props();
</script>

<QueryClientProvider client={queryClient}>
  <StopSessionModal {sessionId} {onStopped} {onClose} />
</QueryClientProvider>
