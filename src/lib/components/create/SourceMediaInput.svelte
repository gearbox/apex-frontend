<script lang="ts">
  import { generationStore, type SourceMediaDraft } from '$lib/stores/generation';
  import { addToast } from '$lib/stores/toasts';
  import { X, ImagePlus, GalleryHorizontalEnd, AlertTriangle } from '@lucide/svelte';
  import MediaPickerModal from './MediaPickerModal.svelte';
  import type { MediaPickerSelection } from './MediaPickerModal.svelte';
  import { mediaFallbackSrc } from '$lib/media/index';
  import { uploadMedia } from '$lib/api/upload';
  import { useQueryClient } from '@tanstack/svelte-query';
  import { libraryKeys, projectKeys } from '$lib/queries/library';
  import { ACCEPTED_IMAGE_TYPES, ACCEPTED_VIDEO_TYPES } from '$lib/utils/constants';
  import { activeProject } from '$lib/stores/activeProject.svelte';
  import { inheritProjectForUpload } from '$lib/services/projectInheritance';
  import {
    appendableMediaKinds,
    broadMaxSourceCount,
    isSourceDraftAmbiguous,
    isSourceDraftIncompatible,
    replacementMediaKinds,
    sourceConsumingMediaKinds,
    toResolverSources,
  } from '$lib/utils/sourceMediaAffordance';
  import type { components } from '$lib/api/types';
  import { shouldCopySourcePrompt } from '$lib/utils/sourcePromptPolicy';

  type MediaKind = components['schemas']['MediaKind'];
  type ModelInfo = components['schemas']['ModelInfo'];

  let { modelInfo }: { modelInfo: ModelInfo | null } = $props();

  const queryClient = useQueryClient();
  const MAX_SIZE_BYTES = 20 * 1024 * 1024;
  let dragOver = $state(false);
  let uploading = $state(false);
  let pickerOpen = $state(false);
  let replacementIndex = $state<number | null>(null);
  let fileInput: HTMLInputElement;

  const sourceMedia = $derived($generationStore.sourceMedia);
  const resolverSources = $derived(toResolverSources(sourceMedia));

  // A single kind ("image") capped at exactly one item across every advertised
  // source-consuming mode gets the compact single-image drop-zone layout; any
  // richer contract (multiple kinds, or a kind allowing more than one item)
  // uses the generic multi-source list — independent of which source is
  // currently attached, so the empty-state layout never flickers on add/remove.
  const consumingKinds = $derived(sourceConsumingMediaKinds(modelInfo));
  const broadMax = $derived(broadMaxSourceCount(modelInfo));
  const isSingleImagePicker = $derived(
    consumingKinds.length === 1 && consumingKinds[0] === 'image' && broadMax === 1,
  );

  const appendKinds = $derived(appendableMediaKinds(modelInfo, resolverSources));
  const canAddMore = $derived(appendKinds.length > 0);
  const isIncompatible = $derived(isSourceDraftIncompatible(modelInfo, resolverSources));
  const isAmbiguous = $derived(isSourceDraftAmbiguous(modelInfo, resolverSources));

  const activeMediaKinds = $derived(
    replacementIndex === null
      ? appendKinds
      : replacementMediaKinds(modelInfo, resolverSources, replacementIndex),
  );
  const acceptedFileTypes = $derived(
    activeMediaKinds.flatMap((type) =>
      type === 'image' ? ACCEPTED_IMAGE_TYPES : type === 'video' ? ACCEPTED_VIDEO_TYPES : [],
    ),
  );

  function mediaTypeForFile(file: File): MediaKind | null {
    if (file.type.startsWith('image/')) return 'image';
    if (file.type.startsWith('video/')) return 'video';
    return null;
  }

  function canUse(source: SourceMediaDraft, replacing: number | null): boolean {
    const allowedKinds =
      replacing === null
        ? appendKinds
        : replacementMediaKinds(modelInfo, resolverSources, replacing);
    if (!source.mediaType || !allowedKinds.includes(source.mediaType)) {
      addToast({ type: 'error', message: 'That media type is not accepted by this model.' });
      return false;
    }
    const duplicate = sourceMedia.some(
      (item, index) => index !== replacing && item.assetRef === source.assetRef,
    );
    if (duplicate) {
      addToast({ type: 'warning', message: 'That source is already selected.' });
      return false;
    }
    if (replacing === null && !canAddMore) {
      addToast({
        type: 'warning',
        message: `This model accepts up to ${broadMax} source items.`,
      });
      return false;
    }
    return true;
  }

  function addOrReplace(source: SourceMediaDraft) {
    if (!canUse(source, replacementIndex)) return;
    if (replacementIndex === null) generationStore.appendSourceMedia(source);
    else generationStore.replaceSourceMedia(replacementIndex, source);
    replacementIndex = null;
  }

  function validateFile(file: File): string | null {
    const mediaType = mediaTypeForFile(file);
    if (
      !mediaType ||
      !activeMediaKinds.includes(mediaType) ||
      !acceptedFileTypes.includes(file.type)
    ) {
      return 'This model does not accept that file type.';
    }
    if (file.size > MAX_SIZE_BYTES) return 'File must be under 20 MB';
    return null;
  }

  async function uploadFile(file: File) {
    const validationError = validateFile(file);
    if (validationError) {
      addToast({ type: 'error', message: validationError });
      return;
    }
    const mediaType = mediaTypeForFile(file);
    if (!mediaType) return;

    const projectId = activeProject.id;
    uploading = true;
    try {
      const result = await uploadMedia(file);
      addOrReplace({
        assetRef: `upload:${result.id}`,
        mediaType: result.media.media_type,
        previewUrl: mediaFallbackSrc(result.media, 512),
        label: file.name,
        available: true,
      });
      try {
        await inheritProjectForUpload(result.id, projectId);
      } catch {
        // Assignment is convenience metadata; the completed upload remains usable.
      }
      queryClient.invalidateQueries({ queryKey: libraryKeys.all });
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
    } catch (err) {
      addToast({
        type: 'error',
        message: err instanceof Error ? err.message : 'Upload failed. Please try again.',
      });
    } finally {
      uploading = false;
      if (fileInput) fileInput.value = '';
    }
  }

  function handlePickerSelect(selection: MediaPickerSelection) {
    pickerOpen = false;
    const copyProvenancePrompt = shouldCopySourcePrompt(
      sourceMedia.length,
      $generationStore.prompt,
    );
    addOrReplace({
      assetRef: selection.assetRef,
      mediaType: selection.mediaType,
      previewUrl: selection.previewUrl,
      label: selection.assetRef.startsWith('output:') ? 'From generated' : 'From uploads',
      available: true,
    });
    // Generic source selection must not replace a prompt the user is already
    // composing. Provenance-copy actions (Remix/Re-Generate) own that policy.
    if (selection.prompt && copyProvenancePrompt) {
      generationStore.setPrompt(selection.prompt);
    }
  }

  function openPicker(index: number | null = null) {
    replacementIndex = index;
    pickerOpen = true;
  }
