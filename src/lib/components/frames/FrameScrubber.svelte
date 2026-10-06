<script lang="ts">
  import { onMount } from 'svelte';
  import { Plus, RotateCcw } from '@lucide/svelte';
  import type { FrameExtractionSession } from './frameExtractionSession';
  import type { CapturedVideoFrame, RenderedVideoFrame } from './videoFrameCapture';
  import { formatTimestampFromMs as formatTimestamp } from '$lib/media/mediaHelpers';
  import Spinner from '$lib/components/ui/Spinner.svelte';
  import * as m from '$paraglide/messages';
  let {
    session,
    timestamp,
    maxTimestamp,
    canAdd,
    disabled = false,
    onscrub,
    onadd,
    onerror,
    onAddButtonReady,
  }: {
    session: FrameExtractionSession;
    timestamp: number;
    maxTimestamp: number;
    canAdd: boolean;
    disabled?: boolean;
    onscrub: (timestamp: number) => number;
    onadd: (frame: CapturedVideoFrame) => Promise<void>;
    onerror: (error: unknown) => void;
    onAddButtonReady?: (element: HTMLButtonElement | null) => void;
  } = $props();
  let addButton: HTMLButtonElement;
  let previewFrame = $state<RenderedVideoFrame | null>(null);
  let seeking = $state(false);
  let adding = $state(false);
  let captureError = $state('');
  const addingLabel = $derived(m.frames_adding_frame());
  const retryLabel = $derived(m.frames_retry_frame_preview());
  const previewAspectRatio = $derived(
    previewFrame ? `${previewFrame.width} / ${previewFrame.height}` : '16 / 9',
  );
  function mountCanvas(host: HTMLElement) {
    session.canvas.className = 'h-full w-full object-contain';
    host.append(session.canvas);
    return {
      destroy() {
        session.canvas.remove();
      },
    };
  }
  function scheduleSeek(value: number) {
    captureError = '';
    session.scrub(value, (error) => {
      captureError = m.frames_frame_display_error();
      onerror(error);
    });
  }
  function handleInput(event: Event) {
    if (disabled) return;
    scheduleSeek(onscrub(Number((event.currentTarget as HTMLInputElement).value)));
  }
  async function handleAdd() {
    if (disabled || adding || seeking) return;
    adding = true;
    try {
      await onadd(await session.addFrame());
    } catch (error) {
      captureError = m.frames_frame_display_error();
      onerror(error);
    } finally {
      adding = false;
    }
  }
  onMount(() => {
    const unsubscribe = session.subscribe(() => {
      previewFrame = session.frame;
      session.canvas.setAttribute(
        'aria-label',
        previewFrame ? formatTimestamp(previewFrame.timestampMs) : m.frames_preview_loading(),
      );
      seeking = session.seeking;
    });
    onAddButtonReady?.(addButton);
    return () => {
      unsubscribe();
      onAddButtonReady?.(null);
    };
  });
</script>

<section class="rounded-xl border border-border bg-surface p-3 md:p-4" aria-busy={seeking}>
  <div
    class="relative mb-3 overflow-hidden rounded-lg bg-black"
    style={`aspect-ratio: ${previewAspectRatio}`}
  >
    <div
      use:mountCanvas
      aria-label={previewFrame
        ? formatTimestamp(previewFrame.timestampMs)
        : m.frames_preview_loading()}
      class="absolute inset-0 h-full w-full object-contain"
    ></div>
    {#if !previewFrame}
      <div class="absolute inset-0 flex items-center justify-center text-xs text-text-muted">
        {m.frames_preview_loading()}
      </div>
    {/if}
    {#if seeking}
      <div
        class="absolute inset-0 flex items-center justify-center bg-black/25"
        role="status"
        aria-live="polite"
        aria-label={m.frames_frame_loading()}
      >
        <Spinner size="md" tone="inverse" />
        <span class="sr-only">{m.frames_frame_loading()}</span>
      </div>
    {/if}
  </div>
  <div class="flex flex-col gap-2">
    <div class="flex items-center justify-between text-xs tabular-nums text-text-muted">
      <label for="frame-scrubber">{formatTimestamp(previewFrame?.timestampMs ?? timestamp)}</label>
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
        {#if captureError}
          <button
            type="button"
            onclick={() => scheduleSeek(timestamp)}
            {disabled}
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
          disabled={!canAdd || disabled || seeking || adding || !previewFrame}
          class="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
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
