<script lang="ts">
  import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';
  import { X } from 'lucide-svelte';
  import type { components } from '$lib/api/types';
  import {
    assetTagsMutationOptions,
    createTagMutationOptions,
    libraryKeys,
    tagsListQueryOptions,
  } from '$lib/queries/library';
  import { addToast } from '$lib/stores/toasts';
  import * as m from '$paraglide/messages';

  type LibraryTagRef = components['schemas']['LibraryTagRef'];
  type LibraryTagListItem = components['schemas']['LibraryTagListItem'];

  const MAX_TAGS = 20;
  const DEBOUNCE_MS = 400;

  let {
    assetRef,
    tags,
  }: {
    assetRef: string;
    tags: LibraryTagRef[];
  } = $props();

  const queryClient = useQueryClient();
  const tagsQuery = createQuery(() => tagsListQueryOptions());
  const patchMutation = createMutation(() => assetTagsMutationOptions(queryClient));
  const createTagRequest = createMutation(() => createTagMutationOptions(queryClient));

  let selectedTags = $state<LibraryTagRef[]>([]);
  let inputValue = $state('');
  let open = $state(false);
  let highlightedIndex = $state(0);
  let announcement = $state('');
  let dirty = false;
  let flushing = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const allTags = $derived(tagsQuery.data?.items ?? []);
  const selectedIds = $derived(new Set(selectedTags.map((tag) => tag.id)));
  const search = $derived(inputValue.trim().toLocaleLowerCase());
  const matchingTags = $derived(
    allTags.filter(
      (tag) =>
        !selectedIds.has(tag.id) && (!search || tag.name.toLocaleLowerCase().includes(search)),
    ),
  );
  const canCreate = $derived(
    inputValue.trim().length > 0 &&
      inputValue.trim().length <= 50 &&
      !allTags.some((tag) => tag.name === inputValue.trim()),
  );
  const optionsCount = $derived(matchingTags.length + (canCreate ? 1 : 0));
  const atTagLimit = $derived(selectedTags.length >= MAX_TAGS);

  // The mutation updates the detail cache optimistically. When a separate refetch or a
  // rollback changes the prop, this keeps the local chip state authoritative again.
  $effect(() => {
    if (!flushing && !dirty && !debounceTimer) selectedTags = [...tags];
  });

  function tagRef(tag: LibraryTagListItem | components['schemas']['LibraryTag']): LibraryTagRef {
    return { id: tag.id, name: tag.name };
  }

  function scheduleCommit() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void flush();
    }, DEBOUNCE_MS);
  }

  function updateSelection(next: LibraryTagRef[], message: string) {
    selectedTags = next;
    announcement = message;
    dirty = true;
    scheduleCommit();
  }

  async function flush() {
    if (flushing || !dirty) return;
    dirty = false;
    flushing = true;
    const tagsToSave = [...selectedTags];
    try {
      // Sending this complete set is intentional: tag_ids uses replace semantics.
      await patchMutation.mutateAsync({ assetRef, tags: tagsToSave });
    } catch {
      addToast({ type: 'error', message: m.library_tag_assign_error() });
      await queryClient.refetchQueries({ queryKey: libraryKeys.asset(assetRef) });
      selectedTags =
        queryClient.getQueryData<components['schemas']['LibraryAssetDetail']>(
          libraryKeys.asset(assetRef),
        )?.tags ?? [];
    } finally {
      flushing = false;
      // Changes made while an earlier request was in flight are committed only after it
      // settles, preserving order and preventing stale replace-set writes.
      if (dirty) await flush();
    }
  }

  function addTag(tag: LibraryTagListItem | components['schemas']['LibraryTag']) {
    if (atTagLimit || selectedIds.has(tag.id)) return;
    updateSelection([...selectedTags, tagRef(tag)], m.library_tag_added({ name: tag.name }));
    inputValue = '';
    open = false;
  }

  function removeTag(tag: LibraryTagRef) {
    updateSelection(
      selectedTags.filter((candidate) => candidate.id !== tag.id),
      m.library_tag_removed({ name: tag.name }),
    );
  }

  async function createAndAdd() {
    const name = inputValue.trim();
    if (!canCreate) return;
    try {
      const created = await createTagRequest.mutateAsync({ name });
      addTag(created);
    } catch {
      // The server is the source of truth for normalization and duplicate detection.
      addToast({ type: 'error', message: m.library_tag_create_error() });
      await tagsQuery.refetch();
    }
  }

  function chooseHighlighted() {
    if (!open || optionsCount === 0) return;
    if (highlightedIndex < matchingTags.length) addTag(matchingTags[highlightedIndex]);
    else if (canCreate) void createAndAdd();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      open = true;
      highlightedIndex = optionsCount > 0 ? (highlightedIndex + 1) % optionsCount : 0;
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      open = true;
      highlightedIndex =
        optionsCount > 0 ? (highlightedIndex - 1 + optionsCount) % optionsCount : 0;
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (open && optionsCount > 0) chooseHighlighted();
      else if (canCreate) void createAndAdd();
    } else if (event.key === 'Escape') {
      open = false;
    } else if (event.key === 'Backspace' && !inputValue && selectedTags.length > 0) {
      removeTag(selectedTags[selectedTags.length - 1]);
    }
  }
