<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
  import { X, Check, ChevronDown, ChevronRight, Pencil, Download } from 'lucide-svelte';
  import {
    libraryAssetQueryOptions,
    libraryGroupQueryOptions,
    libraryKeys,
    renameMutationOptions,
    deleteAssetMutationOptions,
    projectAssignmentMutationOptions,
    projectsListQueryOptions,
  } from '$lib/queries/library';
  import { favoriteMutationOptions } from '$lib/queries/library';
  import { resolveLibraryAction, libraryActionLabel, LIBRARY_ACTION_ICONS } from './actions';
  import { parseAssetRef } from '$lib/utils/assetRef';
  import { isDesktop } from '$lib/utils/breakpoints';
  import { timeAgo, timeUntil, formatAspectRatio } from '$lib/utils/format';
  import { EXPIRES_SOON_MS } from '$lib/utils/constants';
  import MediaImage from '$lib/media/MediaImage.svelte';
  import MediaVideo from '$lib/media/MediaVideo.svelte';
  import ConfirmDeleteModal from '$lib/components/shared/ConfirmDeleteModal.svelte';
  import FrameExtractModal from '$lib/components/frames/FrameExtractModal.svelte';
  import TagChipEditor from '$lib/components/library/TagChipEditor.svelte';
  import LineagePanel from '$lib/components/library/LineagePanel.svelte';
  import { addToast } from '$lib/stores/toasts';
  import * as m from '$paraglide/messages';
  import type { components } from '$lib/api/types';

  type LibraryGroupDetail = components['schemas']['LibraryGroupDetail'];
  type LibraryOutputItem = components['schemas']['LibraryOutputItem'];

  let {
    assetRef,
    onclose,
    onNavigate,
    onSelectVariation,
    startInRename = false,
    startFrameExtraction = false,
    jobIdHint = null,
  }: {
    assetRef: string;
    onclose: () => void;
    /** Opens another asset from the lazy lineage chain. */
    onNavigate?: (assetRef: string) => void;
    /** Re-keys the viewer when a sibling output is selected. */
    onSelectVariation?: (assetRef: string) => void;
    /** Opens the sheet directly in rename mode once detail data has loaded. */
    startInRename?: boolean;
    /** Opens the selected video's frame extractor once its current detail is available. */
    startFrameExtraction?: boolean;
    /** Eagerly loads siblings for a multi-output card while its asset detail loads. */
    jobIdHint?: string | null;
  } = $props();

  // The request effect below resets this whenever the mounted viewer receives a new request.
  let selectedAssetRef = $state(initialSelection());
  let showDeleteConfirm = $state(false);
  let showFrameExtraction = $state(false);
  let frameExtractionTrigger = $state<HTMLButtonElement | null>(null);
  let renaming = $state(false);
  let renameValue = $state('');
  let renameAppliedFor = $state<string | null>(null);
  let frameExtractionAppliedFor = $state<string | null>(null);
  let lineageExpanded = $state(false);
  let previousRequestKey = $state<string | null>(null);

  function initialSelection() {
    return assetRef;
  }

  function focusOnMount(node: HTMLElement) {
    node.focus();
  }

  const queryClient = useQueryClient();
  // The surrounding page keys this viewer by the selected sibling, so every mounted viewer
  // owns a stable asset query rather than retaining data from a previous variation.
  const detailQuery = createQuery(() => libraryAssetQueryOptions(assetRef));
  const currentDetail = $derived(
    detailQuery.data?.asset_ref === selectedAssetRef ? detailQuery.data : undefined,
  );
  const groupJobId = $derived(
    currentDetail
      ? currentDetail.source === 'output' &&
        currentDetail.output_count &&
        currentDetail.output_count > 1
        ? (currentDetail.job_id ?? jobIdHint)
        : null
      : jobIdHint,
  );
  const groupQuery = createQuery(() => ({
    ...libraryGroupQueryOptions(groupJobId ?? ''),
    enabled: !!groupJobId,
  }));
  const currentGroup = $derived(
    groupQuery.data && groupQuery.data.job_id === groupJobId ? groupQuery.data : undefined,
  );
  const selectedOutput = $derived(
    currentGroup?.outputs.find((output) => output.asset_ref === selectedAssetRef),
  );
  const stageMedia = $derived(selectedOutput?.media ?? currentDetail?.media);
  const deleteMutation = createMutation(() => deleteAssetMutationOptions(queryClient));
  const favoriteMutation = createMutation(() => favoriteMutationOptions(queryClient));
  const renameMutation = createMutation(() => renameMutationOptions(queryClient));
  const projectMutation = createMutation(() => projectAssignmentMutationOptions(queryClient));
  const projectsQuery = createQuery(() => projectsListQueryOptions());

  function resetAssetUi() {
    renaming = false;
    renameValue = '';
    lineageExpanded = false;
    showDeleteConfirm = false;
    showFrameExtraction = false;
    frameExtractionTrigger = null;
  }

  $effect(() => {
    const requestKey = `${assetRef}\u0000${jobIdHint ?? ''}`;
    if (previousRequestKey === requestKey) return;
    previousRequestKey = requestKey;
    selectedAssetRef = assetRef;
    renameAppliedFor = null;
    frameExtractionAppliedFor = null;
    resetAssetUi();
  });

  // Selection is stable by asset_ref. A refetch only changes it if the selected output no
  // longer exists, in which case the first surviving output is the safe fallback.
  $effect(() => {
    if (!currentGroup || currentGroup.outputs.length === 0) return;
    if (!currentGroup.outputs.some((output) => output.asset_ref === selectedAssetRef)) {
      selectedAssetRef = currentGroup.outputs[0].asset_ref;
      resetAssetUi();
    }
  });

  $effect(() => {
    if (
      startFrameExtraction &&
      frameExtractionAppliedFor === null &&
      currentDetail?.media.media_type === 'video'
    ) {
      frameExtractionAppliedFor = selectedAssetRef;
      showFrameExtraction = true;
    }
  });

  const isExpiringSoon = $derived.by(() => {
    if (!currentDetail) return false;
    const remaining = new Date(currentDetail.expires_at).getTime() - Date.now();
    return remaining > 0 && remaining < EXPIRES_SOON_MS;
  });

  function startRename() {
    if (!currentDetail) return;
    renameValue = currentDetail.display_title ?? currentDetail.original_filename ?? '';
    renaming = true;
  }

  $effect(() => {
    if (startInRename && renameAppliedFor === null && currentDetail) {
      renameAppliedFor = selectedAssetRef;
      startRename();
    }
  });

  async function submitRename() {
    try {
      await renameMutation.mutateAsync({
        assetRef: selectedAssetRef,
        displayTitle: renameValue.trim() || null,
      });
    } catch {
      addToast({ type: 'error', message: m.error_generic() });
    } finally {
      renaming = false;
    }
  }

  async function handleDelete() {
    try {
      const deletingAssetRef = selectedAssetRef;
      const group = currentGroup;
      const index =
        group?.outputs.findIndex((output) => output.asset_ref === deletingAssetRef) ?? -1;
      const nextAssetRef =
        group && index >= 0
          ? (group.outputs[index + 1]?.asset_ref ?? group.outputs[index - 1]?.asset_ref ?? null)
          : null;

      await deleteMutation.mutateAsync(deletingAssetRef);
      addToast({ type: 'success', message: m.library_delete_success() });
      if (!group || group.outputs.length <= 1 || !nextAssetRef) {
        onclose();
      } else {
        queryClient.setQueryData<LibraryGroupDetail>(libraryKeys.group(group.job_id), (cached) =>
          cached
            ? {
                ...cached,
                outputs: cached.outputs.filter((output) => output.asset_ref !== deletingAssetRef),
              }
            : cached,
        );
        selectedAssetRef = nextAssetRef;
        resetAssetUi();
        queryClient.invalidateQueries({ queryKey: libraryKeys.group(group.job_id) });
        queryClient.invalidateQueries({ queryKey: libraryKeys.asset(deletingAssetRef) });
      }
    } catch {
      addToast({ type: 'error', message: m.library_delete_error() });
    } finally {
      showDeleteConfirm = false;
    }
  }

  function toggleFavorite() {
    if (!currentDetail) return;
    favoriteMutation.mutate({ assetRef: selectedAssetRef, favorite: !currentDetail.is_favorite });
  }

  async function changeProject(projectId: string | null) {
    try {
      await projectMutation.mutateAsync({ assetRef: selectedAssetRef, projectId });
    } catch {
      addToast({ type: 'error', message: m.library_project_assign_error() });
    }
  }

  function navigateLineage(nextAssetRef: string) {
    if (nextAssetRef === selectedAssetRef) return;
    selectedAssetRef = nextAssetRef;
    resetAssetUi();
    onNavigate?.(nextAssetRef);
  }

  function selectVariation(output: LibraryOutputItem) {
    if (output.asset_ref === selectedAssetRef) return;
    selectedAssetRef = output.asset_ref;
    resetAssetUi();
    onSelectVariation?.(output.asset_ref);
  }

  const menuItems = $derived(
    currentDetail
      ? currentDetail.available_actions
          .filter((action) => action !== 'delete' && action !== 'favorite' && action !== 'rename')
          .map((action) => {
            const handler = resolveLibraryAction(action, currentDetail, {
              onExtractFrame: () => (showFrameExtraction = true),
            });
            if (!handler) return null;
            return {
              action,
              label: libraryActionLabel(action),
              icon: LIBRARY_ACTION_ICONS[action],
              onclick: handler,
            };
          })
          .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      : [],
  );

  function handleKeydown(e: KeyboardEvent) {
    if (showFrameExtraction) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      onclose();
    }
  }

  function handleBackdropClick(event: MouseEvent) {
    if (showFrameExtraction) return;
    if (event.target === event.currentTarget) onclose();
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

{#snippet detailsPanel()}
  {#if currentGroup && currentGroup.outputs.length > 1}
    <section aria-label={m.library_all_outputs()} class="p-5 pb-0">
      <p class="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
        {m.library_all_outputs()}
      </p>
      <div class="grid grid-cols-4 gap-1.5 md:grid-cols-3">
        {#each currentGroup.outputs as output, index (output.asset_ref)}
          <button
            type="button"
            onclick={() => selectVariation(output)}
            aria-label={m.library_variation_label({
              index: index + 1,
              count: currentGroup.outputs.length,
            })}
            aria-pressed={selectedAssetRef === output.asset_ref}
            class="relative aspect-square overflow-hidden rounded-lg ring-offset-2 ring-offset-bg transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent {selectedAssetRef ===
            output.asset_ref
              ? 'ring-2 ring-accent'
              : ''}"
          >
            {#if output.media.media_type === 'video'}
              <MediaVideo
                media={output.media}
                muted
                playsinline
                class="h-full w-full object-cover"
              />
            {:else}
              <MediaImage
                media={output.media}
                alt={m.library_variation_label({
                  index: index + 1,
                  count: currentGroup.outputs.length,
                })}
                sizes="80px"
                class="h-full w-full object-cover"
              />
            {/if}
          </button>
        {/each}
      </div>
    </section>
  {:else if groupQuery.isError && groupJobId}
    <p class="px-5 pt-5 text-xs text-text-dim">{m.error_generic()}</p>
  {/if}

  {#if !currentDetail && detailQuery.isLoading}
    <div class="flex flex-col gap-3 p-5">
      <div class="h-4 w-2/3 animate-pulse rounded bg-surface-hover"></div>
      <div class="h-4 w-1/2 animate-pulse rounded bg-surface-hover"></div>
    </div>
  {:else if detailQuery.isError}
    <p class="p-4 text-sm text-danger">{m.error_generic()}</p>
  {:else if currentDetail}
    {@const detail = currentDetail}
    <div
      class="flex flex-col gap-4 p-5 {currentGroup && currentGroup.outputs.length > 1
        ? 'pt-4'
        : ''}"
    >
      <!-- Title / rename -->
      {#if renaming}
        <form
          class="flex items-center gap-2"
          onsubmit={(e) => {
            e.preventDefault();
            submitRename();
          }}
        >
          <input
            bind:value={renameValue}
            use:focusOnMount
            class="min-w-0 flex-1 rounded-lg border border-border bg-bg px-2 py-1 text-sm text-text"
          />
          <button type="submit" class="text-accent" aria-label={m.common_save()}>
            <Check size={16} />
          </button>
        </form>
      {:else}
        <div class="flex items-center justify-between gap-2">
          <p class="truncate text-sm font-semibold text-text">
            {detail.display_title ?? detail.original_filename ?? m.library_untitled()}
          </p>
          {#if detail.available_actions.includes('rename')}
            <button
              onclick={startRename}
              class="shrink-0 text-text-muted hover:text-text"
              aria-label={m.library_action_rename()}
            >
              <Pencil size={14} />
            </button>
          {/if}
        </div>
      {/if}

      <!-- Action buttons -->
      <div class="flex flex-wrap gap-2">
        {#if detail.available_actions.includes('favorite')}
          <button
            onclick={toggleFavorite}
            class="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent/15 px-3 py-2 text-xs font-semibold text-accent transition-colors hover:bg-accent/25"
          >
            {detail.is_favorite ? m.library_action_unfavorite() : m.library_action_favorite()}
          </button>
        {/if}
        {#each menuItems as entry (entry.label)}
          <button
            onclick={(e) => {
              if (entry.action === 'extract_frame') {
                frameExtractionTrigger = e.currentTarget as HTMLButtonElement;
              }
              entry.onclick();
            }}
            class="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent/15 px-3 py-2 text-xs font-semibold text-accent transition-colors hover:bg-accent/25"
          >
            {entry.label}
          </button>
        {/each}
        {#if detail.available_actions.includes('download')}
          <button
            onclick={resolveLibraryAction('download', detail, {}) ?? undefined}
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border text-text transition-colors hover:bg-surface-hover"
            aria-label={m.common_download()}
            title={m.common_download()}
          >
            <Download size={13} />
          </button>
        {/if}
        {#if detail.available_actions.includes('delete')}
          <button
            onclick={() => (showDeleteConfirm = true)}
            class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-danger/30 text-danger transition-colors hover:bg-danger/10"
            aria-label={m.common_delete()}
          >
            <X size={13} />
          </button>
        {/if}
      </div>

      <!-- Project supports the PATCH tri-state: a concrete project, loading/unknown, or null. -->
      <div class="flex items-center justify-between gap-3 border-y border-border py-3">
        <label for="asset-project" class="text-xs text-text-dim">{m.library_project()}</label>
        <select
          id="asset-project"
          value={detail.project_id ?? ''}
          disabled={projectsQuery.isLoading || projectMutation.isPending}
          onchange={(event) =>
            changeProject((event.currentTarget as HTMLSelectElement).value || null)}
          class="min-w-0 max-w-44 rounded-lg border border-border bg-bg px-2 py-1.5 text-xs font-medium text-text disabled:opacity-50"
        >
          <option value="">{m.library_project_unassigned()}</option>
          {#each projectsQuery.data?.items ?? [] as project (project.id)}
            <option value={project.id}>{project.name}</option>
          {/each}
        </select>
      </div>

      <!-- Metadata -->
      <div class="flex flex-col gap-1.5 text-xs">
        <div class="flex justify-between">
          <span class="text-text-dim">{m.library_meta_created()}</span>
          <span class="font-medium text-text">{timeAgo(detail.created_at)}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-text-dim">{m.library_meta_expires()}</span>
          <span class="font-medium {isExpiringSoon ? 'text-warning' : 'text-text'}"
            >{timeUntil(detail.expires_at)}</span
          >
        </div>
        {#if detail.media.original.width && detail.media.original.height}
          <div class="flex justify-between">
            <span class="text-text-dim">{m.library_meta_dimensions()}</span>
            <span class="font-medium text-text"
              >{detail.media.original.width} × {detail.media.original.height}</span
            >
          </div>
        {/if}

        {#if detail.source === 'upload'}
          {#if detail.original_filename}
            <div class="flex justify-between gap-3">
              <span class="shrink-0 text-text-dim">{m.library_meta_filename()}</span>
              <span class="truncate text-right font-medium text-text"
                >{detail.original_filename}</span
              >
            </div>
          {/if}
        {:else}
          {#if detail.model}
            <div class="flex justify-between">
              <span class="text-text-dim">{m.library_meta_model()}</span>
              <span class="font-medium text-text">{detail.model}</span>
            </div>
          {/if}
          {#if detail.provider}
            <div class="flex justify-between">
              <span class="text-text-dim">{m.library_meta_provider()}</span>
              <span class="font-medium text-text"
                >{detail.provider.charAt(0).toUpperCase() + detail.provider.slice(1)}</span
              >
            </div>
          {/if}
          {#if detail.aspect_ratio}
            <div class="flex justify-between">
              <span class="text-text-dim">{m.library_meta_aspect_ratio()}</span>
              <span class="font-medium text-text">{formatAspectRatio(detail.aspect_ratio)}</span>
            </div>
          {/if}
          {#if detail.token_cost != null}
            <div class="flex justify-between">
              <span class="text-text-dim">{m.library_meta_cost()}</span>
              <span class="font-medium text-text">◈ {detail.token_cost}</span>
            </div>
          {/if}
        {/if}
      </div>

      <TagChipEditor assetRef={selectedAssetRef} tags={detail.tags} />

      {#if detail.prompt}
        <div>
          <p class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            {m.library_meta_prompt()}
          </p>
          <p class="text-xs leading-relaxed text-text">{detail.prompt}</p>
        </div>
      {/if}

      {#if detail.negative_prompt}
        <div>
          <p class="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
            {m.library_meta_negative_prompt()}
          </p>
          <p class="text-xs leading-relaxed text-text-dim">{detail.negative_prompt}</p>
        </div>
      {/if}

      {#if detail.lineage || detail.descendants.job_count > 0 || detail.descendants.frame_count > 0}
        <section class="border-t border-border pt-3">
          <button
            type="button"
            class="flex w-full items-center justify-between text-left"
            onclick={() => (lineageExpanded = !lineageExpanded)}
            aria-expanded={lineageExpanded}
          >
            <span class="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
              {m.library_meta_lineage()}
            </span>
            {#if lineageExpanded}<ChevronDown size={14} />{:else}<ChevronRight size={14} />{/if}
          </button>
          <p class="mt-1 text-xs text-text-dim">
            {#if detail.lineage?.source_timestamp_ms != null}
              {m.library_lineage_frame_from_video()}
            {:else if detail.lineage}
              {m.library_lineage_extracted()}
            {:else}
              {m.library_lineage_descendants({
                jobs: detail.descendants.job_count,
                frames: detail.descendants.frame_count,
              })}
            {/if}
          </p>
          {#if lineageExpanded}
            <LineagePanel assetRef={selectedAssetRef} onNavigate={navigateLineage} />
          {/if}
        </section>
      {/if}
    </div>
  {/if}
{/snippet}

<!-- Backdrop -->
<div
  class="fixed inset-0 z-[150] flex flex-col bg-black/80 backdrop-blur-sm md:items-center md:justify-center md:p-4"
  onclick={handleBackdropClick}
  onkeydown={handleKeydown}
  inert={showFrameExtraction ? true : undefined}
  aria-hidden={showFrameExtraction ? 'true' : undefined}
  role="dialog"
  tabindex="-1"
  aria-modal="true"
  aria-label={m.library_details_title()}
>
  <div
    class="flex h-full w-full flex-1 flex-col overflow-hidden bg-bg md:mx-auto md:h-auto md:max-h-[95dvh] md:flex-none md:w-full md:max-w-4xl md:flex-row md:rounded-2xl"
  >
    <!-- Media area -->
    <div class="relative flex min-h-0 flex-1 items-center justify-center bg-black md:min-h-[40vh]">
      <button
        onclick={onclose}
        class="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm transition-colors hover:bg-white/20 md:top-4"
        aria-label={m.common_close()}
      >
        <X size={18} />
      </button>

      {#if stageMedia}
        {#if stageMedia.media_type === 'video'}
          <MediaVideo
            media={stageMedia}
            controls
            autoplay
            loop
            muted
            playsinline
            class="max-h-full w-full object-contain"
          />
        {:else}
          <MediaImage
            media={stageMedia}
            alt={currentDetail?.display_title ?? ''}
            sizes="(max-width: 768px) 100vw, 66vw"
            loading="eager"
            class="max-h-[60vh] w-full object-contain md:max-h-full"
          />
        {/if}
      {:else if detailQuery.isLoading || groupQuery.isLoading}
        <div
          class="h-10 w-10 animate-spin rounded-full border-2 border-accent border-t-transparent"
        ></div>
      {:else if detailQuery.isError}
        <p class="text-sm text-danger">{m.error_generic()}</p>
      {/if}
    </div>

    <!-- Panel -->
    {#if $isDesktop}
      <div class="flex w-72 shrink-0 flex-col overflow-y-auto">
        {@render detailsPanel()}
      </div>
    {:else}
      <div class="safe-bottom-padding min-h-0 flex-1 overflow-y-auto">
        {@render detailsPanel()}
      </div>
    {/if}
  </div>
</div>

{#if showDeleteConfirm}
  <ConfirmDeleteModal
    title={m.library_delete_title()}
    message={m.library_delete_confirm_text()}
    isPending={deleteMutation.isPending}
    onconfirm={handleDelete}
    oncancel={() => (showDeleteConfirm = false)}
  />
{/if}

{#if showFrameExtraction && currentDetail}
  {@const parsedRef = parseAssetRef(selectedAssetRef)}
  <FrameExtractModal
    source={{ type: parsedRef.source, id: parsedRef.id }}
    media={stageMedia ?? currentDetail.media}
    trigger={frameExtractionTrigger}
    onclose={() => (showFrameExtraction = false)}
  />
{/if}
