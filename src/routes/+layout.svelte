<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
  import { initTheme } from '$lib/stores/theme';
  import '../app.css';

  let { children }: { children: Snippet } = $props();

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5, // 5 minutes
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });

  onMount(() => {
    const cleanup = initTheme();
    return cleanup;
  });
</script>

<svelte:head>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link
    href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=JetBrains+Mono:wght@100..800&display=swap"
    rel="stylesheet"
  />
  <title>Apex — AI Content Studio</title>
</svelte:head>

<QueryClientProvider client={queryClient}>
  {@render children()}
</QueryClientProvider>
