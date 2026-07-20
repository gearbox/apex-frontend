<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
  import { goto } from '$app/navigation';
  import { generationStore, type GenerationMode } from '$lib/stores/generation';
  import { timeAgo, formatAspectRatio } from '$lib/utils/format';
  import { mediaFallbackSrc } from '$lib/media/index';
  import { isDesktop } from '$lib/utils/breakpoints';
  import { ROUTES } from '$lib/utils/routes';
  import { X, Download, Repeat2, Trash2, Info } from 'lucide-svelte';
  import { libraryGroupQueryOptions, deleteAssetMutationOptions } from '$lib/queries/library';
  import { downloadLibraryMedia } from './download';
  import { addToast } from '$lib/stores/toasts';
  import MediaImage from '$lib/media/MediaImage.svelte';
  import MediaVideo from '$lib/media/MediaVideo.svelte';
  import FrameExtractModal from '$lib/components/frames/FrameExtractModal.svelte';
  import ConfirmDeleteModal from '$lib/components/shared/ConfirmDeleteModal.svelte';
  import type { components } from '$lib/api/types';
  import * as m from '$paraglide/messages';

  type LibraryOutputItem = components['schemas']['LibraryOutputItem'];
  type LibraryGroupDetail = components['schemas']['LibraryGroupDetail'];
  type ModelType = components['schemas']['ModelType'];

  let {
    jobId,
    onclose,
    onOpenAsset,
  }: {
    jobId: string;
    onclose: () => void;
    /** Opens the full details sheet (rename/favorite/metadata) for the selected output. */
    onOpenAsset?: (assetRef: string) => void;
  } = $props();

  let downloading = $state(false);
  let selectedOutputIndex = $state(0);
  let showDeleteConfirm = $state(false);
  let frameExtractionOutput = $state<LibraryOutputItem | null>(null);
  let frameExtractionTrigger = $state<HTMLButtonElement | null>(null);

  const queryClient = useQueryClient();
  const deleteMutation = createMutation(() => deleteAssetMutationOptions(queryClient));

  const detailQuery = createQuery(() => libraryGroupQueryOptions(jobId));

  function handleKeydown(e: KeyboardEvent) {
    if (frameExtractionOutput) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      onclose();
    }
  }

  function handleBackdropClick(event: MouseEvent) {
    if (frameExtractionOutput) return;
    if (event.target === event.currentTarget) onclose();
  }

  function handleRemix() {
    const detail = detailQuery.data;
    if (!detail) return;
    const output = detail.outputs[selectedOutputIndex] ?? detail.outputs[0];
    if (!output) return;

    if (output.media.media_type !== 'image') {
      // Videos: copy prompt + model only, no source image (matches legacy Gallery behavior).
      generationStore.prefill({
        prompt: detail.prompt,
        model: (detail.model ?? 'grok-imagine-image') as ModelType,
      });
      goto(ROUTES.create);
      onclose();
      return;
    }

    generationStore.prefill({
      prompt: detail.prompt,
      negativePrompt: detail.negative_prompt ?? undefined,
      model: (detail.model ?? 'grok-imagine-image') as ModelType,
      mode: 'i2i' as GenerationMode,
    });
    generationStore.setSourceOutputId(output.id, mediaFallbackSrc(output.media, 512));
    goto(ROUTES.create);
    onclose();
  }

  async function handleDeleteOutput() {
    const detail = detailQuery.data;
    if (!detail) return;
    const output = detail.outputs[selectedOutputIndex] ?? detail.outputs[0];
    if (!output) return;

    try {
      await deleteMutation.mutateAsync(output.asset_ref);
      addToast({ type: 'success', message: m.library_delete_success() });

      if (detail.outputs.length <= 1) {
        onclose();
      } else if (selectedOutputIndex >= detail.outputs.length - 1) {
        selectedOutputIndex = Math.max(0, selectedOutputIndex - 1);
      }
    } catch {
      addToast({ type: 'error', message: m.library_delete_error() });
    } finally {
      showDeleteConfirm = false;
    }
  }

  async function handleDownload(output: LibraryOutputItem) {
    downloading = true;
    try {
      await downloadLibraryMedia(output.media, `apex-${output.id}`);
    } catch {
      addToast({ type: 'error', message: m.library_download_error() });
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

{#snippet headerBlock(detail: LibraryGroupDetail)}
  {#if detail.badge === 'image' && detail.input_media}
    <div class="flex items-center gap-3">
      <MediaImage
        media={detail.input_media}
        alt={m.library_source_image()}
        sizes="48px"
        class="h-12 w-12 rounded-lg object-cover"
      />
      <p class="text-xs text-text-muted">{m.library_source_image()}</p>
    </div>
  {:else}
    <p class="text-sm font-medium leading-snug text-text">
      "{detail.prompt.slice(0, 80)}{detail.prompt.length > 80 ? '…' : ''}"
    </p>
  {/if}
{/snippet}

{#snippet actionsBlock(detail: LibraryGroupDetail)}
  <div class="flex flex-wrap gap-2">
    {#if detail.outputs.length > 0}
      {@const output = detail.outputs[selectedOutputIndex] ?? detail.outputs[0]}
      <button
        onclick={() => handleDownload(output)}
        disabled={downloading}
        class="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-medium text-text transition-colors hover:bg-surface-hover disabled:opacity-50"
      >
        <Download size={13} />
        {downloading ? m.common_loading() : m.common_download()}
      </button>
    {/if}

    <button
      onclick={handleRemix}
      class="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent/15 px-3 py-2 text-xs font-semibold text-accent transition-colors hover:bg-accent/25"
    >
      <Repeat2 size={13} />
      {m.library_action_remix()}
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
      {#if onOpenAsset}
        <button
          onclick={() => onOpenAsset(output.asset_ref)}
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-text transition-colors hover:bg-surface-hover"
          aria-label={m.library_meta_details()}
          title={m.library_meta_details()}
        >
          <Info size={13} />
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

{#snippet detailsBlock(detail: LibraryGroupDetail)}
  <div class="flex flex-col gap-2">
    <p class="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
      {m.library_meta_details()}
    </p>
    <div class="flex flex-col gap-1 text-xs">
      <div class="flex justify-between">
        <span class="text-text-dim">{m.library_meta_model()}</span>
        <span class="font-medium text-text">{detail.model ?? m.library_meta_unknown()}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-text-dim">{m.library_meta_provider()}</span>
        <span class="font-medium text-text"
          >{detail.provider
            ? detail.provider.charAt(0).toUpperCase() + detail.provider.slice(1)
            : m.library_meta_unknown()}</span
        >
      </div>
      <div class="flex justify-between">
        <span class="text-text-dim">{m.library_meta_aspect_ratio()}</span>
        <span class="font-medium text-text">{formatAspectRatio(detail.aspect_ratio)}</span>
      </div>
      {#if detail.token_cost != null}
        <div class="flex justify-between">
          <span class="text-text-dim">{m.library_meta_cost()}</span>
          <span class="font-medium text-text">◈ {detail.token_cost}</span>
        </div>
      {/if}
      <div class="flex justify-between">
        <span class="text-text-dim">{m.library_meta_created()}</span>
        <span class="font-medium text-text">{timeAgo(detail.created_at)}</span>
      </div>
      <div class="flex justify-between">
        <span class="text-text-dim">{m.library_meta_outputs()}</span>
        <span class="font-medium text-text">{detail.outputs.length}</span>
      </div>
    </div>
  </div>
{/snippet}

{#snippet outputsGridBlock(detail: LibraryGroupDetail)}
  {#if detail.outputs.length > 1}
    <div>
      <p class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
        {m.library_all_outputs()}
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

{#snippet outputsRowBlock(detail: LibraryGroupDetail)}
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

<div
  class="fixed inset-0 z-[150] flex flex-col bg-black/80 backdrop-blur-sm md:items-center md:justify-center md:p-4"
  onclick={handleBackdropClick}
  onkeydown={handleKeydown}
  inert={frameExtractionOutput ? true : undefined}
  aria-hidden={frameExtractionOutput ? 'true' : undefined}
  role="dialog"
  tabindex="-1"
  aria-modal="true"
  aria-label={m.library_group_title()}
>
  <div
    class="flex h-full w-full flex-1 flex-col overflow-hidden bg-bg md:mx-auto md:h-auto md:max-h-[95dvh] md:flex-none md:w-full md:max-w-4xl md:flex-row md:rounded-2xl"
  >
    <div class="relative flex min-h-0 flex-1 items-center justify-center bg-black md:min-h-[40vh]">
      <button
        onclick={onclose}
        class="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20 md:top-4"
        aria-label={m.common_close()}
      >
        <X size={18} />
      </button>

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
          <p class="text-sm">{m.library_no_outputs()}</p>
        </div>
      {/if}
    </div>

    {#if $isDesktop}
      <div class="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto p-5">
        {#if detailQuery.data}
          {@const detail = detailQuery.data}
          {@render headerBlock(detail)}
          {@render actionsBlock(detail)}
          {@render outputsGridBlock(detail)}
          {@render detailsBlock(detail)}
        {:else if detailQuery.isError}
          <p class="text-sm text-danger">{m.error_generic()}</p>
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
          {@render detailsBlock(detail)}
        </div>
      </div>
    {:else if detailQuery.isError}
      <p class="p-4 text-sm text-danger">{m.error_generic()}</p>
    {/if}
  </div>
</div>

{#if showDeleteConfirm}
  <ConfirmDeleteModal
    title={m.library_delete_title()}
    message={m.library_delete_confirm_text()}
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
