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
    onvideoelement,
    class: className = '',
  }: {
    media: MediaObject;
    controls?: boolean;
    autoplay?: boolean;
    muted?: boolean;
    loop?: boolean;
    playsinline?: boolean;
    poster?: string;
    /** Receives the rendered <video> element for controlled seeking clients. */
    onvideoelement?: (element: HTMLVideoElement) => void;
    class?: string;
  } = $props();

  let videoElement = $state<HTMLVideoElement | null>(null);

  $effect(() => {
    if (import.meta.env.DEV && media.media_type !== 'video') {
      console.warn('MediaVideo: received a non-video MediaObject', media.media_type);
    }
  });

  $effect(() => {
    if (videoElement) onvideoelement?.(videoElement);
  });

  const resolvedPoster = $derived(poster ?? posterSrc(media));
  const src = $derived(toMediaSrc(media.original.url));
</script>

<video
  bind:this={videoElement}
  {src}
  poster={resolvedPoster}
  {controls}
  {autoplay}
  {muted}
  {loop}
  {playsinline}
  class={className}
></video>
