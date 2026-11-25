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

<header
  class="flex min-h-14 items-center gap-3 border-b border-border md:hidden"
  style="padding-top: max(0.5rem, var(--safe-area-top)); padding-inline: max(1rem, var(--safe-area-left)) max(1rem, var(--safe-area-right)); min-height: calc(3.5rem + max(0.5rem, var(--safe-area-top)));"
>
  <a href={backHref} aria-label={backLabel}><ArrowLeft size={20} /></a>
  <p class="min-w-0 flex-1 truncate font-display font-semibold">{title}</p>
  {#if actions}{@render actions()}{/if}
</header>
