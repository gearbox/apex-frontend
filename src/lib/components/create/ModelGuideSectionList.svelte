<script lang="ts">
  import type { LocalizedText } from '$lib/content/modelGuides/types';

  interface Props {
    title: string;
    items: readonly LocalizedText[];
  }

  let { title, items }: Props = $props();
</script>

{#if items.length > 0}
  <section>
    <h3 class="text-[11px] font-semibold uppercase tracking-wider text-text-muted">{title}</h3>
    <ul class="mt-2 list-disc space-y-1 pl-4 text-sm leading-relaxed text-text-dim">
      {#each items as item (item)}
        <li>{item()}</li>
      {/each}
    </ul>
  </section>
{/if}
