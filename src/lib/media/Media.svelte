<script lang="ts">
  import MediaImage from './MediaImage.svelte';
  import MediaVideo from './MediaVideo.svelte';
  import type { components } from '$lib/api/types';

  type MediaObject = components['schemas']['MediaObject'];

  let {
    media,
    alt = '',
    sizes = '100vw',
    class: className = '',
    loading = 'lazy' as 'lazy' | 'eager',
    controls = false,
    autoplay = false,
    muted = false,
    loop = false,
    playsinline = false,
    preload = 'metadata' as 'none' | 'metadata' | 'auto',
  }: {
    media: MediaObject;
    alt?: string;
    sizes?: string;
    class?: string;
    loading?: 'lazy' | 'eager';
    controls?: boolean;
    autoplay?: boolean;
    muted?: boolean;
    loop?: boolean;
    playsinline?: boolean;
    preload?: 'none' | 'metadata' | 'auto';
  } = $props();
</script>

{#if media.media_type === 'video'}
  <MediaVideo
    {media}
    {controls}
    {autoplay}
    {muted}
    {loop}
    {playsinline}
    {preload}
    class={className}
  />
{:else}
  {#if media.media_type === 'image'}
    <MediaImage {media} {alt} {sizes} class={className} {loading} />
  {:else}
    <div
      class="flex min-h-20 items-center justify-center rounded-lg border border-border bg-surface p-3 text-center text-xs text-text-muted {className}"
      role="status"
    >
      Unsupported media type: {media.media_type}
    </div>
  {/if}
{/if}
