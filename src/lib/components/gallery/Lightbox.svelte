<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
  import { goto } from '$app/navigation';
  import { generationStore } from '$lib/stores/generation';
  import { timeAgo, formatAspectRatio } from '$lib/utils/format';
  import { toMediaSrc } from '$lib/media/index';
  import { isDesktop } from '$lib/utils/breakpoints';
  import { X, Download, ChevronLeft, ChevronRight, Repeat2, Trash2 } from 'lucide-svelte';
  import { galleryDetailQueryOptions, deleteContentMutationOptions } from '$lib/queries/gallery';
  import { getAccessToken } from '$lib/stores/auth';
  import { API_BASE_URL } from '$lib/utils/constants';
  import { addToast } from '$lib/stores/toasts';
  import MediaImage from '$lib/media/MediaImage.svelte';
  import MediaVideo from '$lib/media/MediaVideo.svelte';
  import FrameExtractModal from '$lib/components/frames/FrameExtractModal.svelte';
  import ConfirmDeleteModal from '$lib/components/shared/ConfirmDeleteModal.svelte';
  import type { components } from '$lib/api/types';
  import type { GenerationMode } from '$lib/stores/generation';
  import * as m from '$paraglide/messages';

  type GalleryGridItem = components['schemas']['GalleryGridItem'];
  type GalleryOutputItem = components['schemas']['GalleryOutputItem'];
  type GalleryGroupDetail = components['schemas']['GalleryGroupDetail'];
  type ModelType = components['schemas']['ModelType'];

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
  let showDeleteConfirm = $state(false);
  let frameExtractionOutput = $state<GalleryOutputItem | null>(null);
  let frameExtractionTrigger = $state<HTMLButtonElement | null>(null);

  const queryClient = useQueryClient();
  const deleteMutation = createMutation(() => deleteContentMutationOptions(queryClient));

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
    if (frameExtractionOutput) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      onclose();
      return;
    }
    if (e.key === 'ArrowLeft') prev();
    if (e.key === 'ArrowRight') next();
  }

  function handleBackdropClick(event: MouseEvent) {
    if (frameExtractionOutput) return;
    if (event.target === event.currentTarget) onclose();
  }

  function handleParentClose() {
    if (!frameExtractionOutput) onclose();
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

    const output: GalleryOutputItem | undefined =
      detail.outputs[selectedOutputIndex] ?? detail.outputs[0];
    if (!output) return;

    if (output.media.media_type !== 'image') {
      handleRegenerate();
      return;
    }

    generationStore.prefill({
      prompt: detail.prompt,
      negativePrompt: detail.negative_prompt ?? undefined,
      model: (detail.model ?? 'grok-imagine-image') as ModelType,
      mode: 'i2i' as GenerationMode,
    });

    // Must happen AFTER prefill — prefill resets image source fields
    generationStore.setSourceOutputId(output.id, toMediaSrc(output.media.original.url));

    goto('/app/create');
    onclose();
  }

  async function handleDeleteOutput() {
    const detail = detailQuery.data;
    if (!detail) return;
    const output: GalleryOutputItem | undefined =
      detail.outputs[selectedOutputIndex] ?? detail.outputs[0];
    if (!output) return;

    try {
      await deleteMutation.mutateAsync(output.id);
      addToast({ type: 'success', message: m.gallery_delete_success() });

      if (detail.outputs.length <= 1) {
        onclose();
      } else {
        if (selectedOutputIndex >= detail.outputs.length - 1) {
          selectedOutputIndex = Math.max(0, selectedOutputIndex - 1);
        }
      }
    } catch {
      addToast({ type: 'error', message: m.gallery_delete_error() });
    } finally {
      showDeleteConfirm = false;
    }
  }

  async function handleDownload(output: GalleryOutputItem) {
    downloading = true;
    try {
      const token = getAccessToken();
      const absoluteUrl = `${API_BASE_URL}${output.media.original.url}`;
      const response = await fetch(absoluteUrl, {
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
      const ext =
        mimeToExt[output.media.original.content_type] ??
        (output.media.media_type === 'video' ? 'mp4' : 'jpg');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `apex-${output.id}.${ext}`;
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

{#snippet headerBlock(detail: GalleryGroupDetail)}
  {#if detail.badge === 'image' && detail.input_media}
    <div class="flex items-center gap-3">
      <MediaImage
        media={detail.input_media}
        alt="Source"
        sizes="48px"
        class="h-12 w-12 rounded-lg object-cover"
      />
      <p class="text-xs text-text-muted">Source image</p>
    </div>
  {:else}
    <p class="text-sm font-medium leading-snug text-text">
      "{detail.prompt.slice(0, 80)}{detail.prompt.length > 80 ? '…' : ''}"
    </p>
  {/if}
{/snippet}

{#snippet actionsBlock(detail: GalleryGroupDetail)}
  <div class="flex flex-wrap gap-2">
    {#if detail.outputs.length > 0}
      {@const output = detail.outputs[selectedOutputIndex] ?? detail.outputs[0]}
      <button
        onclick={() => handleDownload(output)}
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

    {#if detail.outputs.length > 0}
      {@const output = detail.outputs[selectedOutputIndex] ?? detail.outputs[0]}
      {#if output.media.media_type === 'video'}
        <button
          bind:this={frameExtractionTrigger}
          onclick={() => (frameExtractionOutput = output)}
          class="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent/15 px-3 py-2 text-xs font-semibold text-accent transition-colors hover:bg-accent/25"
        >
          {m.frames_extract_action()}
        </button>
      {/if}
    {/if}

    <button
      onclick={() => (showDeleteConfirm = true)}
      class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-danger/30 text-danger transition-colors hover:bg-danger/10"
      aria-label={m.common_delete()}
      title={m.common_delete()}
    >
      <Trash2 size={13} />
    </button>
  </div>
{/snippet}

{#snippet promptBlock(detail: GalleryGroupDetail)}
  <div>
    <p class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Prompt</p>
    <p class="text-xs leading-relaxed text-text">{detail.prompt}</p>
  </div>
{/snippet}

{#snippet negativePromptBlock(detail: GalleryGroupDetail)}
  {#if detail.negative_prompt}
    <div>
      <p class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
        Negative Prompt
      </p>
      <p class="text-xs leading-relaxed text-text-dim">{detail.negative_prompt}</p>
    </div>
  {/if}
{/snippet}

{#snippet detailsBlock(detail: GalleryGroupDetail)}
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
      <div class="flex justify-between">
        <span class="text-text-dim">Aspect Ratio</span>
        <span class="font-medium text-text">{formatAspectRatio(detail.aspect_ratio)}</span>
      </div>
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
{/snippet}

{#snippet lineageBlock(detail: GalleryGroupDetail)}
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
            {#if detail.lineage.source_job_name && detail.lineage.source_job_id}
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
{/snippet}

{#snippet outputsGridBlock(detail: GalleryGroupDetail)}
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
            <MediaImage
              media={output.media}
              alt="Output {i + 1}"
              sizes="80px"
              class="h-full w-full object-cover"
            />
          </button>
        {/each}
      </div>
    </div>
  {/if}
{/snippet}

{#snippet outputsRowBlock(detail: GalleryGroupDetail)}
  {#if detail.outputs.length > 1}
    <div class="flex shrink-0 gap-2 overflow-x-auto px-4 py-3">
      {#each detail.outputs as output, i (output.id)}
        <button
          onclick={() => (selectedOutputIndex = i)}
          class="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg transition-opacity hover:opacity-80
            {selectedOutputIndex === i ? 'ring-2 ring-accent' : ''}"
        >
          <MediaImage
            media={output.media}
            alt="Output {i + 1}"
            sizes="64px"
            class="h-full w-full object-cover"
          />
        </button>
      {/each}
    </div>
  {/if}
{/snippet}

<!-- Backdrop -->
<!-- z-[150]: above MobileBottomTabs/SystemBanner (z-50/z-100) so the fullscreen mobile
     layout doesn't show app chrome through it, but below ConfirmDeleteModal (z-200)
     so the delete confirmation still stacks above an open Lightbox. -->
<div
  class="fixed inset-0 z-[150] flex flex-col bg-black/80 backdrop-blur-sm md:items-center md:justify-center md:p-4"
  onclick={handleBackdropClick}
  onkeydown={handleKeydown}
  inert={frameExtractionOutput ? true : undefined}
  aria-hidden={frameExtractionOutput ? 'true' : undefined}
  role="dialog"
  tabindex="-1"
  aria-modal="true"
  aria-label="Image lightbox"
>
  <!-- Main content -->
  <div
    class="flex h-full w-full flex-1 flex-col overflow-hidden bg-bg md:mx-auto md:h-auto md:max-h-[95dvh] md:flex-none md:w-full md:max-w-4xl md:flex-row md:rounded-2xl"
  >
    <!-- Media area -->
    <div class="relative flex min-h-0 flex-1 items-center justify-center bg-black md:min-h-[40vh]">
      <!-- Close button -->
      <button
        onclick={handleParentClose}
        class="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20 md:top-4"
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

      {#if detailQuery.isLoading}
        <div
          class="h-10 w-10 animate-spin rounded-full border-2 border-accent border-t-transparent"
        ></div>
      {:else if detailQuery.data && detailQuery.data.outputs.length > 0}
        {@const detail = detailQuery.data}
        {@const output = detail.outputs[selectedOutputIndex] ?? detail.outputs[0]}
        {#if output.media.media_type === 'video'}
          <MediaVideo
            media={output.media}
            controls
            autoplay
            loop
            muted
            playsinline
            class="max-h-full w-full object-contain"
          />
        {:else}
          <MediaImage
            media={output.media}
            alt={detail.prompt}
            sizes="(max-width: 768px) 100vw, 66vw"
            loading="eager"
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

    <!-- Panel -->
    {#if $isDesktop}
      <div class="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto p-5">
        {#if detailQuery.data}
          {@const detail = detailQuery.data}
          {@render headerBlock(detail)}
          {@render actionsBlock(detail)}
          {@render outputsGridBlock(detail)}
          {@render promptBlock(detail)}
          {@render negativePromptBlock(detail)}
          {@render detailsBlock(detail)}
          {@render lineageBlock(detail)}
        {:else if detailQuery.isError}
          <p class="text-sm text-danger">Failed to load details</p>
        {/if}
      </div>
    {:else if detailQuery.data}
      {@const detail = detailQuery.data}
      <div class="flex min-h-0 flex-1 flex-col">
        {@render outputsRowBlock(detail)}

        <div class="shrink-0 px-4 pb-4">
          {@render actionsBlock(detail)}
        </div>

        <div
          class="safe-bottom-padding flex max-h-[45vh] shrink-0 flex-col gap-4 overflow-y-auto px-4 pt-0"
        >
          {@render headerBlock(detail)}
          {@render promptBlock(detail)}
          {@render negativePromptBlock(detail)}
          {@render detailsBlock(detail)}
          {@render lineageBlock(detail)}
        </div>
      </div>
    {:else if detailQuery.isError}
      <p class="p-4 text-sm text-danger">Failed to load details</p>
    {/if}
  </div>
</div>

{#if showDeleteConfirm}
  <ConfirmDeleteModal
    title={m.gallery_delete_title()}
    message={m.gallery_delete_confirm_text()}
    isPending={deleteMutation.isPending}
    onconfirm={handleDeleteOutput}
    oncancel={() => (showDeleteConfirm = false)}
  />
{/if}

{#if frameExtractionOutput}
  <FrameExtractModal
    source={{ type: 'output', id: frameExtractionOutput.id }}
    media={frameExtractionOutput.media}
    trigger={frameExtractionTrigger}
    onclose={() => (frameExtractionOutput = null)}
  />
{/if}
