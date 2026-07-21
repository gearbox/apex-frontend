<script lang="ts">
  import { createMutation, useQueryClient } from '@tanstack/svelte-query';
  import { FolderPlus, Heart, HeartOff, Tag, Trash2, X } from 'lucide-svelte';
  import type { components } from '$lib/api/types';
  import {
    bulkMutationOptions,
    bulkOffenderRefs,
    type BulkMutationVariables,
  } from '$lib/queries/library';
  import ConfirmDeleteModal from '$lib/components/shared/ConfirmDeleteModal.svelte';
  import TagPickerSheet from '$lib/components/library/TagPickerSheet.svelte';
  import { addToast } from '$lib/stores/toasts';
  import * as m from '$paraglide/messages';

  type LibraryAssetItem = components['schemas']['LibraryAssetItem'];
  type LibraryProjectListItem = components['schemas']['LibraryProjectListItem'];

  let {
    selectedItems,
    selectedRefs,
    projects,
    onclear,
    onoffenders,
    onTagDeleted,
  }: {
    selectedItems: LibraryAssetItem[];
    selectedRefs: string[];
    projects: LibraryProjectListItem[];
    onclear: () => void;
    onoffenders: (assetRefs: string[]) => void;
    onTagDeleted?: (tagId: string) => void;
  } = $props();

  const queryClient = useQueryClient();
  const bulkMutation = createMutation(() => bulkMutationOptions(queryClient));
  let showProjectPicker = $state(false);
  let tagPickerMode = $state<'add' | 'remove' | null>(null);
  let showDeleteConfirm = $state(false);

  const selectionCount = $derived(selectedRefs.length);
  const hasAction = (action: 'favorite' | 'delete') =>
    selectedItems.length === selectionCount &&
    selectedItems.every((item) => item.available_actions.includes(action));
  const favoriteEligible = $derived(hasAction('favorite'));
  const deleteEligible = $derived(hasAction('delete'));
  // Project membership is universal according to the bulk API; the length check still
  // protects us from firing when a selected ref is not represented in the current list.
  const projectEligible = $derived(selectedItems.length === selectionCount);
  // Tagging has no available_actions gate in the regenerated contract, so it is valid for
  // every represented source just like project membership.
  const tagEligible = $derived(selectedItems.length === selectionCount);

  async function runBulk(variables: BulkMutationVariables): Promise<boolean> {
    try {
      onoffenders([]);
      await bulkMutation.mutateAsync(variables);
      if (variables.type === 'delete') onclear();
      if (variables.type === 'add_tags' || variables.type === 'remove_tags') {
        addToast({
          type: 'success',
          message: m.library_tags_bulk_success({ count: selectionCount }),
        });
      }
      return true;
    } catch (error) {
      const offenders = bulkOffenderRefs(error);
      if (offenders.length > 0) onoffenders(offenders);
      addToast({
        type: 'error',
        message: offenders.length > 0 ? m.library_bulk_error() : m.error_generic(),
      });
      return false;
    }
  }

  function actionTitle(enabled: boolean): string | undefined {
    return enabled ? undefined : m.library_bulk_unavailable();
  }
</script>

<div
  class="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[120] mx-auto flex w-auto max-w-2xl flex-wrap items-center justify-center gap-2 rounded-2xl border border-border bg-surface/95 p-2 shadow-xl backdrop-blur md:bottom-6 md:left-auto md:right-6"
  role="toolbar"
  aria-label={m.library_selected({ count: selectionCount })}
