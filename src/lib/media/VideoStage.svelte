<script lang="ts">
  import { Volume2, VolumeX, Play, Pause } from 'lucide-svelte';
  import MediaVideo from './MediaVideo.svelte';
  import { formatTimestampFromSeconds } from './mediaHelpers';
  import * as m from '$paraglide/messages';
  import type { components } from '$lib/api/types';

  type MediaObject = components['schemas']['MediaObject'];

  let {
    media,
    muted,
    onmutedchange,
    reserveTrailingSpace = false,
    class: className = '',
  }: {
    media: MediaObject;
    muted: boolean;
    onmutedchange: (value: boolean) => void;
    reserveTrailingSpace?: boolean;
    class?: string;
  } = $props();

  // Mirrors the page-owned `muted` prop into MediaVideo's bindable — the prop itself isn't
  // bindable here since mute is controlled by the caller via `onmutedchange`. Writable
  // $derived so the two-way `bind:muted` below can still assign into it.
  let mutedState = $derived(muted);
  let paused = $state(true);
  let currentTime = $state(0);
  let duration = $state(0);

  const seekDisabled = $derived(!duration || Number.isNaN(duration));

  function toggleMute() {
    const next = !muted;
    onmutedchange(next);
    // Unmuting is a user gesture, so an unmute-while-paused resume is allowed here.
    if (!next && paused) {
      paused = false;
    }
  }

  function togglePlay() {
    paused = !paused;
  }

  function handleSeek(event: Event) {
    currentTime = Number((event.currentTarget as HTMLInputElement).value);
  }
</script>

<div class="relative flex items-center justify-center overflow-hidden bg-black {className}">
  <MediaVideo
    {media}
    controls={false}
    autoplay
    loop
    playsinline
    bind:muted={mutedState}
    bind:paused
    bind:currentTime
    bind:duration
    class="max-h-full max-w-full object-contain"
  />

  <div
    data-swipe-passthrough
    class="absolute inset-x-0 bottom-0 z-10 flex items-center gap-2 bg-black/40 p-2 backdrop-blur-sm {reserveTrailingSpace
      ? 'pr-14'
      : ''}"
  >
    <button
      type="button"
      onclick={toggleMute}
      class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
      aria-label={muted ? m.library_video_unmute() : m.library_video_mute()}
    >
      {#if muted}
        <VolumeX size={16} />
      {:else}
        <Volume2 size={16} />
      {/if}
    </button>

    <button
      type="button"
      onclick={togglePlay}
      class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
      aria-label={paused ? m.library_video_play() : m.library_video_pause()}
    >
      {#if paused}
        <Play size={16} />
      {:else}
        <Pause size={16} />
      {/if}
    </button>

    <input
      type="range"
      min="0"
      max={duration || 0}
      step="0.01"
      value={currentTime}
      oninput={handleSeek}
      disabled={seekDisabled}
      aria-label={m.library_video_seek()}
      class="h-1.5 min-w-0 flex-1 accent-white disabled:cursor-not-allowed disabled:opacity-50"
    />

    <span class="shrink-0 text-xs tabular-nums text-white">
      {formatTimestampFromSeconds(currentTime)} / {formatTimestampFromSeconds(duration)}
    </span>
  </div>
</div>
