<script lang="ts">
  import GalleryCard from './GalleryCard.svelte';
  import type { components } from '$lib/api/types';

  type GalleryGridItem = components['schemas']['GalleryGridItem'];

  let {
    items,
    onCardClick,
    onCardDelete,
  }: {
    items: GalleryGridItem[];
    onCardClick: (item: GalleryGridItem) => void;
    onCardDelete: (item: GalleryGridItem) => void;
  } = $props();
</script>

<div class="grid grid-cols-2 gap-2 md:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
  {#each items as item (item.job_id)}
    <GalleryCard {item} onclick={() => onCardClick(item)} ondelete={onCardDelete} />
  {/each}
</div>
