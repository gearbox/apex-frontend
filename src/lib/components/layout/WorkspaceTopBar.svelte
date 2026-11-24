<script lang="ts">
  import type { Snippet } from 'svelte';
  import { ArrowLeft } from '@lucide/svelte';
  let {
    title,
    backHref,
    backLabel,
    actions,
  }: { title: string; backHref: string; backLabel: string; actions?: Snippet } = $props();
</script>

<header class="flex min-h-14 items-center gap-3 border-b border-border px-4 md:hidden">
  <a href={backHref} aria-label={backLabel}><ArrowLeft size={20} /></a>
  <h1 class="min-w-0 flex-1 truncate font-display font-semibold">{title}</h1>
  {#if actions}{@render actions()}{/if}
</header>
