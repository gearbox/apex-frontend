<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { goto } from '$app/navigation';
  import { currentAuthStatus, hasStoredSession } from '$lib/stores/auth';
  import { initAuth } from '$lib/api/auth';
  import { resolveHomeRoute } from '$lib/product/home';
  onMount(() => {
    let active = true;
    void (async () => {
      if (get(currentAuthStatus) === 'unknown' && hasStoredSession()) await initAuth();
      const route = await resolveHomeRoute();
      if (active) await goto(route, { replaceState: true });
    })();
    return () => {
      active = false;
    };
  });
</script>

<div class="flex min-h-dvh items-center justify-center bg-bg" role="status">
  <p class="text-text-dim">Redirecting…</p>
</div>
