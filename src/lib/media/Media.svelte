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
  } = $props();
</script>

{#if media.media_type === 'video'}
  <MediaVideo {media} {controls} {autoplay} {muted} {loop} {playsinline} class={className} />
{:else}
  <MediaImage {media} {alt} {sizes} class={className} {loading} />
{/if}
