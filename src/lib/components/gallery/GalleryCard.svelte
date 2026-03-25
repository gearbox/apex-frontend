<script lang="ts">
  import { timeAgo } from '$lib/utils/format';
  import { Play } from 'lucide-svelte';
  import AuthImage from '$lib/components/ui/AuthImage.svelte';
  import type { components } from '$lib/api/types';

  type GalleryGridItem = components['schemas']['GalleryGridItem'];

  let { item, onclick }: { item: GalleryGridItem; onclick: () => void } = $props();

  const isVideo = $derived(item.media_type === 'video');

  function parseAspectRatio(ratio: string | null | undefined): string | null {
    if (!ratio) return null;
    const [w, h] = ratio.split(':').map(Number);
    if (!w || !h) return null;
    return `${w}/${h}`;
  }

  const aspectStyle = $derived(
    parseAspectRatio(item.aspect_ratio)
      ? `aspect-ratio: ${parseAspectRatio(item.aspect_ratio)};`
      : '',
  );
</script>

<button
  {onclick}
  data-aspect={item.aspect_ratio ?? '1:1'}
  class="group relative overflow-hidden rounded-xl border border-border bg-surface transition-all hover:border-border-active hover:shadow-lg"
>
  <!-- Thumbnail / placeholder -->
  <div class="aspect-square w-full overflow-hidden bg-surface" style={aspectStyle}>
    {#if item.cover_url}
      {#if isVideo}
        <div class="relative h-full w-full bg-black">
          <AuthImage
            src={item.cover_url}
            alt={item.prompt_snippet}
            class="h-full w-full object-cover opacity-70 transition-transform group-hover:scale-105"
          />
          <div class="absolute inset-0 flex items-center justify-center">
            <div
              class="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm"
            >
              <Play size={16} fill="white" class="text-white" />
            </div>
          </div>
        </div>
      {:else}
        <AuthImage
          src={item.cover_url}
          alt={item.prompt_snippet}
          class="h-full w-full object-cover transition-transform group-hover:scale-105"
        />
      {/if}
    {:else}
      <div
        class="flex h-full w-full items-center justify-center"
        style="background: radial-gradient(ellipse at center, color-mix(in srgb, var(--apex-accent-dim) 8%, transparent), transparent 70%);"
      >
        <span class="text-3xl opacity-20">{isVideo ? '▶' : '✦'}</span>
      </div>
    {/if}
  </div>

  <!-- Badge pill (top-left) -->
  <div
    class="absolute left-2 top-2 rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm"
  >
    {#if item.badge === 'image'}
      🖼 Image
    {:else}
      ✦ Prompt
    {/if}
  </div>

  <!-- Output count badge (bottom-right, only if > 1) -->
  {#if item.output_count > 1}
    <div
      class="absolute bottom-8 right-2 rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm"
    >
      ×{item.output_count}
    </div>
  {/if}

  <!-- Hover overlay with prompt snippet -->
  <div
    class="absolute inset-0 flex flex-col justify-end bg-linear-to-t from-black/70 via-transparent to-transparent p-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
  >
    <p class="line-clamp-2 text-left text-xs text-white">{item.prompt_snippet}</p>
  </div>

  <!-- Bottom metadata strip -->
  <div class="border-t border-border/50 px-2.5 py-1.5 text-left">
    <span class="text-[11px] text-text-dim">{timeAgo(item.created_at)}</span>
  </div>
</button>
