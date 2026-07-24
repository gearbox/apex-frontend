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
    srcOverride = null,
    onObjectUrlError,
  }: {
    media: MediaObject;
    alt: string;
    sizes?: string;
    class?: string;
    loading?: 'lazy' | 'eager';
    /** Overlays a single resolved source (e.g. an upgraded object URL) in place of the
     *  responsive srcset/sizes pair. The error/retry ladder below still applies to it. */
    srcOverride?: string | null;
    /** Called instead of the retry ladder when `srcOverride` fails to load — an object URL
     *  can never 401, so silentRefresh would be pointless. */
    onObjectUrlError?: () => void;
  } = $props();

  type RetryState = 'idle' | 'refreshing' | 'retried' | 'failed';

  let imageElement = $state<HTMLImageElement | null>(null);
  const attrs = $derived(imgAttrs(media, sizes));
  const originalUrl = $derived(media.original.url);
  const effectiveSrc = $derived(srcOverride ?? attrs.src);
  const effectiveSrcset = $derived(srcOverride ? undefined : attrs.srcset);
  const effectiveSizes = $derived(srcOverride ? undefined : attrs.sizes);

  // A successful token refresh must make a previously failed thumbnail eligible again, but an
  // ordinary parent rerender that supplies a structurally-identical `media` object must not:
  // this derived comparison (not an effect) only resets to 'idle' when the URL itself differs,
  // regardless of how often the surrounding component tree rerenders.
  let failure = $state<{ url: string; state: RetryState } | null>(null);
  const retryState = $derived(failure?.url === originalUrl ? failure.state : 'idle');

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
    if (srcOverride) {
      // An object URL can never 401 — bypass the refresh/retry ladder entirely and let the
      // owner (ProgressiveImage) drop back to the responsive variant instead.
      onObjectUrlError?.();
      return;
    }

    if (retryState === 'failed' || retryState === 'refreshing') return;

    if (retryState === 'retried') {
      failure = { url: originalUrl, state: 'failed' };
      return;
    }

    const failedUrl = originalUrl;
    failure = { url: failedUrl, state: 'refreshing' };
    const refreshed = await silentRefresh().catch(() => false);

    // Ignore a stale response once the parent has already moved on to different media.
    if (originalUrl !== failedUrl) return;

    if (!refreshed) {
      failure = { url: failedUrl, state: 'failed' };
      return;
    }

    failure = { url: failedUrl, state: 'retried' };
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
    src={effectiveSrc}
    srcset={effectiveSrcset}
    sizes={effectiveSizes}
    width={attrs.width}
    height={attrs.height}
    {alt}
    {loading}
    decoding="async"
    class={className}
    onerror={handleError}
  />
{/if}
