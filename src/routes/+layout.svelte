<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { afterNavigate } from '$app/navigation';
  import { QueryClientProvider } from '@tanstack/svelte-query';
  import { getQueryClient } from '$lib/queries/queryClient';
  import { pwaInfo } from 'virtual:pwa-info';
  import { initTheme, setTheme } from '$lib/stores/theme';
  import { productInfo } from '$lib/stores/product';
  import { initNetworkListener } from '$lib/stores/network';
  import { initPwaInstallListener } from '$lib/stores/pwaInstall';
  import NetworkToastWatcher from '$lib/components/ui/NetworkToastWatcher.svelte';
  import ViewportDebug from '$lib/components/debug/ViewportDebug.svelte';
  import { locale } from '$lib/stores/locale';
  import { API_BASE_URL, STORAGE_KEYS } from '$lib/utils/constants';
  import { isBrowser } from '$lib/utils/env';
  import { getInstallPlatform, isStandalone } from '$lib/utils/platform';
  import { resolveAppViewportHeight } from '$lib/utils/appViewport';
  import { registerPwaServiceWorker } from '$lib/services/pwaRegistration';
  import { disposePwaUpdateService } from '$lib/services/pwaUpdate';
  import { initGenerationDraftGuard } from '$lib/services/generationDraftGuard';
  import AppUpdatePrompt from '$lib/components/ui/AppUpdatePrompt.svelte';
  import '../app.css';

  let { children }: { children: Snippet } = $props();

  const queryClient = getQueryClient();

  // Derive app title from productInfo for <title> tag
  let appTitle = $derived($productInfo?.display_name ?? 'Apex');

  // iOS standalone (measured on iOS, 2026-07, device screen 440×956):
  // during navigations that pass through a layout remount (e.g. auth-guard
  // skeleton on More-sheet destinations), WebKit transiently reports
  // innerHeight/visualViewport.height = screen.height − safe-area-inset-top
  // (956 → 894 → 956) and does not reliably emit the restoring resize event.
  // resolveAppViewportHeight preserves the screen-height floor for iOS only.
  // Android standalone must use the actual visual viewport; screen.height may
  // include browser/system UI outside the visible PWA and would make the shell
  // too tall, pushing the bottom navigation below the screen.
  // Debug overlay: 5 taps on the version badge in the More sheet (or ?vpdebug=1).
  const updateAppHeight = () => {
    const h = resolveAppViewportHeight({
      visualViewportHeight: window.visualViewport?.height,
      innerHeight: window.innerHeight,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      portrait: window.matchMedia('(orientation: portrait)').matches,
      standalone: isStandalone(),
      platform: getInstallPlatform(),
    });
    document.documentElement.style.setProperty('--app-height', `${h}px`);
  };

  afterNavigate(() => {
    window.scrollTo(0, 0);
    updateAppHeight();
  });

  onMount(() => {
    const cleanups: (() => void)[] = [];

    updateAppHeight();
    window.visualViewport?.addEventListener('resize', updateAppHeight);
    window.addEventListener('resize', updateAppHeight); // fallback + orientation changes
    cleanups.push(() => window.visualViewport?.removeEventListener('resize', updateAppHeight));
    cleanups.push(() => window.removeEventListener('resize', updateAppHeight));

    cleanups.push(initTheme());
    cleanups.push(initNetworkListener());
    cleanups.push(initPwaInstallListener());
    cleanups.push(initGenerationDraftGuard());

    if (pwaInfo) {
      void registerPwaServiceWorker(() => import('virtual:pwa-register'));
      cleanups.push(disposePwaUpdateService);
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
  <AppUpdatePrompt />
  {#key $locale}
    {@render children()}
  {/key}
</QueryClientProvider>
<ViewportDebug />
