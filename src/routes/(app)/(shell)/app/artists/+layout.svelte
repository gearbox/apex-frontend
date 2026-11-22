<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { goto } from '$app/navigation';
  import { get } from 'svelte/store';
  import { currentAuthStatus } from '$lib/stores/auth';
  import { productProfile } from '$lib/product/profile';
  import { probeStudio, retryStudioProbe, studioCapability } from '$lib/product/capabilities';
  import Spinner from '$lib/components/ui/Spinner.svelte';
  import * as m from '$paraglide/messages';

  let { children }: { children: Snippet } = $props();
  let redirected = $state(false);

  onMount(() => {
    if (get(currentAuthStatus) === 'authenticated') void probeStudio();
  });

  $effect(() => {
    if ($studioCapability === 'unavailable' && !redirected) {
      redirected = true;
      void goto(get(productProfile).homeRoute, { replaceState: true });
    }
  });
</script>

{#if $studioCapability === 'available'}
  {@render children()}
{:else if $studioCapability === 'unreachable'}
  <div class="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg px-6 text-center">
    <p class="text-sm text-text-muted">{m.studio_unreachable()}</p>
    <button
      type="button"
      class="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-bg"
      onclick={() => void retryStudioProbe()}
    >
      {m.auth_oauth_try_again()}
    </button>
  </div>
{:else}
  <div class="flex min-h-dvh items-center justify-center bg-bg" role="status" aria-live="polite">
    <Spinner size="2xl" label={m.common_loading()} />
  </div>
{/if}
