<script lang="ts">
  import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
  import AssetDetailsSheet from './AssetDetailsSheet.svelte';

  let {
    assetRef,
    jobIdHint = null,
    onclose = () => {},
  }: {
    assetRef: string;
    jobIdHint?: string | null;
    onclose?: () => void;
  } = $props();

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
</script>

<QueryClientProvider client={queryClient}>
  <AssetDetailsSheet {assetRef} {jobIdHint} {onclose} />
</QueryClientProvider>
