<script lang="ts">
  import { createQuery } from '@tanstack/svelte-query';
  import { Check } from 'lucide-svelte';
  import { galleryDetailQueryOptions } from '$lib/queries/gallery';
  import AuthImage from '$lib/components/ui/AuthImage.svelte';
  import type { components } from '$lib/api/types';

  type GalleryGridItem = components['schemas']['GalleryGridItem'];
  type GalleryOutputItem = components['schemas']['GalleryOutputItem'];

  export interface I2iOutputSelection {
    outputId: string;
    previewUrl: string;
    prompt: string;
  }

  let {
    item,
    selectedOutputId,
    onSelect,
  }: {
    item: GalleryGridItem;
    selectedOutputId: string | null;
    onSelect: (sel: I2iOutputSelection) => void;
  } = $props();

  const detailQuery = createQuery(() => galleryDetailQueryOptions(item.job_id));

  const imageOutputs = $derived(
    (detailQuery.data?.outputs ?? []).filter(
      (o: GalleryOutputItem) => o.media_type === 'image',
    ),
  );
</script>

{#if detailQuery.isPending}
  <div class="aspect-square animate-pulse rounded-lg bg-bg"></div>
{:else if imageOutputs.length > 0}
  {#each imageOutputs as output (output.id)}
    {@const isSelected = selectedOutputId === output.id}
    <button
      onclick={() =>
        onSelect({
          outputId: output.id,
          previewUrl: output.url,
          prompt: detailQuery.data?.prompt ?? item.prompt_snippet,
        })}
      class="group relative aspect-square overflow-hidden rounded-lg border-2 transition-colors
        {isSelected ? 'border-accent' : 'border-transparent hover:border-border-active'}"
      aria-pressed={isSelected}
      aria-label="Generated: {item.prompt_snippet}"
    >
      <AuthImage
        src={output.url}
        alt={item.prompt_snippet ?? ''}
        class="h-full w-full object-cover"
        loading="lazy"
      />
      {#if isSelected}
        <div class="absolute inset-0 flex items-center justify-center bg-accent/20">
          <Check size={20} class="text-accent" />
        </div>
      {/if}
      <div
        class="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/60 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100"
      >
        <p class="line-clamp-2 text-[10px] text-white">{item.prompt_snippet}</p>
      </div>
    </button>
  {/each}
{/if}