>
  <span class="px-2 text-xs font-semibold text-text" aria-live="polite"
    >{m.library_selected({ count: selectionCount })}</span
  >
  <button
    type="button"
    disabled={!projectEligible || bulkMutation.isPending}
    title={actionTitle(projectEligible)}
    onclick={() => (showProjectPicker = true)}
    class="flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-semibold text-text-muted hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-45"
  >
    <FolderPlus size={15} />
    <span class="hidden sm:inline">{m.library_add_to_project()}</span>
  </button>
  <button
    type="button"
    disabled={!tagEligible || bulkMutation.isPending}
    title={actionTitle(tagEligible)}
    onclick={() => (tagPickerMode = 'add')}
    class="flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-semibold text-text-muted hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-45"
  >
    <Tag size={15} />
    <span class="hidden sm:inline">{m.library_tags_add()}</span>
  </button>
  <button
    type="button"
    disabled={!tagEligible || bulkMutation.isPending}
    title={actionTitle(tagEligible)}
    onclick={() => (tagPickerMode = 'remove')}
    class="flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-semibold text-text-muted hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-45"
  >
    <Tag size={15} />
    <span class="hidden sm:inline">{m.library_tags_remove()}</span>
  </button>
  <button
    type="button"
    disabled={!favoriteEligible || bulkMutation.isPending}
    title={actionTitle(favoriteEligible)}
    onclick={() => runBulk({ type: 'set_favorite', assetRefs: selectedRefs, value: true })}
    class="flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-semibold text-text-muted hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-45"
  >
    <Heart size={15} />
    <span class="hidden sm:inline">{m.library_action_favorite()}</span>
  </button>
  <button
    type="button"
    disabled={!favoriteEligible || bulkMutation.isPending}
    title={actionTitle(favoriteEligible)}
    onclick={() => runBulk({ type: 'set_favorite', assetRefs: selectedRefs, value: false })}
    class="flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-semibold text-text-muted hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-45"
  >
    <HeartOff size={15} />
    <span class="hidden sm:inline">{m.library_action_unfavorite()}</span>
  </button>
  <button
    type="button"
    disabled={!deleteEligible || bulkMutation.isPending}
    title={actionTitle(deleteEligible)}
    onclick={() => (showDeleteConfirm = true)}
    class="flex items-center gap-1 rounded-lg px-2.5 py-2 text-xs font-semibold text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-45"
  >
    <Trash2 size={15} />
    <span class="hidden sm:inline">{m.common_delete()}</span>
  </button>
  <button
    type="button"
    onclick={onclear}
    class="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover"
    aria-label={m.library_clear_selection()}
  >
    <X size={16} />
  </button>
</div>

{#if showProjectPicker}
  <div
    class="fixed inset-0 z-[180] flex items-end bg-black/50 p-3 md:items-center md:justify-center"
    role="presentation"
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-label={m.library_add_to_project()}
      class="w-full max-w-sm rounded-2xl bg-surface p-4 shadow-2xl"
    >
      <div class="mb-2 flex items-center justify-between gap-3">
        <h2 class="text-sm font-semibold text-text">{m.library_add_to_project()}</h2>
        <button
          type="button"
          class="rounded-md p-1 text-text-muted hover:bg-surface-hover"
          onclick={() => (showProjectPicker = false)}
          aria-label={m.common_close()}
        >
          <X size={16} />
        </button>
      </div>
      <div class="max-h-72 space-y-1 overflow-y-auto">
        <button
          type="button"
          class="w-full rounded-lg px-3 py-2 text-left text-sm text-text-muted hover:bg-surface-hover"
          onclick={() => {
            showProjectPicker = false;
            runBulk({ type: 'set_project', assetRefs: selectedRefs, projectId: null });
          }}
        >
          {m.library_no_project()}
        </button>
        {#each projects as project (project.id)}
          <button
            type="button"
            class="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-text hover:bg-surface-hover"
            onclick={() => {
              showProjectPicker = false;
              runBulk({ type: 'set_project', assetRefs: selectedRefs, projectId: project.id });
            }}
          >
            <span>{project.name}</span>
            <span class="text-xs text-text-dim">{project.asset_count}</span>
          </button>
        {/each}
      </div>
    </div>
  </div>
{/if}

{#if tagPickerMode}
  <TagPickerSheet
    mode={tagPickerMode}
    assetRefs={selectedRefs}
    onapply={(tagIds) =>
      runBulk({
        type: tagPickerMode === 'add' ? 'add_tags' : 'remove_tags',
        assetRefs: selectedRefs,
        tagIds,
      })}
    onclose={() => (tagPickerMode = null)}
    {onTagDeleted}
  />
{/if}

{#if showDeleteConfirm}
  <ConfirmDeleteModal
    title={m.library_bulk_delete_title()}
    message={m.library_bulk_delete_confirm({ count: selectionCount })}
    isPending={bulkMutation.isPending}
    onconfirm={() => {
      showDeleteConfirm = false;
      runBulk({ type: 'delete', assetRefs: selectedRefs });
    }}
    oncancel={() => (showDeleteConfirm = false)}
  />
{/if}
