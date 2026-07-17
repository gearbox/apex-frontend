<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { Plus, RotateCcw } from 'lucide-svelte';
  import type { components } from '$lib/api/types';
  import {
    AuthenticatedMediaLoadError,
    loadAuthenticatedMediaBlob,
  } from '$lib/media/loadAuthenticatedMediaBlob';
  import {
    VideoFrameCapture,
    VideoFrameCaptureError,
    type CapturedVideoFrame,
    type RenderedVideoFrame,
  } from '$lib/components/frames/videoFrameCapture';
  import * as m from '$paraglide/messages';

  type MediaObject = components['schemas']['MediaObject'];

  let {
    media,
    timestamp,
    maxTimestamp,
    canAdd,
    disabled = false,
    onscrub,
    onadd,
    onAddButtonReady,
    addingLabel,
    retryLabel,
    displayErrorLabel,
    corsCaptureErrorLabel,
    authErrorLabel,
  }: {
    media: MediaObject;
    timestamp: number;
    maxTimestamp: number;
    canAdd: boolean;
    disabled?: boolean;
    onscrub: (timestampMs: number) => number;
    onadd: (frame: CapturedVideoFrame) => Promise<void>;
    onAddButtonReady?: (element: HTMLButtonElement | null) => void;
    addingLabel: string;
    retryLabel: string;
    displayErrorLabel: string;
    corsCaptureErrorLabel: string;
    authErrorLabel: string;
  } = $props();

  let videoEl = $state<HTMLVideoElement>();
  let canvasEl = $state<HTMLCanvasElement>();
  let addButton = $state<HTMLButtonElement>();
  let previewFrame = $state<RenderedVideoFrame | null>(null);
  let seeking = $state(true);
  let adding = $state(false);
  let captureError = $state('');
  let mediaLoadError = $state('');
  let mediaLoading = $state(false);
  let mediaReady = $state(false);
  let requestedTimestamp = $state(0);
  let seekTimer: ReturnType<typeof setTimeout> | null = null;
  let controller: VideoFrameCapture | null = null;
  let decoderObjectUrl: string | null = null;
  let loadRetryVersion = $state(0);

  const videoSrc = $derived(media.original.url);
  const previewAspectRatio = $derived(
    media.original.width && media.original.height
      ? `${media.original.width} / ${media.original.height}`
      : '16 / 9',
  );

  function formatTimestamp(timestampMs: number): string {
    const value = Math.max(0, Math.round(timestampMs));
    const minutes = Math.floor(value / 60_000);
    const seconds = Math.floor((value % 60_000) / 1_000);
    const milliseconds = value % 1_000;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(
      milliseconds,
    ).padStart(3, '0')}`;
  }

  function localizedCaptureError(error: unknown): string {
    return error instanceof VideoFrameCaptureError && error.code === 'canvas-not-origin-clean'
      ? corsCaptureErrorLabel
      : displayErrorLabel;
  }

  function localizedMediaLoadError(error: unknown): string {
    return error instanceof AuthenticatedMediaLoadError && error.category === 'authentication'
      ? authErrorLabel
      : displayErrorLabel;
  }

  function disposeDecoder(video: HTMLVideoElement): void {
    if (seekTimer) clearTimeout(seekTimer);
    seekTimer = null;
    controller?.dispose();
    controller = null;
    if (decoderObjectUrl) {
      URL.revokeObjectURL(decoderObjectUrl);
      decoderObjectUrl = null;
    }
    video.removeAttribute('src');
  }

  function handleInput(event: Event) {
    if (disabled) return;
    const nextTimestamp = onscrub(Number((event.currentTarget as HTMLInputElement).value));
    requestedTimestamp = nextTimestamp;
    captureError = '';
    scheduleSeek(nextTimestamp);
  }

  function scheduleSeek(nextTimestamp = requestedTimestamp) {
    if (!controller || disabled || !mediaReady) return;
    controller.supersede();
    if (seekTimer) clearTimeout(seekTimer);
    seeking = true;
    seekTimer = setTimeout(() => {
      seekTimer = null;
      void controller
        ?.seek(nextTimestamp)
        .then(() => {
          captureError = '';
        })
        .catch((error: unknown) => {
          captureError = localizedCaptureError(error);
          seeking = false;
        });
    }, 75);
  }

  async function handleAdd() {
    if (!controller || adding || seeking || disabled || mediaLoading || !mediaReady) return;
    adding = true;
    captureError = '';
    try {
      const frame = await controller.captureManualFrame(requestedTimestamp);
      await onadd(frame);
    } catch (error) {
      captureError = localizedCaptureError(error);
    } finally {
      adding = false;
    }
  }

  function retryMediaLoad() {
    mediaLoadError = '';
    loadRetryVersion += 1;
  }

  $effect(() => {
    const video = videoEl;
    const canvas = canvasEl;
    const source = videoSrc;
    const retryVersion = loadRetryVersion;
    if (!video || !canvas) return;

    let active = true;
    const abortController = new AbortController();
    mediaLoading = true;
    mediaReady = false;
    seeking = true;
    mediaLoadError = '';
    captureError = '';
    previewFrame = null;
    disposeDecoder(video);

    void (async () => {
      try {
        const { objectUrl } = await loadAuthenticatedMediaBlob(source, {
          signal: abortController.signal,
        });
        if (!active || retryVersion !== loadRetryVersion) {
          URL.revokeObjectURL(objectUrl);
          return;
        }

        decoderObjectUrl = objectUrl;
        video.src = objectUrl;
        controller = new VideoFrameCapture({
          video,
          canvas,
          onFrame: (frame) => (previewFrame = frame),
          onSeekingChange: (nextSeeking) => (seeking = nextSeeking),
        });
        mediaLoading = false;
        mediaReady = true;
        scheduleSeek(requestedTimestamp);
      } catch (error) {
        if (
          !active ||
          (error instanceof AuthenticatedMediaLoadError && error.category === 'aborted')
        ) {
          return;
        }
        mediaLoading = false;
        mediaReady = false;
        seeking = false;
        mediaLoadError = localizedMediaLoadError(error);
      }
    })();

    return () => {
      active = false;
      abortController.abort();
      disposeDecoder(video);
    };
  });

  onMount(() => {
    requestedTimestamp = timestamp;
    onAddButtonReady?.(addButton ?? null);
    return () => onAddButtonReady?.(null);
  });

  onDestroy(() => {
    if (seekTimer) clearTimeout(seekTimer);
  });
</script>

<section
  class="rounded-xl border border-border bg-surface p-3 md:p-4"
  aria-busy={mediaLoading || seeking}
>
  <div
    class="relative mb-3 overflow-hidden rounded-lg bg-black"
    style={`aspect-ratio: ${previewAspectRatio}`}
  >
    <canvas
      bind:this={canvasEl}
      aria-label={previewFrame
        ? formatTimestamp(previewFrame.timestampMs)
        : m.frames_preview_loading()}
      class="absolute inset-0 h-full w-full object-contain"
    ></canvas>
    {#if !previewFrame}
      <div class="absolute inset-0 flex items-center justify-center text-xs text-text-muted">
        {m.frames_preview_loading()}
      </div>
    {/if}
    {#if mediaLoading || seeking}
      <div
        class="absolute inset-0 flex items-center justify-center bg-black/25"
        role="status"
        aria-live="polite"
        aria-label={m.frames_frame_loading()}
      >
        <span class="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"
        ></span>
        <span class="sr-only">{m.frames_frame_loading()}</span>
      </div>
    {/if}
    <video
      bind:this={videoEl}
      muted
      playsinline
      preload="metadata"
      aria-hidden="true"
      class="pointer-events-none absolute h-px w-px opacity-0"
    ></video>
  </div>
  <div class="flex flex-col gap-2">
    <div class="flex items-center justify-between text-xs tabular-nums text-text-muted">
      <label for="frame-scrubber">{formatTimestamp(timestamp)}</label>
      <span>{formatTimestamp(maxTimestamp)}</span>
    </div>
    <input
      id="frame-scrubber"
      type="range"
      min="0"
      max={maxTimestamp}
      step="1"
      value={timestamp}
      oninput={handleInput}
      {disabled}
      aria-label={m.frames_scrubber_label()}
      class="w-full accent-accent disabled:cursor-not-allowed disabled:opacity-50"
    />
    <div class="flex items-center justify-between gap-3">
      <p class="text-xs text-text-dim">{m.frames_selected_limit()}</p>
      <div class="flex items-center gap-2">
        {#if captureError || mediaLoadError}
          <button
            type="button"
            onclick={() => (mediaLoadError ? retryMediaLoad() : scheduleSeek(requestedTimestamp))}
            disabled={disabled || mediaLoading}
            class="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw size={13} />
            {retryLabel}
          </button>
        {/if}
        <button
          bind:this={addButton}
          type="button"
          onclick={() => void handleAdd()}
          disabled={!canAdd ||
            disabled ||
            mediaLoading ||
            !mediaReady ||
            seeking ||
            adding ||
            !previewFrame}
          class="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={13} />
          {adding ? addingLabel : m.frames_add_frame()}
        </button>
      </div>
    </div>
    {#if captureError || mediaLoadError}
      <p class="text-xs text-danger" role="alert">{mediaLoadError || captureError}</p>
    {/if}
  </div>
</section>
