<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  onMount(() => {
    goto('/app/create', { replaceState: true });
  });
</script>

<div class="flex min-h-dvh items-center justify-center bg-bg">
  <p class="text-text-dim">Redirecting…</p>
</div>