</script>

<div class="flex flex-col gap-2">
  <div class="flex items-baseline justify-between">
    <span class="text-[11px] font-semibold uppercase tracking-wider text-text-muted"
      >{isSingleImagePicker ? 'Source Image' : 'Source Media'}</span
    >
    {#if !isSingleImagePicker}
      <span class="text-[11px] text-text-dim">{sourceMedia.length} / {broadMax}</span>
    {/if}
  </div>

  {#if isIncompatible}
    <p
      class="flex items-center gap-2 rounded-lg border border-warning/60 bg-warning/10 px-2.5 py-2 text-xs text-warning"
    >
      <AlertTriangle size={14} class="shrink-0" /> This model cannot use the current source media.
    </p>
  {:else if isAmbiguous}
    <p
      class="flex items-center gap-2 rounded-lg border border-warning/60 bg-warning/10 px-2.5 py-2 text-xs text-warning"
    >
      <AlertTriangle size={14} class="shrink-0" /> This source combination needs a more specific workflow
      choice.
    </p>
  {/if}

  {#if sourceMedia.length > 0}
    <div class="flex flex-col gap-2">
      {#each sourceMedia as source, index (source.assetRef)}
        <div
          class="relative flex items-center gap-3 rounded-2.5 border p-3 {source.available
            ? 'border-border bg-surface'
            : 'border-warning/60 bg-warning/10'}"
        >
          <span
            class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent"
          >
            {index + 1}
          </span>
          {#if source.available && source.previewUrl && (source.mediaType === 'image' || source.mediaType === 'video')}
            <!-- Video preview URLs point at poster variants. -->
            <img src={source.previewUrl} alt="" class="h-12 w-12 rounded-lg object-cover" />
          {:else if source.available}
            <div
              class="flex h-12 w-12 items-center justify-center rounded-lg bg-surface text-center text-[10px] text-text-dim"
            >
              Unsupported
            </div>
          {:else}
            <AlertTriangle size={22} class="text-warning" aria-label="Source unavailable" />
          {/if}
          <div class="min-w-0 flex-1">
            <p class="truncate text-xs font-medium text-text">{source.label ?? source.assetRef}</p>
            <p class="text-[11px] text-text-dim">
              {source.available
                ? `${source.mediaType ?? 'unknown'}${index === 0 ? ' · Primary' : ''}`
                : 'Unavailable — replace to preserve this position'}
            </p>
          </div>
          {#if !source.available}
            <button
              type="button"
              onclick={() => openPicker(index)}
              class="rounded-md px-2 py-1 text-xs text-accent hover:bg-accent/10">Replace</button
            >
          {/if}
          <button
            onclick={() => generationStore.removeSourceMedia(index)}
            class="shrink-0 rounded-md p-1 text-text-muted transition-colors hover:text-text"
            aria-label={isSingleImagePicker ? 'Remove image' : 'Remove source media'}
          >
            <X size={14} />
          </button>
        </div>
      {/each}
    </div>
  {/if}

  {#if canAddMore}
    {#if isSingleImagePicker}
      <button
        type="button"
        disabled={uploading}
        class="flex flex-col items-center gap-2 rounded-2.5 border-2 border-dashed p-5 transition-colors
          {dragOver ? 'border-accent bg-accent-glow' : 'border-border hover:border-border-active'}"
        ondragover={(event) => {
          event.preventDefault();
          dragOver = true;
        }}
        ondragleave={() => (dragOver = false)}
        ondrop={(event) => {
          event.preventDefault();
          dragOver = false;
          const file = event.dataTransfer?.files[0];
          if (file) void uploadFile(file);
        }}
        onclick={() => fileInput.click()}
      >
        <ImagePlus size={24} class="text-text-dim" />
        <span class="text-xs font-medium text-text-muted"
          >{uploading ? 'Uploading…' : 'Drop image here or browse'}</span
        >
        <span class="text-[11px] text-text-dim">PNG, JPEG, WebP · Max 20 MB</span>
      </button>
      <button
        type="button"
        onclick={() => openPicker()}
        class="flex w-full items-center justify-center gap-2 rounded-xl border border-border px-3 py-2.5 text-xs font-medium text-text-muted transition-colors hover:border-border-active hover:text-text"
      >
        <GalleryHorizontalEnd size={14} /> Choose from library
      </button>
    {:else}
      <div class="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={uploading}
          class="flex items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-3 text-xs font-medium text-text-muted transition-colors hover:border-border-active hover:text-text disabled:cursor-wait"
          ondragover={(event) => {
            event.preventDefault();
            dragOver = true;
          }}
          ondragleave={() => (dragOver = false)}
          ondrop={(event) => {
            event.preventDefault();
            dragOver = false;
            const file = event.dataTransfer?.files[0];
            if (file) void uploadFile(file);
          }}
          onclick={() => fileInput.click()}
          class:border-accent={dragOver}
        >
          <ImagePlus size={15} />
          {uploading ? 'Uploading…' : 'Upload'}
        </button>
        <button
          type="button"
          onclick={() => openPicker()}
          class="flex items-center justify-center gap-2 rounded-xl border border-border px-3 py-3 text-xs font-medium text-text-muted transition-colors hover:border-border-active hover:text-text"
        >
          <GalleryHorizontalEnd size={15} /> Library
        </button>
      </div>
    {/if}
  {/if}

  <input
    bind:this={fileInput}
    type="file"
    accept={acceptedFileTypes.join(',')}
    class="hidden"
    onchange={(event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (file) void uploadFile(file);
    }}
  />
</div>

{#if pickerOpen}
  <MediaPickerModal
    open={pickerOpen}
    mediaTypes={activeMediaKinds}
    onclose={() => {
      pickerOpen = false;
      replacementIndex = null;
    }}
    onselect={handlePickerSelect}
  />
{/if}
