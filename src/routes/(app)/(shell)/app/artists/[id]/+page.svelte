<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { createInfiniteQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
  import type { InfiniteData } from '@tanstack/svelte-query';
  import { Archive, MoreHorizontal, Pencil, RotateCcw, Trash2 } from '@lucide/svelte';
  import {
    createMemoryMutationOptions,
    deleteMemoryMutationOptions,
    memoriesInfiniteQueryOptions,
    studioKeys,
    updateMemoryMutationOptions,
  } from '$lib/queries/studio';
  import type { MemoryFormPayload } from '$lib/components/studio/MemoryForm.svelte';
  import MemoryForm from '$lib/components/studio/MemoryForm.svelte';
  import ConfirmDeleteModal from '$lib/components/shared/ConfirmDeleteModal.svelte';
  import ContextMenu from '$lib/components/shared/ContextMenu.svelte';
  import InfiniteScrollSentinel from '$lib/components/shared/InfiniteScrollSentinel.svelte';
  import Spinner from '$lib/components/ui/Spinner.svelte';
  import { addToast } from '$lib/stores/toasts';
  import { isDesktop } from '$lib/utils/breakpoints';
  import { formatLocalIsoDate } from '$lib/studio/memoryDraft';
  import { studioError, validationIssues } from '$lib/studio/formErrors';
  import { locale } from '$lib/stores/locale';
  import type { components } from '$lib/api/types';
  import * as m from '$paraglide/messages';

  type Memory = components['schemas']['MemoryOut'];
  type MemoryPage = components['schemas']['CursorPage_src.api.schemas.studio.MemoryOut_'];
  type MemoryStatus = components['schemas']['StudioMemoryStatus'];

  const queryClient = useQueryClient();
  let artistId = $derived($page.params.id ?? '');
  let status = $state<MemoryStatus>('active');
  let composerOpen = $state(false);
  let composerAutofocus = $state(false);
  let composerVersion = $state(0);
  let editMemory = $state<Memory | null>(null);
  let deleteMemory = $state<Memory | null>(null);
  let openMobileMenuId = $state<string | null>(null);
  let expandedMemoryIds = $state<string[]>([]);
  let actionError = $state('');

  const memoriesQuery = createInfiniteQuery(() => ({
    ...memoriesInfiniteQueryOptions(artistId, status),
    enabled: !!artistId,
  }));
  const createMemory = createMutation(() => createMemoryMutationOptions(queryClient));
  const updateMemory = createMutation(() => updateMemoryMutationOptions(queryClient));
  const deleteMemoryMutation = createMutation(() => deleteMemoryMutationOptions(queryClient));
  let memories = $derived(memoriesQuery.data?.pages.flatMap((result) => result.items) ?? []);
  let operationIssues = $derived(validationIssues(createMemory.error ?? updateMemory.error));

  onMount(() => {
    if ($page.url.searchParams.get('compose') === '1') {
      composerOpen = true;
      composerAutofocus = true;
      void goto($page.url.pathname, { replaceState: true, keepFocus: true, noScroll: true });
    }
  });

  function cachedMemory(id: string): Memory | undefined {
    for (const currentStatus of ['active', 'archived'] as const) {
      const data = queryClient.getQueryData<InfiniteData<MemoryPage>>(
        studioKeys.memories(artistId, currentStatus),
      );
      const found = data?.pages.flatMap((result) => result.items).find((item) => item.id === id);
      if (found) return found;
    }
    return undefined;
  }

  function patchFromForm(serverMemory: Memory, payload: MemoryFormPayload) {
    const patch: components['schemas']['MemoryPatch'] = {};
    if (serverMemory.title !== payload.title) patch.title = payload.title;
    if (serverMemory.body !== payload.body) patch.body = payload.body;
    if (serverMemory.occurred_on !== (payload.occurred_on ?? null)) {
      patch.occurred_on = payload.occurred_on ?? null;
    }
    if (JSON.stringify(serverMemory.themes) !== JSON.stringify(payload.themes))
      patch.themes = payload.themes;
    if (JSON.stringify(serverMemory.imagery) !== JSON.stringify(payload.imagery))
      patch.imagery = payload.imagery;
    if (serverMemory.salience !== payload.salience) patch.salience = payload.salience;
    return patch;
  }

  async function saveNewMemory(payload: MemoryFormPayload) {
    actionError = '';
    try {
      await createMemory.mutateAsync({
        artistId,
        body: {
          title: payload.title,
          body: payload.body,
          ...(payload.occurred_on ? { occurred_on: payload.occurred_on } : {}),
          themes: payload.themes,
          imagery: payload.imagery,
          salience: payload.salience,
        },
      });
      composerVersion += 1;
      composerAutofocus = false;
      if (!$isDesktop) composerOpen = false;
      addToast({ type: 'success', message: m.studio_memory_saved() });
    } catch (error) {
      actionError =
        studioError(error)?.error === 'memory_limit_reached'
          ? m.studio_memory_limit_reached()
          : m.studio_memory_save_error();
    }
  }

  async function saveEditedMemory(payload: MemoryFormPayload) {
    if (!editMemory) return;
    const current = cachedMemory(editMemory.id) ?? editMemory;
    const patch = patchFromForm(current, payload);
    if (Object.keys(patch).length === 0) {
      editMemory = null;
      return;
    }
    try {
      await updateMemory.mutateAsync({ id: current.id, artistId, patch });
      editMemory = null;
      addToast({ type: 'success', message: m.studio_memory_saved() });
    } catch {
      actionError = m.studio_memory_save_error();
    }
  }

  async function changeMemoryStatus(memory: Memory, next: MemoryStatus) {
    actionError = '';
    try {
      await updateMemory.mutateAsync({ id: memory.id, artistId, patch: { status: next } });
    } catch (error) {
      actionError =
        studioError(error)?.error === 'memory_limit_reached'
          ? m.studio_restore_limit_reached()
          : m.studio_memory_update_error();
      addToast({ type: 'error', message: actionError });
    }
  }

  async function confirmDeleteMemory() {
    if (!deleteMemory) return;
    try {
      await deleteMemoryMutation.mutateAsync({ id: deleteMemory.id, artistId });
      deleteMemory = null;
      addToast({ type: 'success', message: m.studio_memory_deleted() });
    } catch {
      actionError = m.studio_memory_delete_error();
      deleteMemory = null;
    }
  }

  function toggleExpanded(memoryId: string) {
    expandedMemoryIds = expandedMemoryIds.includes(memoryId)
      ? expandedMemoryIds.filter((id) => id !== memoryId)
      : [...expandedMemoryIds, memoryId];
  }

  function menuItems(memory: Memory) {
    return [
      {
        label: m.common_edit(),
        icon: Pencil,
        onclick: () => {
          editMemory = memory;
        },
      },
      memory.status === 'active'
        ? {
            label: m.studio_archive(),
            icon: Archive,
            onclick: () => changeMemoryStatus(memory, 'archived'),
          }
        : {
            label: m.studio_restore(),
            icon: RotateCcw,
            onclick: () => changeMemoryStatus(memory, 'active'),
          },
      {
        label: m.common_delete(),
        icon: Trash2,
        variant: 'danger' as const,
        onclick: () => {
          deleteMemory = memory;
        },
      },
    ];
  }
</script>

<svelte:head>
  <title>{m.artists_tab_diary()} — {m.artists_title()}</title>
</svelte:head>

<div class="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_270px]">
  <div class="min-w-0 space-y-5">
    <section
      class="hidden rounded-2xl border border-border bg-surface p-4 md:block md:p-5"
      aria-label={m.studio_quick_capture()}
    >
      {#key `desktop-${composerVersion}`}
        <MemoryForm
          idPrefix="desktop-memory"
          mode="create"
          autofocus={composerAutofocus}
          pending={createMemory.isPending}
          issues={operationIssues}
          onsubmit={saveNewMemory}
        />
      {/key}
    </section>

    {#if status === 'active' && memories.length === 0 && !memoriesQuery.isPending}
      <p
        class="hidden rounded-xl border border-dashed border-border px-4 py-3 text-sm text-text-muted md:block"
      >
        {m.studio_empty_active_hint()}
      </p>
    {/if}

    <details class="rounded-xl border border-border bg-surface px-4 py-3 xl:hidden">
      <summary class="cursor-pointer text-sm font-semibold text-text"
        >{m.studio_privacy_heading()}</summary
      >
      <p class="mt-2 text-sm leading-6 text-text-muted">{m.studio_privacy_copy()}</p>
    </details>

    <div class="flex border-b border-border" role="tablist" aria-label={m.studio_memory_tabs()}>
      <button
        type="button"
        role="tab"
        aria-selected={status === 'active'}
        class="border-b-2 px-4 py-3 text-sm font-semibold transition {status === 'active'
          ? 'border-accent text-accent'
          : 'border-transparent text-text-muted hover:text-text'}"
        onclick={() => {
          status = 'active';
          actionError = '';
        }}>{m.studio_active_tab()}</button
      >
      <button
        type="button"
        role="tab"
        aria-selected={status === 'archived'}
        class="border-b-2 px-4 py-3 text-sm font-semibold transition {status === 'archived'
          ? 'border-accent text-accent'
          : 'border-transparent text-text-muted hover:text-text'}"
        onclick={() => {
          status = 'archived';
          actionError = '';
        }}>{m.studio_archived_tab()}</button
      >
    </div>

    {#if actionError}
      <p
        class="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
        role="alert"
      >
        {actionError}
      </p>
    {/if}
    {#if operationIssues.length > 0}
      <ul
        class="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-xs text-danger"
        role="alert"
      >
        {#each operationIssues as issue, index (`${issue.path}-${index}`)}<li>
            {issue.path || 'form'}: {issue.code.replaceAll('_', ' ')}
          </li>{/each}
      </ul>
    {/if}

    {#if memoriesQuery.isPending}
      <div class="flex min-h-48 items-center justify-center" role="status">
        <Spinner size="xl" label={m.common_loading()} />
      </div>
    {:else if memoriesQuery.isError}
      <div class="rounded-2xl border border-border bg-surface p-6 text-center" role="alert">
        <p class="text-sm text-text-muted">{m.studio_memories_load_error()}</p>
        <button
          type="button"
          class="mt-3 text-sm font-semibold text-accent"
          onclick={() => void memoriesQuery.refetch()}>{m.common_retry()}</button
        >
      </div>
    {:else if memories.length === 0}
      {#if status === 'archived'}
        <div
          class="rounded-2xl border border-dashed border-border px-5 py-10 text-center text-sm text-text-muted"
        >
          {m.studio_empty_archived()}
        </div>
      {:else}
        <div
          class="rounded-2xl border border-dashed border-border px-5 py-8 text-center text-sm text-text-muted md:hidden"
        >
          {m.studio_empty_active_hint()}
        </div>
      {/if}
    {:else}
      <div class="space-y-3">
        {#each memories as memory (memory.id)}
          <ContextMenu items={menuItems(memory)}>
            <article class="rounded-2xl border border-border bg-surface p-4 md:p-5">
              <div class="flex items-start gap-3">
                <div class="min-w-0 flex-1">
                  <div class="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <time
                      class="font-mono text-xs text-text-dim"
                      datetime={memory.occurred_on ?? undefined}
                    >
                      {memory.occurred_on
                        ? formatLocalIsoDate(memory.occurred_on, $locale)
                        : m.studio_date_undated()}
                    </time>
                    {#if memory.origin === 'chat'}<span
                        class="rounded-full border border-accent/50 px-2 py-0.5 text-[10px] font-semibold text-accent"
                        >{m.studio_from_interview()}</span
                      >{/if}
                  </div>
                  <h2 class="font-display text-lg font-semibold text-text">{memory.title}</h2>
                </div>
                <div class="relative shrink-0 md:hidden">
                  <button
                    type="button"
                    class="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted hover:bg-surface-hover"
                    aria-label={m.studio_memory_menu({ title: memory.title })}
                    aria-haspopup="menu"
                    aria-expanded={openMobileMenuId === memory.id}
                    onclick={() =>
                      (openMobileMenuId = openMobileMenuId === memory.id ? null : memory.id)}
                  >
                    <MoreHorizontal size={19} aria-hidden="true" />
                  </button>
                  {#if openMobileMenuId === memory.id}
                    <div
                      class="absolute right-0 top-10 z-20 min-w-36 rounded-xl border border-border bg-surface p-1 shadow-xl"
                      role="menu"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        class="w-full rounded-lg px-3 py-2 text-left text-sm text-text hover:bg-surface-hover"
                        onclick={() => {
                          editMemory = memory;
                          openMobileMenuId = null;
                        }}>{m.common_edit()}</button
                      >
                      <button
                        type="button"
                        role="menuitem"
                        class="w-full rounded-lg px-3 py-2 text-left text-sm text-text hover:bg-surface-hover"
                        onclick={() => {
                          openMobileMenuId = null;
                          void changeMemoryStatus(
                            memory,
                            memory.status === 'active' ? 'archived' : 'active',
                          );
                        }}
                        >{memory.status === 'active'
                          ? m.studio_archive()
                          : m.studio_restore()}</button
                      >
                      <button
                        type="button"
                        role="menuitem"
                        class="w-full rounded-lg px-3 py-2 text-left text-sm text-danger hover:bg-surface-hover"
                        onclick={() => {
                          deleteMemory = memory;
                          openMobileMenuId = null;
                        }}>{m.common_delete()}</button
                      >
                    </div>
                  {/if}
                </div>
              </div>
              <p
                class="mt-3 whitespace-pre-wrap text-sm leading-6 text-text-muted {expandedMemoryIds.includes(
                  memory.id,
                )
                  ? ''
                  : 'line-clamp-3'}"
              >
                {memory.body}
              </p>
              {#if memory.body.split('\n').length > 3 || memory.body.length > 260}
                <button
                  type="button"
                  class="mt-2 text-xs font-semibold text-accent"
                  aria-expanded={expandedMemoryIds.includes(memory.id)}
                  onclick={() => toggleExpanded(memory.id)}
                  >{expandedMemoryIds.includes(memory.id)
                    ? m.studio_show_less()
                    : m.studio_show_more()}</button
                >
              {/if}
              {#if memory.themes.length > 0}
                <ul class="mt-3 flex flex-wrap gap-1.5" aria-label={m.studio_memory_themes()}>
                  {#each memory.themes as theme, index (`${theme}-${index}`)}<li
                      class="rounded-full bg-accent-glow px-2.5 py-1 text-xs text-accent"
                    >
                      {theme}
                    </li>{/each}
                </ul>
              {/if}
              <div
                class="mt-4 flex items-center gap-1.5"
                aria-label={m.studio_importance_level({ level: String(memory.salience) })}
              >
                {#each [1, 2, 3, 4, 5] as dot (dot)}<span
                    class="h-1.5 w-1.5 rounded-full {dot <= memory.salience
                      ? 'bg-accent'
                      : 'bg-border'}"
                    aria-hidden="true"
                  ></span>{/each}
              </div>
            </article>
          </ContextMenu>
        {/each}
      </div>
      <InfiniteScrollSentinel
        disabled={!memoriesQuery.hasNextPage || memoriesQuery.isFetchingNextPage}
        onVisible={() => void memoriesQuery.fetchNextPage()}
      />
      {#if memoriesQuery.isFetchingNextPage}<div class="flex justify-center py-4">
          <Spinner size="md" label={m.common_loading()} />
        </div>{/if}
    {/if}
  </div>

  <aside class="hidden xl:block">
    <div class="sticky top-6 space-y-4">
      <section class="rounded-2xl border border-border bg-surface p-5">
        <h2 class="font-display text-lg font-semibold text-text">{m.studio_canon_heading()}</h2>
        <p class="mt-2 text-sm leading-6 text-text-muted">{m.studio_canon_copy()}</p>
      </section>
      <section class="rounded-2xl border border-accent/30 bg-accent-glow p-5">
        <h2 class="font-display text-base font-semibold text-text">{m.studio_privacy_heading()}</h2>
        <p class="mt-2 text-sm leading-6 text-text-muted">{m.studio_privacy_copy()}</p>
      </section>
    </div>
  </aside>
</div>

<button
  type="button"
  class="fixed bottom-[calc(76px+env(safe-area-inset-bottom))] right-4 z-40 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-semibold text-bg shadow-lg md:hidden"
  onclick={() => {
    composerOpen = true;
    composerAutofocus = true;
  }}
>
  <span aria-hidden="true">+</span>{m.studio_add_memory()}
</button>

{#if composerOpen && !$isDesktop}
  <div
    class="fixed inset-0 z-[180] flex items-end bg-black/50 md:hidden"
    role="presentation"
    onclick={(event) => {
      if (event.target === event.currentTarget) composerOpen = false;
    }}
  >
    <div
      class="max-h-[88dvh] w-full overflow-y-auto rounded-t-3xl border border-border bg-bg p-4 pb-[calc(24px+env(safe-area-inset-bottom))] shadow-2xl"
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      aria-label={m.studio_quick_capture()}
    >
      <div class="mx-auto mb-4 h-1 w-10 rounded-full bg-border" aria-hidden="true"></div>
      {#key `mobile-${composerVersion}`}
        <MemoryForm
          idPrefix="mobile-memory"
          mode="create"
          autofocus={composerAutofocus}
          pending={createMemory.isPending}
          issues={operationIssues}
          onsubmit={saveNewMemory}
          oncancel={() => (composerOpen = false)}
        />
      {/key}
    </div>
  </div>
{/if}

{#if editMemory}
  <div
    class="fixed inset-0 z-[180] flex items-end justify-center bg-black/50 p-0 md:items-center md:p-4"
    role="presentation"
    onclick={(event) => {
      if (event.target === event.currentTarget) editMemory = null;
    }}
  >
    <div
      class="max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl border border-border bg-bg p-4 pb-[calc(24px+env(safe-area-inset-bottom))] md:max-w-2xl md:rounded-2xl md:p-6"
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      aria-labelledby="memory-edit-title"
    >
      <h2 id="memory-edit-title" class="sr-only">{m.studio_edit_memory()}</h2>
      <MemoryForm
        idPrefix={`edit-memory-${editMemory.id}`}
        mode="edit"
        initial={editMemory}
        pending={updateMemory.isPending}
        issues={validationIssues(updateMemory.error)}
        onsubmit={saveEditedMemory}
        oncancel={() => (editMemory = null)}
      />
    </div>
  </div>
{/if}

{#if deleteMemory}
  <ConfirmDeleteModal
    title={m.studio_delete_memory_title()}
    message={m.studio_delete_memory_copy({ title: deleteMemory.title })}
    isPending={deleteMemoryMutation.isPending}
    onconfirm={confirmDeleteMemory}
    oncancel={() => (deleteMemory = null)}
  />
{/if}
