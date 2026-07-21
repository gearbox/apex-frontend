<script lang="ts">
  import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';
  import { Check, Pencil, Plus, Settings2, Tag, Trash2, X } from 'lucide-svelte';
  import type { components } from '$lib/api/types';
  import {
    createTagMutationOptions,
    deleteTagMutationOptions,
    renameTagMutationOptions,
    tagsListQueryOptions,
  } from '$lib/queries/library';
  import ConfirmDeleteModal from '$lib/components/shared/ConfirmDeleteModal.svelte';
  import { addToast } from '$lib/stores/toasts';
  import * as m from '$paraglide/messages';

  type LibraryTagListItem = components['schemas']['LibraryTagListItem'];

  const MAX_BULK_TAGS = 10;

  let {
    mode = 'add',
    assetRefs = [],
    onapply,
    onclose,
    onTagDeleted,
  }: {
    mode?: 'add' | 'remove';
    assetRefs?: string[];
    onapply?: (tagIds: string[]) => Promise<boolean>;
    onclose: () => void;
    onTagDeleted?: (tagId: string) => void;
  } = $props();

  const queryClient = useQueryClient();
  const tagsQuery = createQuery(() => tagsListQueryOptions());
  const createTagRequest = createMutation(() => createTagMutationOptions(queryClient));
  const renameMutation = createMutation(() => renameTagMutationOptions(queryClient));
  const deleteMutation = createMutation(() => deleteTagMutationOptions(queryClient));

  let selectedIds = $state<string[]>([]);
  let manageMode = $state(false);
  let newTagName = $state('');
  let editing = $state<{ id: string; name: string } | null>(null);
  let deleteTarget = $state<LibraryTagListItem | null>(null);
  let applying = $state(false);

  const tags = $derived(tagsQuery.data?.items ?? []);
  const managementOnly = $derived(assetRefs.length === 0 || !onapply);
  const canCreate = $derived(newTagName.trim().length > 0 && newTagName.trim().length <= 50);

  function toggleTag(tagId: string) {
    if (selectedIds.includes(tagId)) {
      selectedIds = selectedIds.filter((id) => id !== tagId);
    } else if (selectedIds.length < MAX_BULK_TAGS) {
      selectedIds = [...selectedIds, tagId];
    }
  }

  async function submitSelection() {
    if (!onapply || selectedIds.length === 0) return;
    applying = true;
    try {
      if (await onapply(selectedIds)) onclose();
    } finally {
      applying = false;
    }
  }

  async function createTag() {
    const name = newTagName.trim();
    if (!canCreate) return;
    try {
      const tag = await createTagRequest.mutateAsync({ name });
      newTagName = '';
      if (!managementOnly) toggleTag(tag.id);
    } catch {
      addToast({ type: 'error', message: m.library_tag_create_error() });
      await tagsQuery.refetch();
    }
  }

  async function saveRename() {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name || name.length > 50) return;
    try {
      await renameMutation.mutateAsync({ tagId: editing.id, patch: { name } });
      editing = null;
    } catch {
      addToast({ type: 'error', message: m.library_tag_rename_error() });
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.id);
      selectedIds = selectedIds.filter((id) => id !== deleteTarget!.id);
      onTagDeleted?.(deleteTarget.id);
      deleteTarget = null;
    } catch {
      addToast({ type: 'error', message: m.library_tag_delete_error() });
    }
  }
</script>

<div
  class="fixed inset-0 z-[190] flex items-end bg-black/50 p-3 md:items-center md:justify-center"
  role="presentation"
