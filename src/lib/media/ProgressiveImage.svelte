<script lang="ts">
  import { imgAttrs } from '$lib/media/mediaHelpers';
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
  const attrs = $derived(imgAttrs(media, sizes));
  const progressPercent = $derived.by(() => {
    if (!progress?.total || progress.total <= 0) return 0;
    return Math.min(100, Math.round((progress.received / progress.total) * 100));
  });

  // The parent keys the sheet by asset ref; this effect also owns teardown for same-sheet
  // variation navigation. Never lift the controller out of the component.
  $effect(() => {
    const originalUrl = media.original.url;
    upgradedObjectUrl = null;
    progress = null;
    loadingOriginal = false;

    if (!originalUrl || !shouldUpgradeToOriginal(media)) return;

    const controller = new AbortController();
    let ownedObjectUrl: string | null = null;
    loadingOriginal = true;

    void fetchOriginalBytes(media, {
      signal: controller.signal,
      onprogress: (next) => (progress = next),
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

<img
  src={upgradedObjectUrl ?? attrs.src}
  srcset={upgradedObjectUrl ? undefined : attrs.srcset}
  sizes={upgradedObjectUrl ? undefined : attrs.sizes}
  width={attrs.width}
  height={attrs.height}
  {alt}
  {loading}
  decoding="async"
  class={className}
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
