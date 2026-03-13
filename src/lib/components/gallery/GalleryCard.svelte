<script lang="ts">
  import { timeAgo } from '$lib/utils/format';
  import { Play } from 'lucide-svelte';
  import type { components } from '$lib/api/types';

  type JobSummaryResponse = components['schemas']['JobSummaryResponse'];

  let { item, onclick }: { item: JobSummaryResponse; onclick: () => void } = $props();

  const isVideo = $derived(item.generation_type === 't2v' || item.generation_type === 'i2v');

  // thumbnail_url is a presigned URL included directly in the JobSummaryResponse —
  // no secondary fetch needed.
  const thumbnailUrl = $derived(item.thumbnail_url ?? null);
</script>

<button
  {onclick}
  class="group relative overflow-hidden rounded-xl border border-border bg-surface transition-all hover:border-border-active hover:shadow-lg"
>
  <!-- Thumbnail / placeholder -->
  <div class="aspect-square w-full overflow-hidden bg-surface">
    {#if thumbnailUrl}
      {#if isVideo}
        <div class="relative h-full w-full bg-black">
          <div class="absolute inset-0 flex items-center justify-center">
            <div class="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm">
              <Play size={16} fill="white" class="text-white" />
            </div>
          </div>
        </div>
      {:else}
        <img
          src={thumbnailUrl}
          alt={item.prompt}
          class="h-full w-full object-cover transition-transform group-hover:scale-105"
          loading="lazy"
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

  <!-- Hover overlay with prompt -->
  <div class="absolute inset-0 flex flex-col justify-end bg-linear-to-t from-black/70 via-transparent to-transparent p-3 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
    <p class="line-clamp-2 text-left text-xs text-white">{item.prompt}</p>
  </div>

  <!-- Video type badge -->
  {#if isVideo}
    <div class="absolute left-2 top-2 rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
      VIDEO
    </div>
  {/if}

  <!-- Bottom metadata strip -->
  <div class="border-t border-border/50 px-2.5 py-1.5 text-left">
    <span class="text-[11px] text-text-dim">{timeAgo(item.created_at)}</span>
  </div>
</button>
