<script lang="ts">
  import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
  import GroupSheet from './GroupSheet.svelte';

  let {
    jobId,
    initialAssetRef = null,
    onclose,
    onOpenAsset,
    onQueryClient,
  }: {
    jobId: string;
    initialAssetRef?: string | null;
    onclose: () => void;
    onOpenAsset?: (assetRef: string) => void;
    onQueryClient?: (client: QueryClient) => void;
  } = $props();

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  onQueryClient?.(queryClient);
</script>

<QueryClientProvider client={queryClient}>
  <GroupSheet {jobId} {initialAssetRef} {onclose} {onOpenAsset} />
</QueryClientProvider>
