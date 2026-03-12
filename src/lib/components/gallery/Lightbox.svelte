<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { createQuery } from '@tanstack/svelte-query';
  import { goto } from '$app/navigation';
  import { generationStore } from '$lib/stores/generation';
  import { timeAgo } from '$lib/utils/format';
  import { PRESIGNED_URL_STALE_MS } from '$lib/utils/constants';
  import { X, Download, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-svelte';
  import apiClient from '$lib/api/client';
  import type { components } from '$lib/api/types';

  type JobSummaryResponse = components['schemas']['JobSummaryResponse'];

  let {
    item,
    allItems,
    onclose,
  }: {
    item: JobSummaryResponse;
    allItems: JobSummaryResponse[];
    onclose: () => void;
  } = $props();

  let navOverride = $state<JobSummaryResponse | null>(null);
  let downloading = $state(false);

  async function handleDownload(url: string) {
    downloading = true;
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const mimeToExt: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/gif': 'gif',
        'video/mp4': 'mp4',
        'video/webm': 'webm',
      };
      const ext = mimeToExt[blob.type] ?? (isVideo ? 'mp4' : 'jpg');
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `apex-${currentItem.id}.${ext}`;
      a.click();
      URL.revokeObjectURL(objectUrl);
    } finally {
      downloading = false;
    }
  }
  const currentItem = $derived(navOverride ?? item);
  const isVideo = $derived(currentItem.generation_type === 't2v' || currentItem.generation_type === 'i2v');

  // Fetch output URLs — reactive because queryKey includes currentItem.id
  const jobQuery = createQuery(() => ({
    queryKey: ['job-outputs', currentItem.id],
    queryFn: async () => {
      const jobId = currentItem.id;
      const { data: outputs } = await apiClient.GET('/v1/storage/jobs/{job_id}/outputs', {
        params: { path: { job_id: jobId } },
      });
      if (!outputs || 'error' in outputs || !outputs.items?.length) return [] as string[];

      const urls = await Promise.all(
        outputs.items.map(async (out) => {
          const { data: access } = await apiClient.GET('/v1/storage/outputs/{output_id}', {
            params: { path: { output_id: out.id } },
          });
          if (!access || 'error' in access) return null;
          return access.presigned_url ?? null;
        }),
      );
      return urls.filter((u): u is string => u !== null);
    },
    staleTime: PRESIGNED_URL_STALE_MS,
  }));

  const currentIndex = $derived(allItems.findIndex((i) => i.id === currentItem.id));

  function prev() {
    if (currentIndex > 0) navOverride = allItems[currentIndex - 1];
  }

  function next() {
    if (currentIndex < allItems.length - 1) navOverride = allItems[currentIndex + 1];
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
    if (e.key === 'ArrowLeft') prev();
    if (e.key === 'ArrowRight') next();
  }

  function handleRegenerate() {
    generationStore.prefill({ prompt: currentItem.prompt });
    goto('/app/create');
    onclose();
  }

  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
    document.body.style.overflow = 'hidden';
  });

  onDestroy(() => {
    window.removeEventListener('keydown', handleKeydown);
    document.body.style.overflow = '';
  });
</script>

<!-- Backdrop -->
<div
  class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
  onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}
  onkeydown={(e) => { if (e.key === 'Escape') onclose(); }}
  role="dialog"
  tabindex="-1"
  aria-modal="true"
  aria-label="Image lightbox"
>
  <!-- Close button -->
  <button
    onclick={onclose}
    class="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm hover:bg-white/20 transition-colors"
    aria-label="Close"
  >
    <X size={18} />
  </button>

  <!-- Navigation arrows -->
  {#if currentIndex > 0}
    <button
      onclick={prev}
      class="absolute left-4 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm hover:bg-white/20 transition-colors"
      aria-label="Previous"
    >
      <ChevronLeft size={20} />
    </button>
  {/if}
  {#if currentIndex < allItems.length - 1}
    <button
      onclick={next}
      class="absolute right-4 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm hover:bg-white/20 transition-colors"
      aria-label="Next"
    >
      <ChevronRight size={20} />
    </button>
  {/if}

  <!-- Main content -->
  <div class="mx-auto flex max-h-[95dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-bg md:flex-row">
    <!-- Media area -->
    <div class="relative flex min-h-[40vh] flex-1 items-center justify-center bg-black">
      {#if jobQuery.isLoading}
        <div class="h-10 w-10 animate-spin rounded-full border-2 border-accent border-t-transparent"></div>
      {:else if jobQuery.data && jobQuery.data.length > 0}
        {#if isVideo}
          <!-- svelte-ignore a11y_media_has_caption -->
          <video
            src={jobQuery.data[0]}
            controls
            autoplay
            loop
            class="max-h-full w-full object-contain"
          ></video>
        {:else}
          <img
            src={jobQuery.data[0]}
            alt={currentItem.prompt}
            class="max-h-[60vh] w-full object-contain md:max-h-full"
          />
        {/if}
      {:else}
        <div class="text-center text-text-dim">
          <div class="mb-2 text-4xl opacity-25">✦</div>
          <p class="text-sm">No outputs available</p>
        </div>
      {/if}
    </div>

    <!-- Metadata panel -->
    <div class="flex w-full flex-col gap-4 overflow-y-auto p-5 md:w-72 md:shrink-0">
      <!-- Actions -->
      <div class="flex gap-2">
        {#if jobQuery.data?.[0]}
          <button
            onclick={() => handleDownload(jobQuery.data![0])}
            disabled={downloading}
            class="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-text hover:bg-surface-hover transition-colors disabled:opacity-50"
          >
            <Download size={13} /> {downloading ? 'Downloading…' : 'Download'}
          </button>
        {/if}
        <button
          onclick={handleRegenerate}
          class="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-text hover:bg-surface-hover transition-colors"
        >
          <RefreshCw size={13} /> Re-generate
        </button>
      </div>

      <!-- Prompt -->
      <div>
        <p class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Prompt</p>
        <p class="text-xs leading-relaxed text-text">{currentItem.prompt}</p>
      </div>

      <!-- Details -->
      <div class="flex flex-col gap-2">
        <p class="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Details</p>
        <div class="flex flex-col gap-1 text-xs">
          <div class="flex justify-between">
            <span class="text-text-dim">Type</span>
            <span class="font-medium uppercase text-text">{currentItem.generation_type}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-text-dim">Created</span>
            <span class="font-medium text-text">{timeAgo(currentItem.created_at)}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-text-dim">Outputs</span>
            <span class="font-medium text-text">{currentItem.output_count}</span>
          </div>
        </div>
      </div>

      <!-- Multiple outputs grid -->
      {#if jobQuery.data && jobQuery.data.length > 1}
        <div>
          <p class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">All Outputs</p>
          <div class="grid grid-cols-3 gap-1">
            {#each jobQuery.data as url, i (i)}
              <img
                src={url}
                alt="Output {i + 1}"
                class="aspect-square w-full cursor-pointer rounded-lg object-cover transition-opacity hover:opacity-80"
                loading="lazy"
              />
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>
