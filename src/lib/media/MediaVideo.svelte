<script lang="ts">
  import { toMediaSrc, posterSrc } from '$lib/media/index';
  import { recoverContentAccess } from '$lib/media/contentAccessRecovery';
  import { parseProtectedContentUrl, probeProtectedContent } from '$lib/media/protectedContent';
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
  let sourceGeneration = 0;
  let lastObservedSource: string | null;
  let sourceObserved = false;
  let probeController: AbortController | null = null;

  type NativeFailureState = 'idle' | 'probing' | 'waiting-for-content-credentials' | 'permanent';
  let nativeFailureState = $state<NativeFailureState>('idle');
  let waitingForContentCredentials = $state<string | null>(null);

  $effect(() => {
    if (import.meta.env.DEV && media.media_type !== 'video') {
      console.warn('MediaVideo: received a non-video MediaObject', media.media_type);
    }
  });

  $effect(() => {
    if (videoElement) onvideoelement?.(videoElement);
  });

  const resolvedPoster = $derived(poster ?? posterSrc(media));
  // Null for a URL that is not protected content: the element then has no source to request.
  const src = $derived(toMediaSrc(media.original.url));

  $effect(() => {
    const currentSource = src;
    if (!sourceObserved) {
      lastObservedSource = currentSource;
      sourceObserved = true;
      return;
    }
    if (currentSource === lastObservedSource) return;

    // A source replacement invalidates any pending probe/recovery and its native-error
    // classification. The native error event can arrive after a property update, so retain an
    // explicit generation in addition to comparing the URL before reloading.
    lastObservedSource = currentSource;
    sourceGeneration += 1;
    probeController?.abort();
    probeController = null;
    nativeFailureState = 'idle';
    waitingForContentCredentials = null;
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

    const waitingForRecovery = waitingForContentCredentials === src;
    const idlePreloadNone =
      preload === 'none' &&
      nativeFailureState !== 'permanent' &&
      videoElement?.readyState === 0 &&
      videoElement.networkState !== NETWORK_LOADING;

    // A revision can only help a confirmed credential failure still waiting for credentials, or
    // the intentional preload="none"/idle retry case. In particular, never restart a source that
    // was successfully probed and classified as codec/source/playback failure.
    if (videoElement && (waitingForRecovery || idlePreloadNone)) {
      waitingForContentCredentials = null;
      videoElement.load();
    }
  });

  // At most one recovery per media URL. Keyed on the URL (not the object) so a structurally
  // identical rerender cannot re-arm it, while navigating to different media does.
  let recoveryAttemptedFor: string | null = null;

  /** Only ambiguous native errors receive a bounded cookie-only content access probe. */
  function isPossibleCredentialFailure(error: MediaError | null): boolean {
    return error?.code === MEDIA_ERR_NETWORK || error?.code === MEDIA_ERR_SRC_NOT_SUPPORTED;
  }

  function isCurrentAttempt(
    failedSrc: string,
    element: HTMLVideoElement,
    generation: number,
    controller: AbortController,
  ): boolean {
    return (
      !controller.signal.aborted &&
      sourceGeneration === generation &&
      src === failedSrc &&
      videoElement === element
    );
  }

  async function handleError(): Promise<void> {
    const failedSrc = src;
    const element = videoElement;
    if (!failedSrc || !element || recoveryAttemptedFor === failedSrc) return;
    if (!isPossibleCredentialFailure(element.error)) return;
    const target = parseProtectedContentUrl(failedSrc);
    if (!target) return;

    recoveryAttemptedFor = failedSrc;
    nativeFailureState = 'probing';
    const generation = sourceGeneration;
    const controller = new AbortController();
    probeController = controller;

    let probe: Response;
    try {
      probe = await probeProtectedContent(target, { signal: controller.signal });
    } catch {
      // A transient probe failure says nothing about credentials. Preserve the native error and
      // never escalate it into a token/content-cookie refresh.
      if (isCurrentAttempt(failedSrc, element, generation, controller)) {
        nativeFailureState = 'permanent';
      }
      return;
    }

    if (!isCurrentAttempt(failedSrc, element, generation, controller)) return;
    if (probe.status !== 401) {
      // 200/206 prove the cookie is accepted; 403/404 and server failures likewise are not proof
      // of an expired credential. Leave the browser's native playback failure in place.
      nativeFailureState = 'permanent';
      return;
    }

    nativeFailureState = 'waiting-for-content-credentials';
    waitingForContentCredentials = failedSrc;

    const recovery = await recoverContentAccess({ signal: controller.signal });
    // A stale answer must not reload an element that has since moved to other media.
    if (!isCurrentAttempt(failedSrc, element, generation, controller)) return;
    if (!recovery.ok) return;

    waitingForContentCredentials = null;
    nativeFailureState = 'idle';
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
