<script lang="ts">
  import { toMediaSrc, posterSrc } from '$lib/media/index';
  import { getCachedBlob } from '$lib/media/save/blobCache';
  import type { components } from '$lib/api/types';

  type MediaObject = components['schemas']['MediaObject'];

  let {
    media,
    controls = false,
    autoplay = false,
    muted = $bindable(false),
    paused = $bindable(true),
    currentTime = $bindable(0),
    duration = $bindable(0),
    loop = false,
    playsinline = false,
    preload = 'metadata' as 'none' | 'metadata' | 'auto',
    poster,
    onvideoelement,
    class: className = '',
  }: {
    media: MediaObject;
    controls?: boolean;
    autoplay?: boolean;
    muted?: boolean;
    paused?: boolean;
    currentTime?: number;
    /** Readonly media binding — flows child → parent only. */
    duration?: number;
    loop?: boolean;
    playsinline?: boolean;
    /** Grid cards opt out of loading media bytes until the user intends playback. */
    preload?: 'none' | 'metadata' | 'auto';
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

  let cachedObjectUrl = $state<string | null>(null);
  const resolvedPoster = $derived(poster ?? posterSrc(media));
  const directSrc = $derived(toMediaSrc(media.original.url));
  const src = $derived(cachedObjectUrl ?? directSrc);

  // A viewer prewarm can leave a short-lived original in memory. Prefer it on a later open,
  // but retain direct authenticated streaming when no warm blob exists.
  $effect(() => {
    const source = directSrc;
    const blob = getCachedBlob(source, Date.now());
    if (!blob) {
      cachedObjectUrl = null;
      return;
    }

    const objectUrl = URL.createObjectURL(blob);
    cachedObjectUrl = objectUrl;
    return () => {
      URL.revokeObjectURL(objectUrl);
      if (cachedObjectUrl === objectUrl) cachedObjectUrl = null;
    };
  });
</script>

<video
  bind:this={videoElement}
  {src}
  poster={resolvedPoster}
  {controls}
  {autoplay}
  bind:muted
  bind:paused
  bind:currentTime
  bind:duration
  {loop}
  {playsinline}
  {preload}
  class={className}
></video>
