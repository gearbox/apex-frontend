<script lang="ts">
  import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
  import AssetDetailsSheet from './AssetDetailsSheet.svelte';

  let {
    assetRef,
    jobIdHint = null,
    onclose = () => {},
    onnavigate,
    hasPrev = false,
    hasNext = false,
    fullscreen = false,
    onfullscreenchange,
  }: {
    assetRef: string;
    jobIdHint?: string | null;
    onclose?: () => void;
    onnavigate?: (direction: 'prev' | 'next') => void;
    hasPrev?: boolean;
    hasNext?: boolean;
    fullscreen?: boolean;
    onfullscreenchange?: (value: boolean) => void;
  } = $props();

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 } },
  });
</script>

<QueryClientProvider client={queryClient}>
  <AssetDetailsSheet
    {assetRef}
    {jobIdHint}
    {onclose}
    {onnavigate}
    {hasPrev}
    {hasNext}
    {fullscreen}
    {onfullscreenchange}
  />
</QueryClientProvider>
