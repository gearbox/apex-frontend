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
    roleSlotsForModel,
    sourceConsumingMediaKinds,
    sourceIndexForRole,
    toResolverSources,
  } from '$lib/utils/sourceMediaAffordance';
  import { planRoleSelection } from '$lib/utils/sourceRolePlanner';
  import { mediaKindForSlot, roleLabel, type MediaSlot } from '$lib/utils/mediaSlots';
  import type { components } from '$lib/api/types';
  import { shouldCopySourcePrompt } from '$lib/utils/sourcePromptPolicy';
  import * as m from '$paraglide/messages';

  type MediaKind = components['schemas']['MediaKind'];
  type ModelInfo = components['schemas']['ModelInfo'];

  let { modelInfo }: { modelInfo: ModelInfo | null } = $props();

  const queryClient = useQueryClient();
  const MAX_SIZE_BYTES = 20 * 1024 * 1024;
  let dragOver = $state(false);
  let uploading = $state(false);
  let pickerOpen = $state(false);
  /** Set only for the generic/interchangeable list's own replace-in-place flow. */
  let replacementIndex = $state<number | null>(null);
  /** Set only while the active upload/picker trigger targets a named role slot. */
  let pendingRole = $state<MediaSlot | null>(null);
  let fileInput: HTMLInputElement;

  const sourceMedia = $derived($generationStore.sourceMedia);
  const resolverSources = $derived(toResolverSources(sourceMedia));

  // Named positional slots the model actually advertises, in display order.
  // Empty for a purely roleless (Grok-shaped) model, which keeps the Phase 3
  // generic list UX unchanged below.
  const roleSlots = $derived(roleSlotsForModel(modelInfo));

  // The generic/interchangeable sources, paired with their real index in the
  // canonical draft so remove/replace always act on the right position even
  // though this list is filtered.
  const genericEntries = $derived(
    sourceMedia
      .map((source, index) => ({ source, index }))
      .filter((entry) => entry.source.role === null),
  );

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

  // Phase 3 cleanup (P3.1): a retained-but-incompatible draft must never be
  // labelled by the *new* model's single-image shape (e.g. calling a stale
  // video "Source Image"), and the count/max display is meaningless once the
  // model has no source-consuming mode at all.
  const sectionTitle = $derived(
    roleSlots.length === 0 && isSingleImagePicker && !isIncompatible
      ? m.create_source_image_title()
      : m.create_source_media_title(),
  );
  const showCounter = $derived(roleSlots.length === 0 && !isSingleImagePicker && broadMax > 0);

  const activeMediaKinds = $derived(
    pendingRole !== null
      ? [mediaKindForSlot(pendingRole)]
      : replacementIndex === null
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

  function roleSelectionErrorMessage(reason: 'occupied' | 'incompatible' | 'ambiguous'): string {
    switch (reason) {
      case 'occupied':
        return 'That slot is already filled.';
      case 'ambiguous':
        return 'This selection could mean more than one thing — remove or change an existing source first.';
      default:
        return 'That media type is not accepted by this model.';
    }
  }

  /** Add-or-replace for a named role slot: replaces an occupied slot in place, or plans a fresh append. */
  function commitRoleSelection(role: MediaSlot, draft: SourceMediaDraft): boolean {
    const occupantIndex = sourceIndexForRole(sourceMedia, role);
    const duplicate = sourceMedia.some(
      (item, index) => index !== occupantIndex && item.assetRef === draft.assetRef,
    );
    if (duplicate) {
      addToast({ type: 'warning', message: 'That source is already selected.' });
      return false;
    }
    if (occupantIndex !== null) {
      generationStore.replaceSourceMedia(occupantIndex, { ...draft, role });
      return true;
    }
    const plan = planRoleSelection(modelInfo, sourceMedia, role);
    if (!plan.allowed) {
      addToast({ type: 'error', message: roleSelectionErrorMessage(plan.reason) });
      return false;
    }
    for (const promotion of plan.promote) {
      generationStore.setSourceRole(promotion.index, promotion.role);
    }
    generationStore.appendSourceMedia({ ...draft, role: plan.role });
    return true;
  }

  function canUseGeneric(source: SourceMediaDraft, replacing: number | null): boolean {
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

  /** Applies a newly-selected/uploaded source to whichever flow (role slot, or generic list) is active. */
  function commitSelection(draft: SourceMediaDraft, prompt?: string | null) {
    const copyProvenancePrompt = shouldCopySourcePrompt(
      sourceMedia.length,
      $generationStore.prompt,
    );

    if (pendingRole !== null) {
      if (!commitRoleSelection(pendingRole, draft)) return;
    } else {
      if (!canUseGeneric(draft, replacementIndex)) return;
      if (replacementIndex === null) generationStore.appendSourceMedia(draft);
      else generationStore.replaceSourceMedia(replacementIndex, draft);
    }

    // Generic source selection must not replace a prompt the user is already
    // composing. Provenance-copy actions (Remix/Re-Generate) own that policy.
    if (prompt && copyProvenancePrompt) generationStore.setPrompt(prompt);

    replacementIndex = null;
    pendingRole = null;
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
      commitSelection({
        assetRef: `upload:${result.id}`,
        mediaType: result.media.media_type,
        previewUrl: mediaFallbackSrc(result.media, 512),
        label: file.name,
        available: true,
        role: null,
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
    commitSelection(
      {
        assetRef: selection.assetRef,
        mediaType: selection.mediaType,
        previewUrl: selection.previewUrl,
        label: selection.assetRef.startsWith('output:') ? 'From generated' : 'From uploads',
        available: true,
        role: null,
      },
      selection.prompt,
    );
  }

  function openPicker(index: number | null = null) {
    replacementIndex = index;
    pendingRole = null;
    pickerOpen = true;
  }

  function openRolePicker(role: MediaSlot) {
    pendingRole = role;
    replacementIndex = null;
    pickerOpen = true;
  }

  function triggerRoleUpload(role: MediaSlot) {
    pendingRole = role;
    replacementIndex = null;
    fileInput?.click();
  }
</script>

{#snippet mediaPreview(source: SourceMediaDraft)}
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
{/snippet}

<div class="flex flex-col gap-2">
  {#if roleSlots.length === 0}
    <div class="flex items-baseline justify-between">
      <span class="text-[11px] font-semibold uppercase tracking-wider text-text-muted"
        >{sectionTitle}</span
      >
      {#if showCounter}
        <span class="text-[11px] text-text-dim">{sourceMedia.length} / {broadMax}</span>
      {/if}
    </div>
  {/if}

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

  {#each roleSlots as role (role)}
    {@const occupantIndex = sourceIndexForRole(sourceMedia, role)}
    {@const occupant = occupantIndex !== null ? sourceMedia[occupantIndex] : null}
    <div class="flex flex-col gap-2" data-testid="role-slot-{role}">
      <span class="text-[11px] font-semibold uppercase tracking-wider text-text-muted"
        >{roleLabel(role)}</span
      >
      {#if occupant}
        <div
          class="relative flex items-center gap-3 rounded-2.5 border p-3 {occupant.available
            ? 'border-border bg-surface'
            : 'border-warning/60 bg-warning/10'}"
        >
          {@render mediaPreview(occupant)}
          <div class="min-w-0 flex-1">
            <p class="truncate text-xs font-medium text-text">
              {occupant.label ?? occupant.assetRef}
            </p>
            <p class="text-[11px] text-text-dim">
              {occupant.available
                ? (occupant.mediaType ?? 'unknown')
                : m.create_source_role_unavailable()}
            </p>
          </div>
          {#if !occupant.available}
            <button
              type="button"
              onclick={() => openRolePicker(role)}
              class="rounded-md px-2 py-1 text-xs text-accent hover:bg-accent/10"
              >{m.create_source_replace()}</button
            >
          {/if}
          <button
            onclick={() =>
              occupantIndex !== null && generationStore.removeSourceMedia(occupantIndex)}
            class="shrink-0 rounded-md p-1 text-text-muted transition-colors hover:text-text"
            aria-label={m.create_source_remove_role({ role: roleLabel(role).toLowerCase() })}
          >
            <X size={14} />
          </button>
        </div>
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
              pendingRole = role;
              replacementIndex = null;
              if (file) void uploadFile(file);
            }}
            onclick={() => triggerRoleUpload(role)}
          >
            <ImagePlus size={15} />
            {m.create_source_add_role({ role: roleLabel(role).toLowerCase() })}
          </button>
          <button
            type="button"
            onclick={() => openRolePicker(role)}
            class="flex items-center justify-center gap-2 rounded-xl border border-border px-3 py-3 text-xs font-medium text-text-muted transition-colors hover:border-border-active hover:text-text"
          >
            <GalleryHorizontalEnd size={15} /> Library
          </button>
        </div>
      {/if}
    </div>
  {/each}

  {#if genericEntries.length > 0}
    <div class="flex flex-col gap-2">
      {#each genericEntries as entry, position (entry.source.assetRef)}
        <div
          class="relative flex items-center gap-3 rounded-2.5 border p-3 {entry.source.available
            ? 'border-border bg-surface'
            : 'border-warning/60 bg-warning/10'}"
        >
          <span
            class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent"
          >
            {position + 1}
          </span>
          {@render mediaPreview(entry.source)}
          <div class="min-w-0 flex-1">
            <p class="truncate text-xs font-medium text-text">
              {entry.source.label ?? entry.source.assetRef}
            </p>
            <p class="text-[11px] text-text-dim">
              {entry.source.available
                ? `${entry.source.mediaType ?? 'unknown'}${position === 0 ? ' · Primary' : ''}`
                : 'Unavailable — replace to preserve this position'}
            </p>
          </div>
          {#if !entry.source.available}
            <button
              type="button"
              onclick={() => openPicker(entry.index)}
              class="rounded-md px-2 py-1 text-xs text-accent hover:bg-accent/10">Replace</button
            >
          {/if}
          <button
            onclick={() => generationStore.removeSourceMedia(entry.index)}
            class="shrink-0 rounded-md p-1 text-text-muted transition-colors hover:text-text"
            aria-label={entry.source.available &&
            isSingleImagePicker &&
            entry.source.mediaType === 'image'
              ? m.create_source_remove_image()
              : m.create_source_remove_media()}
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
          pendingRole = null;
          const file = event.dataTransfer?.files[0];
          if (file) void uploadFile(file);
        }}
        onclick={() => {
          pendingRole = null;
          replacementIndex = null;
          fileInput.click();
        }}
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
            pendingRole = null;
            const file = event.dataTransfer?.files[0];
            if (file) void uploadFile(file);
          }}
          onclick={() => {
            pendingRole = null;
            replacementIndex = null;
            fileInput.click();
          }}
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
      pendingRole = null;
    }}
    onselect={handlePickerSelect}
  />
{/if}
