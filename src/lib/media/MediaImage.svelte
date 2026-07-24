<script lang="ts">
  import { imgAttrs } from '$lib/media/index';
  import { silentRefresh } from '$lib/api/auth';
  import { ImageOff } from 'lucide-svelte';
  import * as m from '$paraglide/messages';
  import type { components } from '$lib/api/types';

  type MediaObject = components['schemas']['MediaObject'];

  let {
    media,
    alt,
    sizes = '100vw',
    class: className = '',
    loading = 'lazy' as 'lazy' | 'eager',
  }: {
    media: MediaObject;
    alt: string;
    sizes?: string;
    class?: string;
    loading?: 'lazy' | 'eager';
  } = $props();

  type RetryState = 'idle' | 'refreshing' | 'retried' | 'failed';

  let retryState = $state<RetryState>('idle');
  let imageElement = $state<HTMLImageElement | null>(null);
  const attrs = $derived(imgAttrs(media, sizes));

  function resetRetryState(_mediaUrl: string): void {
    retryState = 'idle';
  }

  // A successful token refresh must make a previously failed thumbnail eligible again.
  // Key this only to the protected original URL so ordinary parent rerenders never reset it.
  $effect(() => {
    resetRetryState(media.original.url);
  });

  function reloadSameSource(): void {
    if (!imageElement) return;

    // Content-proxy URLs reject query strings. Clearing then re-setting the exact same
    // candidate list asks the browser to select/reload it without changing the URL contract.
    imageElement.removeAttribute('src');
    imageElement.removeAttribute('srcset');
    if (attrs.srcset) imageElement.srcset = attrs.srcset;
    if (attrs.sizes) imageElement.sizes = attrs.sizes;
    imageElement.src = attrs.src;
  }

  async function handleError(): Promise<void> {
    if (retryState === 'failed' || retryState === 'refreshing') return;

    if (retryState === 'retried') {
      retryState = 'failed';
      return;
    }

    const failedUrl = media.original.url;
    retryState = 'refreshing';
    const refreshed = await silentRefresh().catch(() => false);

    // Ignore an old request when a keyed parent has already supplied different media.
    if (media.original.url !== failedUrl || retryState !== 'refreshing') return;

    if (!refreshed) {
      retryState = 'failed';
      return;
    }

    retryState = 'retried';
    reloadSameSource();
  }
</script>

{#if retryState === 'failed'}
  <div
    role="img"
    aria-label={m.library_image_unavailable()}
    class="flex items-center justify-center bg-surface text-text-muted {className}"
  >
    <ImageOff size={24} aria-hidden="true" />
    <span class="sr-only">{m.library_image_unavailable()}</span>
  </div>
{:else}
  <img
    bind:this={imageElement}
    src={attrs.src}
    srcset={attrs.srcset}
    sizes={attrs.sizes}
    width={attrs.width}
    height={attrs.height}
    {alt}
    {loading}
    decoding="async"
    class={className}
    onerror={handleError}
  />
{/if}
