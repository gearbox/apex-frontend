<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { afterNavigate } from '$app/navigation';
  import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
  import { pwaInfo } from 'virtual:pwa-info';
  import { initTheme, setTheme } from '$lib/stores/theme';
  import { productInfo } from '$lib/stores/product';
  import { initNetworkListener } from '$lib/stores/network';
  import { initPwaInstallListener } from '$lib/stores/pwaInstall';
  import NetworkToastWatcher from '$lib/components/ui/NetworkToastWatcher.svelte';
  import { locale } from '$lib/stores/locale';
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

  afterNavigate(() => {
    window.scrollTo(0, 0);
  });

  onMount(() => {
    const cleanups: (() => void)[] = [];

    cleanups.push(initTheme());
    cleanups.push(initNetworkListener());
    cleanups.push(initPwaInstallListener());

    if (pwaInfo) {
      import('virtual:pwa-register').then(({ registerSW }) => {
        registerSW({ immediate: true });
      });
    }

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
  {#key $locale}
    {@render children()}
  {/key}
</QueryClientProvider>
