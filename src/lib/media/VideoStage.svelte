<script lang="ts">
  import { untrack } from 'svelte';
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
    active,
    reserveTrailingSpace = false,
    class: className = '',
  }: {
    media: MediaObject;
    muted: boolean;
    onmutedchange: (value: boolean) => void;
    /** Whether this is the stage currently visible to the user. Required (not defaulted) so
     * every call site states its intent explicitly. An inactive stage — e.g. the inline stage
     * while the fullscreen overlay for the same asset is open — is force-muted and
     * force-paused so the two players can never produce two audio streams at once. */
    active: boolean;
    reserveTrailingSpace?: boolean;
    class?: string;
  } = $props();

  let videoElement = $state<HTMLVideoElement | null>(null);
  let paused = $state(true);
  let currentTime = $state(0);
  let duration = $state(0);

  // The element must never become the source of truth for mute: `bind:muted` lets the
  // <video> write back into this local state, but the parent-owned `muted` prop (gated by
  // `active`) is the only value that should ever be treated as authoritative. Writable
  // `$derived` recomputes from `muted`/`active` and clears any element-side override the
  // instant either one changes, so it can't drift from page state for longer than a render.
  // (repo lint enforces `svelte/prefer-writable-derived`, so a manual `$state` + `$effect`
  // mirror isn't an option here — it's also strictly equivalent in behavior.)
  let mutedState = $derived(muted || !active);

  // Restores exactly the pre-deactivation play state on reactivation, nothing more — no
  // playback-position handoff (that's deferred, see fix-video-stage-review.md D3).
  let resumeOnActivate = false;
  $effect(() => {
    if (!active) {
      resumeOnActivate = !untrack(() => paused);
      paused = true;
    } else if (resumeOnActivate) {
      resumeOnActivate = false;
      videoElement?.play().catch(() => {
        paused = true;
      });
    }
  });

  const seekDisabled = $derived(!duration || Number.isNaN(duration));

  // While dragging/keying the scrub thumb, it renders its own uncommitted value instead of
  // `currentTime` — otherwise incoming `timeupdate` writes fight the pointer mid-drag.
  let scrubbing = $state(false);
  let scrubValue = $state(0);
  const displayedTime = $derived(scrubbing ? scrubValue : currentTime);

  function toggleMute() {
    const next = !muted;
    onmutedchange(next);
    // Unmuting is a user gesture, so an unmute-while-paused resume is allowed here.
    if (!next && paused) {
      videoElement?.play().catch(() => {
        paused = true;
      });
    }
  }

  // Drives play/pause imperatively via the element rather than by assigning `paused` (which
  // would route through Svelte's own bind:paused effect, whose play() call has no .catch() and
  // produces an unhandled rejection on a blocked/interrupted play). `paused = true` alone is
  // always safe to assign directly since it only ever routes to `.pause()`, which can't reject.
  function togglePlay() {
    if (!videoElement) return;
    if (paused) {
      videoElement.play().catch(() => {
        paused = true;
      });
    } else {
      videoElement.pause();
    }
  }

  function startScrub() {
    scrubbing = true;
    scrubValue = currentTime;
  }

  function endScrub() {
    scrubbing = false;
  }

  function handleSeek(event: Event) {
    const value = Number((event.currentTarget as HTMLInputElement).value);
    scrubValue = value;
    currentTime = value;
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
    onvideoelement={(element) => (videoElement = element)}
    class="max-h-full max-w-full object-contain"
  />

  <div
    data-swipe-passthrough
    inert={!active ? true : undefined}
    class="safe-bottom-padding absolute inset-x-0 bottom-0 z-10 flex items-center gap-2 bg-black/40 p-2 backdrop-blur-sm {reserveTrailingSpace
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
      value={displayedTime}
      oninput={handleSeek}
      onpointerdown={startScrub}
      onkeydown={startScrub}
      onpointerup={endScrub}
      onchange={endScrub}
      disabled={seekDisabled}
      aria-label={m.library_video_seek()}
      class="h-1.5 min-w-0 flex-1 accent-white disabled:cursor-not-allowed disabled:opacity-50"
    />

    <span class="shrink-0 text-xs tabular-nums text-white">
      {formatTimestampFromSeconds(currentTime)} / {formatTimestampFromSeconds(duration)}
    </span>
  </div>
</div>
