<script lang="ts">
  import GalleryCard from './GalleryCard.svelte';
  import type { components } from '$lib/api/types';

  type JobSummaryResponse = components['schemas']['JobSummaryResponse'];

  let {
    items,
    onCardClick,
  }: {
    items: JobSummaryResponse[];
    onCardClick: (item: JobSummaryResponse) => void;
  } = $props();
</script>

<div class="grid grid-cols-2 gap-2 md:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
  {#each items as item (item.id)}
    <GalleryCard {item} onclick={() => onCardClick(item)} />
  {/each}
</div>
