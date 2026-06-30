<script lang="ts">
  import { toMediaSrc } from '$lib/media/index';
  import MediaImage from '$lib/media/MediaImage.svelte';
  import MediaVideo from '$lib/media/MediaVideo.svelte';
  import type { components } from '$lib/api/types';

  type JobOutputItem = components['schemas']['JobOutputItem'];

  let {
    outputs,
  }: {
    outputs: JobOutputItem[];
    generationType?: string;
  } = $props();
</script>

{#if outputs.length > 0}
  <div class="grid grid-cols-2 gap-2 md:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
    {#each outputs as output (output.id)}
      <div class="overflow-hidden rounded-lg border border-border">
        {#if output.media.media_type === 'video'}
          <MediaVideo media={output.media} controls playsinline class="w-full rounded-lg" />
        {:else}
          <a
            href={toMediaSrc(output.media.original.url)}
            target="_blank"
            rel="noopener noreferrer"
            class="block w-full"
            aria-label="Open output {output.output_index + 1} in new tab"
          >
            <MediaImage
              media={output.media}
              alt="Output {output.output_index + 1}"
              sizes="(max-width: 768px) 50vw, 200px"
              class="aspect-square w-full rounded-lg object-cover transition-opacity hover:opacity-90"
            />
          </a>
        {/if}
      </div>
    {/each}
  </div>
{/if}
