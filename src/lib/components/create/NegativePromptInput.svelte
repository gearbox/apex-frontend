<script lang="ts">
  import { generationStore } from '$lib/stores/generation';
  import { ChevronDown } from 'lucide-svelte';

  let open = $state(false);
</script>

<div class="flex flex-col gap-1">
  <button
    onclick={() => (open = !open)}
    class="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-text-dim hover:text-text-muted transition-colors"
  >
    <span>Negative Prompt</span>
    <ChevronDown size={12} class="transition-transform {open ? 'rotate-180' : ''}" />
  </button>
  {#if open}
    <textarea
      value={$generationStore.negativePrompt}
      oninput={(e) => generationStore.setNegativePrompt((e.target as HTMLTextAreaElement).value)}
      rows={3}
      class="w-full resize-none rounded-2.5 border border-border bg-surface p-3 text-xs text-text-muted placeholder:text-text-dim focus:border-accent focus:outline-none transition-colors"
    ></textarea>
  {/if}
</div>
