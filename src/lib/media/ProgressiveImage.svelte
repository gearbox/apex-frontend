<script lang="ts">
  import { untrack } from 'svelte';
  import MediaImage from '$lib/media/MediaImage.svelte';
  import {
    fetchOriginalBytes,
    shouldUpgradeToOriginal,
    type OriginalFetchProgress,
  } from '$lib/media/progressive';
  import * as m from '$paraglide/messages';
  import type { components } from '$lib/api/types';

  type MediaObject = components['schemas']['MediaObject'];

  let {
    media,
    alt,
    sizes = '100vw',
    class: className = '',
    loading = 'eager' as 'lazy' | 'eager',
  }: {
    media: MediaObject;
    alt: string;
    sizes?: string;
    class?: string;
    loading?: 'lazy' | 'eager';
  } = $props();

  let upgradedObjectUrl = $state<string | null>(null);
  let progress = $state<OriginalFetchProgress | null>(null);
  let loadingOriginal = $state(false);

  function percentOf(value: OriginalFetchProgress | null): number {
    if (!value?.total || value.total <= 0) return 0;
    return Math.min(100, Math.round((value.received / value.total) * 100));
  }

  const progressPercent = $derived(percentOf(progress));

  /** An object URL can never 401 — a failed upgrade drops back to the responsive variant
   *  instead of running MediaImage's silentRefresh ladder against a source that can't 401. */
  function handleUpgradedSourceError(): void {
    if (upgradedObjectUrl) URL.revokeObjectURL(upgradedObjectUrl);
    upgradedObjectUrl = null;
  }

  // Keyed on the URL string, not `media` identity (see fix-review D3): a parent rerender that
  // supplies a structurally-identical `media` object must not restart an in-flight upgrade or
  // discard a completed one. `originalUrl` is the sole tracked dependency; the rest of `media`
  // is read via `untrack` so it can't reintroduce an identity dependency.
  const originalUrl = $derived(media.original.url);

  // The parent keys the sheet by asset ref; this effect also owns teardown for same-sheet
  // variation navigation. Never lift the controller out of the component.
  $effect(() => {
    const url = originalUrl;
    upgradedObjectUrl = null;
    progress = null;
    loadingOriginal = false;

    const currentMedia = untrack(() => media);
    if (!url || !shouldUpgradeToOriginal(currentMedia)) return;

    const controller = new AbortController();
    let ownedObjectUrl: string | null = null;
    let lastPercent = -1;
    loadingOriginal = true;

    void fetchOriginalBytes(currentMedia, {
      signal: controller.signal,
      onprogress: (next) => {
        // The displayed value is an integer percentage — skip the write (and the render it
        // would trigger) when a chunk doesn't move that percentage on a fast connection.
        const percent = percentOf(next);
        if (percent === lastPercent) return;
        lastPercent = percent;
        progress = next;
      },
    })
      .then((blob) => {
        if (!blob || controller.signal.aborted) return;
        ownedObjectUrl = URL.createObjectURL(blob);
        upgradedObjectUrl = ownedObjectUrl;
      })
      .catch(() => {
        // The already-painted md variant remains the neutral fallback for any failed upgrade.
      })
      .finally(() => {
        if (!controller.signal.aborted) loadingOriginal = false;
      });

    return () => {
      controller.abort();
      if (ownedObjectUrl) URL.revokeObjectURL(ownedObjectUrl);
      if (upgradedObjectUrl === ownedObjectUrl) upgradedObjectUrl = null;
    };
  });
</script>

<MediaImage
  {media}
  {alt}
  {sizes}
  class={className}
  {loading}
  srcOverride={upgradedObjectUrl}
  onObjectUrlError={handleUpgradedSourceError}
/>

{#if loadingOriginal}
  <div
    role="progressbar"
    aria-label={m.library_image_loading()}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={progressPercent}
    class="absolute inset-x-0 top-0 z-20 h-0.5 bg-white/20"
  >
    <div class="h-full bg-accent transition-[width]" style:width={`${progressPercent}%`}></div>
  </div>
{/if}