>
  <div
    role="dialog"
    aria-modal="true"
    aria-label={manageMode
      ? m.library_tags_manage()
      : mode === 'add'
        ? m.library_tags_add()
        : m.library_tags_remove()}
    class="w-full max-w-sm rounded-2xl bg-surface p-4 shadow-2xl"
  >
    <div class="mb-3 flex items-center justify-between gap-3">
      <div class="min-w-0">
        <h2 class="text-sm font-semibold text-text">
          {manageMode
            ? m.library_tags_manage()
            : mode === 'add'
              ? m.library_tags_add()
              : m.library_tags_remove()}
        </h2>
        {#if !manageMode && !managementOnly}
          <p class="mt-0.5 text-xs text-text-dim">
            {m.library_tags_selected({ count: selectedIds.length, max: MAX_BULK_TAGS })}
          </p>
        {/if}
      </div>
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover"
          onclick={() => (manageMode = !manageMode)}
          aria-label={manageMode ? m.library_tags_back_to_picker() : m.library_tags_manage()}
          title={manageMode ? m.library_tags_back_to_picker() : m.library_tags_manage()}
        >
          {#if manageMode}<Tag size={16} />{:else}<Settings2 size={16} />{/if}
        </button>
        <button
          type="button"
          class="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover"
          onclick={onclose}
          aria-label={m.common_close()}
        >
          <X size={16} />
        </button>
      </div>
    </div>

    {#if manageMode}
      <form
        class="mb-3 flex gap-2"
        onsubmit={(event) => {
          event.preventDefault();
          void createTag();
        }}
      >
        <input
          bind:value={newTagName}
          maxlength="50"
          aria-label={m.library_tag_name()}
          placeholder={m.library_tag_name()}
          class="min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={!canCreate || createTagRequest.isPending}
          class="flex items-center gap-1 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          <Plus size={14} />
          {m.library_tag_create_action()}
        </button>
      </form>
    {/if}

    {#if tagsQuery.isLoading}
      <div class="space-y-2 py-3">
        <div class="h-8 animate-pulse rounded bg-surface-hover"></div>
        <div class="h-8 animate-pulse rounded bg-surface-hover"></div>
      </div>
    {:else if tagsQuery.isError}
      <div class="py-4 text-center">
        <p class="text-xs text-danger">{m.error_generic()}</p>
        <button
          class="mt-2 text-xs font-medium text-accent hover:underline"
          onclick={() => tagsQuery.refetch()}>{m.common_retry()}</button
        >
      </div>
    {:else if tags.length === 0}
      <p class="py-4 text-center text-xs text-text-dim">{m.library_tags_empty()}</p>
    {:else}
      <div class="max-h-72 space-y-1 overflow-y-auto">
        {#each tags as tag (tag.id)}
          {#if manageMode}
            <div class="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-surface-hover">
              <span class="min-w-0 flex-1 truncate text-sm text-text">{tag.name}</span>
              <span class="text-xs tabular-nums text-text-dim">{tag.asset_count}</span>
              <button
                type="button"
                class="rounded p-1 text-text-muted hover:bg-bg hover:text-text"
                aria-label={`${m.library_tag_rename()}: ${tag.name}`}
                onclick={() => (editing = { id: tag.id, name: tag.name })}
              >
                <Pencil size={14} />
              </button>
              <button
                type="button"
                class="rounded p-1 text-text-muted hover:bg-danger/10 hover:text-danger"
                aria-label={`${m.common_delete()}: ${tag.name}`}
                onclick={() => (deleteTarget = tag)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          {:else}
            <label
              class="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-hover"
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(tag.id)}
                disabled={!selectedIds.includes(tag.id) && selectedIds.length >= MAX_BULK_TAGS}
                onchange={() => toggleTag(tag.id)}
                class="accent-accent"
              />
              <span class="min-w-0 flex-1 truncate text-sm text-text">{tag.name}</span>
              <span class="text-xs tabular-nums text-text-dim">{tag.asset_count}</span>
            </label>
          {/if}
        {/each}
      </div>
    {/if}

    {#if !manageMode && !managementOnly}
      <div class="mt-4 flex justify-end gap-2 border-t border-border pt-3">
        <button
          type="button"
          class="rounded-lg px-3 py-2 text-xs font-semibold text-text-muted hover:bg-surface-hover"
          onclick={onclose}>{m.common_cancel()}</button
        >
        <button
          type="button"
          disabled={selectedIds.length === 0 || applying}
          onclick={() => void submitSelection()}
          class="flex items-center gap-1 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          <Check size={14} />
          {m.library_tags_apply()}
        </button>
      </div>
    {/if}
  </div>
</div>

{#if editing}
  <div
    class="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
    role="presentation"
  >
    <form
      class="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-2xl"
      onsubmit={(event) => {
        event.preventDefault();
        void saveRename();
      }}
    >
      <h2 class="mb-3 text-sm font-semibold text-text">{m.library_tag_rename()}</h2>
      <input
        bind:value={editing.name}
        maxlength="50"
        aria-label={m.library_tag_name()}
        class="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
      />
      <div class="mt-4 flex justify-end gap-2">
        <button
          type="button"
          class="rounded-lg px-3 py-2 text-xs font-semibold text-text-muted hover:bg-surface-hover"
          onclick={() => (editing = null)}>{m.common_cancel()}</button
        >
        <button
          type="submit"
          disabled={renameMutation.isPending}
          class="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >{m.common_save()}</button
        >
      </div>
    </form>
  </div>
{/if}

{#if deleteTarget}
  <ConfirmDeleteModal
    title={m.library_tag_delete_title()}
    message={m.library_tag_delete_confirm({ count: deleteTarget.asset_count })}
    isPending={deleteMutation.isPending}
    onconfirm={() => void confirmDelete()}
    oncancel={() => (deleteTarget = null)}
  />
{/if}
