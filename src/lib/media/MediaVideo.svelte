<script lang="ts">
  import { toMediaSrc, posterSrc } from '$lib/media/index';
  import { recoverContentAccess } from '$lib/media/contentAccessRecovery';
  import { contentCredentialsRevision } from '$lib/services/contentCookie';
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

  // HTMLMediaElement spec constants; not every test DOM exposes MediaError/HTMLMediaElement statics.
  const NETWORK_LOADING = 2;
  const MEDIA_ERR_NETWORK = 2;
  const MEDIA_ERR_SRC_NOT_SUPPORTED = 4;

  let videoElement = $state<HTMLVideoElement | null>(null);
  let lastContentCredentialsRevision: number | undefined;

  $effect(() => {
    if (import.meta.env.DEV && media.media_type !== 'video') {
      console.warn('MediaVideo: received a non-video MediaObject', media.media_type);
    }
  });

  $effect(() => {
    if (videoElement) onvideoelement?.(videoElement);
  });

  $effect(() => {
    const revision = $contentCredentialsRevision;
    if (lastContentCredentialsRevision === undefined) {
      // A fresh native-media element already starts its own initial fetch.
      lastContentCredentialsRevision = revision;
      return;
    }
    if (revision === lastContentCredentialsRevision) return;
    lastContentCredentialsRevision = revision;

    // A recovery can only fix a failed request or a preload="none" poster fetch. Do not restart
    // healthy playback merely because credentials were renewed in the background, nor an element
    // that is already re-fetching (e.g. after its own one-shot recovery below).
    if (
      videoElement &&
      (videoElement.error !== null ||
        (videoElement.readyState === 0 && videoElement.networkState !== NETWORK_LOADING))
    ) {
      videoElement.load();
    }
  });

  const resolvedPoster = $derived(poster ?? posterSrc(media));
  // Null for a URL that is not protected content: the element then has no source to request.
  const src = $derived(toMediaSrc(media.original.url));

  // At most one recovery per media URL. Keyed on the URL (not the object) so a structurally
  // identical rerender cannot re-arm it, while navigating to different media does.
  let recoveryAttemptedFor: string | null = null;

  /**
   * A 401 on a native media request surfaces as MEDIA_ERR_NETWORK or MEDIA_ERR_SRC_NOT_SUPPORTED
   * (the browser cannot tell an auth failure from an unplayable body). MEDIA_ERR_DECODE and
   * MEDIA_ERR_ABORTED are never credential problems, so they never touch the auth layer.
   */
  function isPossibleCredentialFailure(error: MediaError | null): boolean {
    return error?.code === MEDIA_ERR_NETWORK || error?.code === MEDIA_ERR_SRC_NOT_SUPPORTED;
  }

  async function handleError(): Promise<void> {
    const failedSrc = src;
    const element = videoElement;
    if (!failedSrc || !element || recoveryAttemptedFor === failedSrc) return;
    if (!isPossibleCredentialFailure(element.error)) return;
    recoveryAttemptedFor = failedSrc;

    const recovery = await recoverContentAccess();
    // A stale answer must not reload an element that has since moved to other media.
    if (!recovery.ok || src !== failedSrc || videoElement !== element) return;
    // Retry the exact same stable URL once; a second failure keeps the native error state.
    if (element.error !== null) element.load();
  }
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
  onerror={handleError}
></video>
