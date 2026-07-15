<script lang="ts">
  import { onMount, onDestroy, type Snippet } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { useQueryClient } from '@tanstack/svelte-query';
  import { currentAuthStatus, currentUser } from '$lib/stores/auth';
  import { initAuth } from '$lib/api/auth';
  import { EventStreamService } from '$lib/services/eventStream';
  import * as m from '$paraglide/messages';
  import AppShell from '$lib/components/layout/AppShell.svelte';
  import SessionCreditBanner from '$lib/components/layout/SessionCreditBanner.svelte';
  import ToastContainer from '$lib/components/ui/ToastContainer.svelte';
  import SystemBanner from '$lib/components/ui/SystemBanner.svelte';
  import OfflineBanner from '$lib/components/ui/OfflineBanner.svelte';
  import InstallPromptSheet from '$lib/components/pwa/InstallPromptSheet.svelte';
  import PushNudgeBanner from '$lib/components/pwa/PushNudgeBanner.svelte';
  import { pushNudge } from '$lib/stores/pushNudge.svelte';
  import { pushSubscription } from '$lib/stores/pushSubscription.svelte';
  import { pushNudgeLaunch } from '$lib/stores/pushNudgeLaunch';
  import { isStandalone } from '$lib/utils/platform';

  let { children }: { children: Snippet } = $props();
  let checking = $state(true);

  const queryClient = useQueryClient();
  let eventStream: EventStreamService | null = null;
  let pushInitializedForUserId: string | undefined;
  let disposePushSubscription: (() => void) | undefined;

  onMount(async () => {
    await initAuth();
    checking = false;
  });

  // SSE lifecycle — connect when authenticated, disconnect when not
  $effect(() => {
    if (checking) return;

    const userId = $currentUser?.id;
    if ($currentAuthStatus === 'authenticated' && userId) {
      if (!eventStream) {
        eventStream = new EventStreamService({ queryClient });
      }
      eventStream.connect();

      if (pushInitializedForUserId !== userId) {
        disposePushSubscription?.();
        pushNudge.reset();
        pushNudgeLaunch.reset();
        pushInitializedForUserId = userId;
        disposePushSubscription = pushSubscription.init(userId);
      }
    } else {
      eventStream?.disconnect();
      disposePushSubscription?.();
      disposePushSubscription = undefined;
      pushInitializedForUserId = undefined;
      pushNudge.reset();
      pushNudgeLaunch.reset();
      pushSubscription.reset();
    }
  });

  // Standalone-launch push nudge — evaluate once per user, after that user's
  // initial push sync has settled. pushSubscription.initialSyncComplete is read
  // (transitively, via pushNudgeLaunch.evaluate) so this effect reruns when it flips.
  $effect(() => {
    if (checking) return;
    pushNudgeLaunch.evaluate({
      userId: $currentUser?.id,
      authenticated: $currentAuthStatus === 'authenticated',
      standalone: isStandalone(),
    });
  });

  onDestroy(() => {
    eventStream?.dispose();
    eventStream = null;
    disposePushSubscription?.();
    disposePushSubscription = undefined;
    pushSubscription.reset();
    pushNudgeLaunch.reset();
  });

  // Redirect when auth resolves to unauthenticated
  $effect(() => {
    if (!checking && $currentAuthStatus === 'unauthenticated') {
      const redirect = encodeURIComponent($page.url.pathname);
      goto(`/login?redirect=${redirect}`, { replaceState: true });
    }
  });
</script>

{#if checking || $currentAuthStatus === 'unknown'}
  <!-- Auth check skeleton -->
  <div class="flex min-h-dvh items-center justify-center bg-bg">
    <div class="flex flex-col items-center gap-3">
      <div
        class="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent"
      ></div>
      <p class="text-sm text-text-dim">{m.common_loading()}</p>
    </div>
  </div>
{:else}
  <div class="app-viewport">
    <SystemBanner />
    <OfflineBanner />
    <AppShell>
      {@render children()}
    </AppShell>
  </div>
  <SessionCreditBanner />
  <ToastContainer />
  <InstallPromptSheet />
  <PushNudgeBanner />
{/if}

<style>
  .app-viewport {
    display: flex;
    flex-direction: column;
    height: 100dvh; /* pre-JS fallback */
    height: var(--app-height, 100dvh);
    overflow: hidden;
  }
</style>
