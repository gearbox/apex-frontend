<script lang="ts">
  import { get } from 'svelte/store';
  import { productProfile } from '$lib/product/profile';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  onMount(() => {
    goto(get(productProfile).homeRoute, { replaceState: true });
  });
</script>

<div class="flex min-h-dvh items-center justify-center bg-bg">
  <p class="text-text-dim">Redirecting…</p>
</div>