</script>

<section aria-labelledby="asset-tags-heading" class="border-y border-border py-3">
  <div class="mb-2 flex items-center justify-between gap-3">
    <h3 id="asset-tags-heading" class="text-xs font-medium text-text-dim">{m.library_tags()}</h3>
    <span class="text-[11px] text-text-dim">{selectedTags.length}/{MAX_TAGS}</span>
  </div>

  <div
    class="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-bg p-1.5 focus-within:border-accent"
  >
    {#each selectedTags as tag (tag.id)}
      <span
        class="flex max-w-full items-center gap-1 rounded-full bg-accent/15 px-2 py-1 text-xs text-accent"
      >
        <span class="truncate">{tag.name}</span>
        <button
          type="button"
          class="rounded-full p-0.5 hover:bg-accent/15"
          onclick={() => removeTag(tag)}
          aria-label={m.library_tag_remove({ name: tag.name })}
          disabled={patchMutation.isPending}
        >
          <X size={12} />
        </button>
      </span>
    {/each}
    {#if !atTagLimit}
      <input
        bind:value={inputValue}
        onfocus={() => {
          open = true;
          highlightedIndex = 0;
        }}
        oninput={() => {
          open = true;
          highlightedIndex = 0;
        }}
        onkeydown={handleKeydown}
        aria-label={m.library_tag_input_label()}
        aria-expanded={open}
        aria-controls="asset-tag-options"
        autocomplete="off"
        class="min-w-24 flex-1 bg-transparent px-1 py-0.5 text-xs text-text outline-none placeholder:text-text-dim"
        placeholder={m.library_tag_input_placeholder()}
        disabled={patchMutation.isPending || createTagRequest.isPending}
      />
    {/if}
  </div>

  {#if atTagLimit}
    <p class="mt-1.5 text-[11px] text-text-dim">{m.library_tag_limit_hint({ count: MAX_TAGS })}</p>
  {:else if inputValue.trim().length > 50}
    <p class="mt-1.5 text-[11px] text-danger">{m.library_tag_name_too_long()}</p>
  {/if}

  {#if open && !atTagLimit && (matchingTags.length > 0 || canCreate)}
    <div
      id="asset-tag-options"
      role="listbox"
      aria-label={m.library_tags()}
      class="mt-1 max-h-40 overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-lg"
    >
      {#each matchingTags as tag, index (tag.id)}
        <button
          type="button"
          role="option"
          aria-selected={highlightedIndex === index}
          class="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs text-text hover:bg-surface-hover {highlightedIndex ===
          index
            ? 'bg-surface-hover'
            : ''}"
          onmousedown={(event) => event.preventDefault()}
          onclick={() => addTag(tag)}
        >
          <span>{tag.name}</span>
          <span class="text-text-dim">{tag.asset_count}</span>
        </button>
      {/each}
      {#if canCreate}
        <button
          type="button"
          role="option"
          aria-selected={highlightedIndex === matchingTags.length}
          class="flex w-full rounded-md px-2 py-1.5 text-left text-xs font-medium text-accent hover:bg-accent/10 {highlightedIndex ===
          matchingTags.length
            ? 'bg-accent/10'
            : ''}"
          onmousedown={(event) => event.preventDefault()}
          onclick={() => void createAndAdd()}
        >
          {m.library_tag_create({ name: inputValue.trim() })}
        </button>
      {/if}
    </div>
  {/if}

  <span class="sr-only" aria-live="polite">{announcement}</span>
</section>
