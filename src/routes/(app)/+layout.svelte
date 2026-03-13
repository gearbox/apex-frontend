<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { currentAuthStatus } from '$lib/stores/auth';
  import { initAuth } from '$lib/api/auth';
  import AppShell from '$lib/components/layout/AppShell.svelte';
  import ToastContainer from '$lib/components/ui/ToastContainer.svelte';

  let { children }: { children: Snippet } = $props();
  let checking = $state(true);

  onMount(async () => {
    await initAuth();
    checking = false;
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
      <div class="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent"></div>
      <p class="text-sm text-text-dim">Loading…</p>
    </div>
  </div>
{:else}
  <AppShell>
    {@render children()}
  </AppShell>
  <ToastContainer />
{/if}
