<script lang="ts">
  import { untrack } from 'svelte';
  import { imgAttrs } from '$lib/media/index';
  import { recoverContentAccess } from '$lib/media/contentAccessRecovery';
  import { ImageOff } from '@lucide/svelte';
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
     *  can never 401, so content-access recovery would be pointless. */
    onObjectUrlError?: () => void;
  } = $props();

  type RetryState = 'idle' | 'refreshing' | 'retried' | 'failed';

  let imageElement = $state<HTMLImageElement | null>(null);
  const attrs = $derived(imgAttrs(media, sizes));
  const originalUrl = $derived(media.original.url);
  const effectiveSrc = $derived(srcOverride ?? attrs.src);
  const effectiveSrcset = $derived(srcOverride ? undefined : attrs.srcset);
  const effectiveSizes = $derived(srcOverride ? undefined : attrs.sizes);
  // This is the exact source currently painted by the element. Responsive candidates are only
  // ever reloaded while this source is still active; an object URL changing it invalidates the
  // pending recovery before it can write attributes imperatively.
  const sourceContext = $derived(effectiveSrc);

  // Content-access recovery is scoped to the failed rendered source, not merely the original
  // URL. A parent can replace responsive candidates with an upgraded object URL while recovery
  // is pending; that newer source must never be imperatively replaced by a stale retry.
  let failure = $state<{ url: string; state: RetryState } | null>(null);
  const retryState = $derived(failure?.url === originalUrl ? failure.state : 'idle');
  // A URL that is not a protected-content URL never becomes a request: render unavailable.
  const unavailable = $derived(retryState === 'failed' || (!srcOverride && attrs.src === null));
  let lastSourceContext: string | null;
  let sourceContextInitialized = false;

  $effect(() => {
    const currentContext = sourceContext;
    if (!sourceContextInitialized) {
      lastSourceContext = currentContext;
      sourceContextInitialized = true;
      return;
    }
    if (currentContext === lastSourceContext) return;
    lastSourceContext = currentContext;

    // An override replacing the failed responsive source makes its pending recovery stale right
    // away. Do not let that stale `refreshing` marker prevent a later fallback from retrying.
    if (untrack(() => failure)?.state === 'refreshing') failure = null;
  });

  function reloadSameSource(element: HTMLImageElement): void {
    if (imageElement !== element || srcOverride) return;

    // Content-proxy URLs reject query strings. Clearing then re-setting the exact same
    // candidate list asks the browser to select/reload it without changing the URL contract.
    element.removeAttribute('src');
    element.removeAttribute('srcset');
    if (attrs.srcset) element.srcset = attrs.srcset;
    if (attrs.sizes) element.sizes = attrs.sizes;
    if (attrs.src) element.src = attrs.src;
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
    const failedContext = sourceContext;
    const element = imageElement;
    if (!element) return;
    failure = { url: failedUrl, state: 'refreshing' };

    // An image error is not proof of an expired credential: offline, 5xx, 429, decoding, and
    // browser cache failures all land here too. The shared primitive re-mints the content cookie
    // first and escalates to a full refresh only after an explicit authorization rejection; a
    // known-revoked session, transient, or stale outcome goes straight to the placeholder.
    const recovery = await recoverContentAccess();

    // Ignore a stale response once the parent has changed either the media or the rendered source
    // context. Clearing this attempt's state means a later fallback from an object URL can still
    // use its own bounded recovery path.
    if (
      originalUrl !== failedUrl ||
      sourceContext !== failedContext ||
      srcOverride ||
      imageElement !== element
    ) {
      if (failure?.url === failedUrl && failure.state === 'refreshing') failure = null;
      return;
    }

    if (!recovery.ok) {
      failure = { url: failedUrl, state: 'failed' };
      return;
    }

    failure = { url: failedUrl, state: 'retried' };
    reloadSameSource(element);
  }
</script>

{#if unavailable}
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
