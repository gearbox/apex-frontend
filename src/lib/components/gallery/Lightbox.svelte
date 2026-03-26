<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { createQuery } from '@tanstack/svelte-query';
  import { goto } from '$app/navigation';
  import { generationStore } from '$lib/stores/generation';
  import { timeAgo } from '$lib/utils/format';
  import { API_BASE_URL } from '$lib/utils/constants';
  import { X, Download, ChevronLeft, ChevronRight, Repeat2 } from 'lucide-svelte';
  import { galleryDetailQueryOptions } from '$lib/queries/gallery';
  import { getAccessToken } from '$lib/stores/auth';
  import AuthImage from '$lib/components/ui/AuthImage.svelte';
  import AuthVideo from '$lib/components/ui/AuthVideo.svelte';
  import type { components } from '$lib/api/types';
  import type { GenerationMode } from '$lib/stores/generation';

  type GalleryGridItem = components['schemas']['GalleryGridItem'];
  type ModelType = components['schemas']['ModelType'];
  type AspectRatio = components['schemas']['AspectRatio'];

  let {
    item,
    allItems,
    onclose,
  }: {
    item: GalleryGridItem;
    allItems: GalleryGridItem[];
    onclose: () => void;
  } = $props();

  let navOverride = $state<GalleryGridItem | null>(null);
  let downloading = $state(false);
  let selectedOutputIndex = $state(0);

  const currentItem = $derived(navOverride ?? item);

  const detailQuery = createQuery(() => galleryDetailQueryOptions(currentItem.job_id));

  const currentIndex = $derived(allItems.findIndex((i) => i.job_id === currentItem.job_id));

  function prev() {
    if (currentIndex > 0) {
      navOverride = allItems[currentIndex - 1];
      selectedOutputIndex = 0;
    }
  }

  function next() {
    if (currentIndex < allItems.length - 1) {
      navOverride = allItems[currentIndex + 1];
      selectedOutputIndex = 0;
    }
  }

  function navigateToSourceJob(sourceJobId: string) {
    const sourceItem = allItems.find((i) => i.job_id === sourceJobId);
    if (sourceItem) {
      navOverride = sourceItem;
      selectedOutputIndex = 0;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose();
    if (e.key === 'ArrowLeft') prev();
    if (e.key === 'ArrowRight') next();
  }

  function handleRegenerate() {
    if (!detailQuery.data) return;
    const detail = detailQuery.data;
    generationStore.prefill({
      prompt: detail.prompt,
      model: (detail.model ?? 'grok-imagine-image') as ModelType,
    });
    goto('/app/create');
    onclose();
  }

  function handleRemix() {
    if (!detailQuery.data) return;
    const detail = detailQuery.data;

    const output = detail.outputs[selectedOutputIndex] ?? detail.outputs[0];
    if (!output) return;

    if (output.media_type !== 'image') {
      handleRegenerate();
      return;
    }

    generationStore.prefill({
      prompt: detail.prompt,
      negativePrompt: detail.negative_prompt ?? undefined,
      model: (detail.model ?? 'grok-imagine-image') as ModelType,
      mode: 'i2i' as GenerationMode,
      aspectRatio: (detail.aspect_ratio ?? '1:1') as AspectRatio,
    });

    // Must happen AFTER prefill — prefill resets image source fields
    generationStore.setSourceOutputId(output.id, output.url);

    goto('/app/create');
    onclose();
  }

  async function handleDownload(outputUrl: string, outputId: string) {
    downloading = true;
    try {
      const token = getAccessToken();
      const response = await fetch(`${API_BASE_URL}${outputUrl}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const blob = await response.blob();
      const mimeToExt: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'video/mp4': 'mp4',
        'video/webm': 'webm',
      };
      const detail = detailQuery.data;
      const ext = mimeToExt[blob.type] ?? (detail?.media_type === 'video' ? 'mp4' : 'jpg');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `apex-${outputId}.${ext}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      downloading = false;
    }
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
  onclick={(e) => {
    if (e.target === e.currentTarget) onclose();
  }}
  onkeydown={(e) => {
    if (e.key === 'Escape') onclose();
  }}
  role="dialog"
  tabindex="-1"
  aria-modal="true"
  aria-label="Image lightbox"
>
  <!-- Close button -->
  <button
    onclick={onclose}
    class="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
    aria-label="Close"
  >
    <X size={18} />
  </button>

  <!-- Navigation arrows -->
  {#if currentIndex > 0}
    <button
      onclick={prev}
      class="absolute left-4 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
      aria-label="Previous"
    >
      <ChevronLeft size={20} />
    </button>
  {/if}
  {#if currentIndex < allItems.length - 1}
    <button
      onclick={next}
      class="absolute right-4 top-1/2 z-10 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20"
      aria-label="Next"
    >
      <ChevronRight size={20} />
    </button>
  {/if}

  <!-- Main content -->
  <div
    class="mx-auto flex max-h-[95dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-bg md:flex-row"
  >
    <!-- Media area -->
    <div class="relative flex min-h-[40vh] flex-1 items-center justify-center bg-black">
      {#if detailQuery.isLoading}
        <div
          class="h-10 w-10 animate-spin rounded-full border-2 border-accent border-t-transparent"
        ></div>
      {:else if detailQuery.data && detailQuery.data.outputs.length > 0}
        {@const detail = detailQuery.data}
        {@const output = detail.outputs[selectedOutputIndex] ?? detail.outputs[0]}
        {#if detail.media_type === 'video'}
          <AuthVideo
            src={output.url}
            posterSrc={output.thumbnail_url}
            controls
            autoplay
            loop
            muted
            playsinline
            class="max-h-full w-full object-contain"
          />
        {:else}
          <AuthImage
            src={output.url}
            alt={detail.prompt}
            class="max-h-[60vh] w-full object-contain md:max-h-full"
            loading="eager"
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
      {#if detailQuery.data}
        {@const detail = detailQuery.data}

        <!-- Header: input image or prompt -->
        {#if detail.badge === 'image' && detail.input_image_url}
          <div class="flex items-center gap-3">
            <AuthImage
              src={detail.input_image_url}
              alt="Source"
              class="h-12 w-12 rounded-lg object-cover"
            />
            <p class="text-xs text-text-muted">Source image</p>
          </div>
        {:else}
          <p class="text-sm font-medium leading-snug text-text">
            "{detail.prompt.slice(0, 80)}{detail.prompt.length > 80 ? '…' : ''}"
          </p>
        {/if}

        <!-- Actions -->
        <div class="flex gap-2">
          {#if detail.outputs.length > 0}
            {@const output = detail.outputs[selectedOutputIndex] ?? detail.outputs[0]}
            <button
              onclick={() => handleDownload(output.url, output.id)}
              disabled={downloading}
              class="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-text transition-colors hover:bg-surface-hover disabled:opacity-50"
            >
              <Download size={13} />
              {downloading ? 'Downloading…' : 'Download'}
            </button>
          {/if}

          <button
            onclick={handleRemix}
            class="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent/15 px-3 py-2 text-xs font-semibold text-accent transition-colors hover:bg-accent/25"
          >
            <Repeat2 size={13} /> Re-Generate
          </button>
        </div>

        <!-- Prompt -->
        <div>
          <p class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            Prompt
          </p>
          <p class="text-xs leading-relaxed text-text">{detail.prompt}</p>
        </div>

        <!-- Negative Prompt -->
        {#if detail.negative_prompt}
          <div>
            <p class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              Negative Prompt
            </p>
            <p class="text-xs leading-relaxed text-text-dim">{detail.negative_prompt}</p>
          </div>
        {/if}

        <!-- Details -->
        <div class="flex flex-col gap-2">
          <p class="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Details</p>
          <div class="flex flex-col gap-1 text-xs">
            <div class="flex justify-between">
              <span class="text-text-dim">Type</span>
              <span class="font-medium uppercase text-text">{detail.generation_type}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-text-dim">Model</span>
              <span class="font-medium text-text">{detail.model ?? 'Unknown'}</span>
            </div>
            <div class="flex justify-between">
              <span class="text-text-dim">Provider</span>
              <span class="font-medium text-text"
                >{detail.provider
                  ? detail.provider.charAt(0).toUpperCase() + detail.provider.slice(1)
                  : 'Unknown'}</span
              >
            </div>
            {#if detail.aspect_ratio}
              <div class="flex justify-between">
                <span class="text-text-dim">Aspect Ratio</span>
                <span class="font-medium text-text">{detail.aspect_ratio}</span>
              </div>
            {/if}
            {#if detail.token_cost != null}
              <div class="flex justify-between">
                <span class="text-text-dim">Cost</span>
                <span class="font-medium text-text">◈ {detail.token_cost}</span>
              </div>
            {/if}
            <div class="flex justify-between">
              <span class="text-text-dim">Created</span>
              <span class="font-medium text-text">{timeAgo(detail.created_at)}</span>
            </div>
            {#if detail.completed_at}
              <div class="flex justify-between">
                <span class="text-text-dim">Completed</span>
                <span class="font-medium text-text">{timeAgo(detail.completed_at)}</span>
              </div>
            {/if}
            <div class="flex justify-between">
              <span class="text-text-dim">Outputs</span>
              <span class="font-medium text-text">{detail.outputs.length}</span>
            </div>
          </div>
        </div>

        <!-- Lineage -->
        {#if detail.lineage}
          <div class="flex flex-col gap-2">
            <p class="text-[11px] font-semibold uppercase tracking-wide text-text-muted">Lineage</p>
            <div class="flex flex-col gap-1.5 text-xs">
              {#if detail.lineage.source_type === 'upload'}
                <p class="text-text-dim">
                  Derived from <span class="font-medium text-accent">uploaded image</span>
                </p>
              {:else if detail.lineage.source_type === 'generation'}
                <p class="text-text-dim">
                  Remixed from
                  {#if detail.lineage.source_job_name}
                    <button
                      onclick={() => navigateToSourceJob(detail.lineage!.source_job_id!)}
                      class="font-medium text-accent hover:underline"
                    >
                      {detail.lineage.source_job_name}
                    </button>
                  {:else}
                    <span class="font-medium text-text">a previous generation</span>
                  {/if}
                </p>
              {/if}
            </div>
          </div>
        {/if}

        <!-- All Outputs grid (if > 1) -->
        {#if detail.outputs.length > 1}
          <div>
            <p class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              All Outputs
            </p>
            <div class="grid grid-cols-3 gap-1">
              {#each detail.outputs as output, i (output.id)}
                <button
                  onclick={() => (selectedOutputIndex = i)}
                  class="relative aspect-square overflow-hidden rounded-lg transition-opacity hover:opacity-80
                    {selectedOutputIndex === i ? 'ring-2 ring-accent' : ''}"
                >
                  <AuthImage
                    src={output.url}
                    alt="Output {i + 1}"
                    class="h-full w-full object-cover"
                  />
                </button>
              {/each}
            </div>
          </div>
        {/if}
      {:else if detailQuery.isError}
        <p class="text-sm text-danger">Failed to load details</p>
      {/if}
    </div>
  </div>
</div>
