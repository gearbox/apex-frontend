<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
  import { initTheme, setTheme } from '$lib/stores/theme';
  import { productInfo } from '$lib/stores/product';
  import { initNetworkListener } from '$lib/stores/network';
  import { initPwaInstallListener } from '$lib/stores/pwaInstall';
  import NetworkToastWatcher from '$lib/components/ui/NetworkToastWatcher.svelte';
  import { API_BASE_URL, STORAGE_KEYS } from '$lib/utils/constants';
  import { isBrowser } from '$lib/utils/env';
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

  // Derive app title from productInfo for <title> tag
  let appTitle = $derived($productInfo?.display_name ?? 'Apex');

  onMount(() => {
    const cleanups: (() => void)[] = [];

    cleanups.push(initTheme());
    cleanups.push(initNetworkListener());
    cleanups.push(initPwaInstallListener());

    // Fetch product info — public endpoint, no auth required (fire and forget)
    (async () => {
      try {
        const headers: Record<string, string> = {};
        if (import.meta.env.DEV) {
          headers['X-Product-Id'] = import.meta.env.VITE_PRODUCT_ID || 'vex';
        }
        const res = await fetch(`${API_BASE_URL}/v1/auth/product-info`, { headers });
        if (res.ok) {
          const info = await res.json();
          productInfo.set(info);

          // Apply product-based default theme if user has no stored preference yet
          const hasStoredPrefs =
            isBrowser() && localStorage.getItem(STORAGE_KEYS.THEME_PREFS) !== null;
          if (!hasStoredPrefs && info.product === 'synthara') {
            setTheme('frost');
          }
        }
      } catch {
        // Non-critical: app works without product info (defaults to vex branding)
      }
    })();

    return () => cleanups.forEach((fn) => fn?.());
  });
</script>

<svelte:head>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
  <link
    href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=JetBrains+Mono:wght@100..800&display=swap"
    rel="stylesheet"
  />
  <title>{appTitle} — AI Content Studio</title>
</svelte:head>

<QueryClientProvider client={queryClient}>
  <NetworkToastWatcher />
  {@render children()}
</QueryClientProvider>
