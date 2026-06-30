<script lang="ts">
  import { toMediaSrc, posterSrc } from '$lib/media/index';
  import type { components } from '$lib/api/types';

  type MediaObject = components['schemas']['MediaObject'];

  let {
    media,
    controls = false,
    autoplay = false,
    muted = false,
    loop = false,
    playsinline = false,
    poster,
    class: className = '',
  }: {
    media: MediaObject;
    controls?: boolean;
    autoplay?: boolean;
    muted?: boolean;
    loop?: boolean;
    playsinline?: boolean;
    poster?: string;
    class?: string;
  } = $props();

  $effect(() => {
    if (import.meta.env.DEV && media.media_type !== 'video') {
      console.warn('MediaVideo: received a non-video MediaObject', media.media_type);
    }
  });

  const resolvedPoster = $derived(poster ?? posterSrc(media));
  const src = $derived(toMediaSrc(media.original.url));
</script>

<video
  {src}
  poster={resolvedPoster}
  {controls}
  {autoplay}
  {muted}
  {loop}
  {playsinline}
  class={className}
></video>
