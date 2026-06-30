<script lang="ts">
  import { imgAttrs, toMediaSrc } from '$lib/media/index';
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

  // Track which original URL triggered an error; reset automatically when media changes.
  let erroredUrl = $state<string | null>(null);
  const errored = $derived(erroredUrl === media.original.url);

  const attrs = $derived.by(() => {
    if (errored) {
      return {
        src: toMediaSrc(media.original.url),
        srcset: undefined,
        sizes: undefined,
        width: undefined,
        height: undefined,
      };
    }
    return imgAttrs(media, sizes);
  });

  function handleError() {
    erroredUrl = media.original.url;
  }
</script>

<img
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
