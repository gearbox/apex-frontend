<script lang="ts">
  import type { Snippet } from 'svelte';
  import LanguageSelector from '$lib/components/shared/LanguageSelector.svelte';

  let { children }: { children: Snippet } = $props();
</script>

<div class="relative h-dvh overflow-y-auto">
  <div class="absolute right-4 top-4 z-50">
    <LanguageSelector />
  </div>
  {@render children()}
</div>
