<script lang="ts">
  import { Plus } from 'lucide-svelte';
  import MediaVideo from '$lib/media/MediaVideo.svelte';
  import type { components } from '$lib/api/types';
  import * as m from '$paraglide/messages';

  type MediaObject = components['schemas']['MediaObject'];

  let {
    media,
    timestamp,
    maxTimestamp,
    canAdd,
    onscrub,
    onadd,
  }: {
    media: MediaObject;
    timestamp: number;
    maxTimestamp: number;
    canAdd: boolean;
    onscrub: (timestampMs: number) => number;
    onadd: () => void;
  } = $props();

  let videoEl = $state<HTMLVideoElement | null>(null);

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
    if (videoEl) videoEl.currentTime = nextTimestamp / 1_000;
  }
</script>

<section class="rounded-xl border border-border bg-surface p-3 md:p-4">
  <div class="mb-3 overflow-hidden rounded-lg bg-black">
    <MediaVideo
      {media}
      muted
      playsinline
      onvideoelement={(element) => (videoEl = element)}
      class="aspect-video w-full max-h-64 object-contain"
    />
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
      <button
        type="button"
        onclick={onadd}
        disabled={!canAdd}
        class="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus size={13} />
        {m.frames_add_frame()}
      </button>
    </div>
  </div>
</section>
