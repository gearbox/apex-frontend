<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { Plus, RotateCcw } from 'lucide-svelte';
  import { toMediaSrc } from '$lib/media';
  import type { components } from '$lib/api/types';
  import {
    VideoFrameCapture,
    type CapturedVideoFrame,
  } from '$lib/components/frames/videoFrameCapture';
  import * as m from '$paraglide/messages';

  type MediaObject = components['schemas']['MediaObject'];

  let {
    media,
    timestamp,
    maxTimestamp,
    canAdd,
    onscrub,
    onadd,
    addingLabel,
    retryLabel,
    displayErrorLabel,
  }: {
    media: MediaObject;
    timestamp: number;
    maxTimestamp: number;
    canAdd: boolean;
    onscrub: (timestampMs: number) => number;
    onadd: (frame: CapturedVideoFrame) => Promise<void>;
    addingLabel: string;
    retryLabel: string;
    displayErrorLabel: string;
  } = $props();

  let videoEl = $state<HTMLVideoElement>();
  let canvasEl = $state<HTMLCanvasElement>();
  let previewFrame = $state<CapturedVideoFrame | null>(null);
  let seeking = $state(true);
  let adding = $state(false);
  let captureError = $state('');
  let requestedTimestamp = $state(0);
  let seekTimer: ReturnType<typeof setTimeout> | null = null;
  let controller: VideoFrameCapture | null = null;

  const videoSrc = $derived(toMediaSrc(media.original.url));
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

  function handleInput(event: Event) {
    const nextTimestamp = onscrub(Number((event.currentTarget as HTMLInputElement).value));
    requestedTimestamp = nextTimestamp;
    captureError = '';
    scheduleSeek(nextTimestamp);
  }

  function scheduleSeek(nextTimestamp = requestedTimestamp) {
    if (!controller) return;
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
          captureError = error instanceof Error ? error.message : displayErrorLabel;
          seeking = false;
        });
    }, 75);
  }

  async function handleAdd() {
    if (!controller || adding || seeking) return;
    adding = true;
    captureError = '';
    try {
      const frame = await controller.captureManualFrame(requestedTimestamp);
      await onadd(frame);
    } catch (error) {
      captureError = error instanceof Error ? error.message : displayErrorLabel;
    } finally {
      adding = false;
    }
  }

  onMount(() => {
    requestedTimestamp = timestamp;
    const video = videoEl;
    const canvas = canvasEl;
    if (!video || !canvas) return;
    controller = new VideoFrameCapture({
      video,
      canvas,
      onFrame: (frame) => (previewFrame = frame),
      onSeekingChange: (nextSeeking) => (seeking = nextSeeking),
    });
    scheduleSeek(requestedTimestamp);
  });

  onDestroy(() => {
    if (seekTimer) clearTimeout(seekTimer);
    controller?.dispose();
  });
</script>

<section class="rounded-xl border border-border bg-surface p-3 md:p-4">
  <div
    class="relative mb-3 overflow-hidden rounded-lg bg-black"
    style={`aspect-ratio: ${previewAspectRatio}`}
  >
    {#if previewFrame}
      <img
        src={previewFrame.previewUrl}
        alt={formatTimestamp(previewFrame.timestampMs)}
        class="h-full max-h-64 w-full object-contain"
      />
    {:else}
      <div class="flex h-full min-h-40 items-center justify-center text-xs text-text-muted">
        {m.frames_preview_loading()}
      </div>
    {/if}
    {#if seeking}
      <div
        class="absolute inset-0 flex items-center justify-center bg-black/25"
        aria-label="Loading frame preview"
      >
        <span class="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"
        ></span>
      </div>
    {/if}
    <video
      bind:this={videoEl}
      src={videoSrc}
      muted
      playsinline
      preload="metadata"
      aria-hidden="true"
      class="pointer-events-none absolute h-px w-px opacity-0"
    ></video>
    <canvas bind:this={canvasEl} class="hidden"></canvas>
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
      aria-label={m.frames_scrubber_label()}
      class="w-full accent-accent"
    />
    <div class="flex items-center justify-between gap-3">
      <p class="text-xs text-text-dim">{m.frames_selected_limit()}</p>
      <div class="flex items-center gap-2">
        {#if captureError}
          <button
            type="button"
            onclick={() => scheduleSeek(requestedTimestamp)}
            class="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-danger hover:bg-danger/10"
          >
            <RotateCcw size={13} />
            {retryLabel}
          </button>
        {/if}
        <button
          type="button"
          onclick={() => void handleAdd()}
          disabled={!canAdd || seeking || adding || !previewFrame}
          class="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={13} />
          {adding ? addingLabel : m.frames_add_frame()}
        </button>
      </div>
    </div>
    {#if captureError}
      <p class="text-xs text-danger" role="alert">{captureError}</p>
    {/if}
  </div>
</section>
