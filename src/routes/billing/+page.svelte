<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { get } from 'svelte/store';
  import * as m from '$paraglide/messages';
  import { initAuth } from '$lib/api/auth';
  import { currentAuthStatus } from '$lib/stores/auth';

  onMount(async () => {
    await initAuth();
    const suffix = $page.url.search;
    if (get(currentAuthStatus) === 'authenticated') {
      await goto(`/app/billing${suffix}`, { replaceState: true });
      return;
    }

    const redirect = encodeURIComponent(`/billing${suffix}`);
    await goto(`/login?redirect=${redirect}`, { replaceState: true });
  });
</script>

<div class="flex min-h-dvh items-center justify-center bg-bg">
  <p class="text-sm text-text-dim">{m.common_loading()}</p>
</div>
