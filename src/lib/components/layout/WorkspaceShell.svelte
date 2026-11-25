<script lang="ts">
  import type { Snippet } from 'svelte';
  import { isDesktop } from '$lib/utils/breakpoints';
  import DesktopSidebar from './DesktopSidebar.svelte';
  let { children }: { children: Snippet } = $props();
</script>

<div class="flex min-h-0 flex-1 overflow-hidden bg-bg">
  {#if $isDesktop}<DesktopSidebar forceCollapsed />{/if}
  <main class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{@render children()}</main>
</div>
