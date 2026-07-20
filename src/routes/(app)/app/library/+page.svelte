<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { SvelteURLSearchParams } from 'svelte/reactivity';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import {
    createInfiniteQuery,
    createMutation,
    createQuery,
    useQueryClient,
  } from '@tanstack/svelte-query';
  import { CheckSquare, Search, Upload as UploadIcon } from 'lucide-svelte';
  import {
    libraryListInfiniteQueryOptions,
    deleteAssetMutationOptions,
    libraryKeys,
    projectKeys,
    projectsListQueryOptions,
    type LibraryListParams,
  } from '$lib/queries/library';
  import { storageStatsQueryOptions, storageKeys } from '$lib/queries/storage';
  import { uploadMedia } from '$lib/api/upload';
  import { ApiRequestError } from '$lib/api/errors';
  import { addToast } from '$lib/stores/toasts';
  import { ACCEPTED_IMAGE_TYPES, ACCEPTED_VIDEO_TYPES } from '$lib/utils/constants';
  import { activeProject } from '$lib/stores/activeProject.svelte';
  import { inheritProjectForUpload } from '$lib/services/projectInheritance';
  import AssetGrid from '$lib/components/library/AssetGrid.svelte';
  import LibraryTabs, { type LibraryTab } from '$lib/components/library/LibraryTabs.svelte';
  import LibraryFilterBar, {
    type LibraryMediaFilter,
  } from '$lib/components/library/LibraryFilterBar.svelte';
  import AssetDetailsSheet from '$lib/components/library/AssetDetailsSheet.svelte';
  import GroupSheet from '$lib/components/library/GroupSheet.svelte';
  import ConfirmDeleteModal from '$lib/components/shared/ConfirmDeleteModal.svelte';
  import ProjectNav from '$lib/components/library/ProjectNav.svelte';
  import SelectionToolbar from '$lib/components/library/SelectionToolbar.svelte';
  import { LibrarySelection } from '$lib/components/library/selection.svelte';
  import { productInfo } from '$lib/stores/product';
  import type { components } from '$lib/api/types';
  import * as m from '$paraglide/messages';

  type LibraryAssetItem = components['schemas']['LibraryAssetItem'];
  type LibrarySort = components['schemas']['LibrarySort'];

  const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
  const ACCEPTED_TYPES = [...ACCEPTED_IMAGE_TYPES, ...ACCEPTED_VIDEO_TYPES];

  let appTitle = $derived($productInfo?.display_name ?? 'Apex');

  /* ─── URL-driven filter state ─── */

  function tabFromUrl(url: URL): LibraryTab {
    if (url.searchParams.get('favorite') === 'true') return 'favorites';
    const source = url.searchParams.get('source');
    if (source === 'output') return 'generated';
    if (source === 'upload') return 'uploads';
    return 'all';
  }

  function mediaFilterFromUrl(url: URL): LibraryMediaFilter {
    const media = url.searchParams.get('media');
    return media === 'image' || media === 'video' ? media : 'all';
  }

  function sortFromUrl(url: URL): LibrarySort {
    const sort = url.searchParams.get('sort');
    return sort === 'oldest' || sort === 'expiring_soon' ? sort : 'newest';
  }

  // The URL is the Library's single source of truth. Derived state also makes browser
  // Back/Forward restore filters without keeping a second local copy in sync.
  let tab = $derived<LibraryTab>(tabFromUrl($page.url));
  let mediaFilter = $derived<LibraryMediaFilter>(mediaFilterFromUrl($page.url));
  let selectedModel = $derived<string | null>($page.url.searchParams.get('model'));
  let activeProjectId = $derived<string | null>($page.url.searchParams.get('project'));
  let expiring = $derived($page.url.searchParams.get('expiring') === 'true');
  let sort = $derived<LibrarySort>(sortFromUrl($page.url));
  let urlSearch = $derived($page.url.searchParams.get('query') ?? '');

  function updateUrl(updates: Record<string, string | null>) {
    const params = new SvelteURLSearchParams($page.url.searchParams);
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === '') params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    goto(qs ? `?${qs}` : $page.url.pathname, {
      replaceState: true,
      keepFocus: true,
      noScroll: true,
    });
  }

  function handleTabChange(next: LibraryTab) {
    selection.clearForFilterChange();
    updateUrl({
      source: next === 'generated' ? 'output' : next === 'uploads' ? 'upload' : null,
      favorite: next === 'favorites' ? 'true' : null,
    });
  }

  function handleMediaFilterChange(next: LibraryMediaFilter) {
    selection.clearForFilterChange();
    updateUrl({ media: next === 'all' ? null : next });
  }

  function handleModelChange(next: string | null) {
    selection.clearForFilterChange();
    updateUrl({ model: next });
  }

  function handleProjectChange(projectId: string | null) {
    selection.clearForFilterChange();
    activeProject.set(projectId);
    updateUrl({ project: projectId });
  }

  function handleExpiringChange() {
    selection.clearForFilterChange();
    updateUrl({ expiring: expiring ? null : 'true' });
  }

  function handleSortChange(next: LibrarySort) {
    selection.clearForFilterChange();
    updateUrl({ sort: next === 'newest' ? null : next });
  }

  function resetFilters() {
    selection.clearForFilterChange();
    if (searchTimer) {
      clearTimeout(searchTimer);
      searchTimer = null;
    }
    searchValue = '';
    // `goto` updates the URL asynchronously. Clear the cross-route hand-off now so
    // an upload started immediately after reset cannot inherit the just-cleared project.
    activeProject.set(null);
    updateUrl({
      source: null,
      favorite: null,
      media: null,
      model: null,
      project: null,
      query: null,
      expiring: null,
      sort: null,
    });
  }

  /* ─── Debounced server-side search ─── */

  let searchValue = $state('');
  let lastUrlSearch = $state('');
  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    if (urlSearch !== lastUrlSearch) {
      lastUrlSearch = urlSearch;
      searchValue = urlSearch;
    }
  });

  function scheduleSearch(event: Event) {
    searchValue = (event.currentTarget as HTMLInputElement).value;
    selection.clearForFilterChange();
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      updateUrl({ query: searchValue.trim() || null });
      searchTimer = null;
    }, 300);
  }

  onDestroy(() => {
    if (searchTimer) clearTimeout(searchTimer);
  });

  /* ─── Data fetching ─── */

  const listParams = $derived<LibraryListParams>({
    source: tab === 'generated' ? 'output' : tab === 'uploads' ? 'upload' : null,
    favorite: tab === 'favorites' ? true : null,
    media_type: mediaFilter === 'all' ? null : mediaFilter,
    model: selectedModel,
    project_id: activeProjectId,
    query: urlSearch || null,
    expiring: expiring || null,
    sort,
  });

  const libraryQuery = createInfiniteQuery(() => libraryListInfiniteQueryOptions(listParams));
  const statsQuery = createQuery(() => storageStatsQueryOptions());
  const projectsQuery = createQuery(() => projectsListQueryOptions());

  const allItems = $derived((libraryQuery.data?.pages ?? []).flatMap((p) => p.items));
  const availableModels = $derived(
    Array.from(
      new Set(allItems.map((item) => item.model).filter((model): model is string => !!model)),
    ).sort(),
  );

  const hasActiveFilters = $derived(
    tab !== 'all' ||
      mediaFilter !== 'all' ||
      !!selectedModel ||
      !!activeProjectId ||
      !!urlSearch ||
      expiring ||
      sort !== 'newest',
  );

  $effect(() => {
    activeProject.set(activeProjectId);
  });

  /* ─── Cross-page selection ─── */

  const selection = new LibrarySelection();
  let bulkErrorRefs = $state<Set<string>>(new Set());
  let lastFilterKey = $state<string | null>(null);
  const filterKey = $derived(
    `${tab}|${mediaFilter}|${selectedModel ?? ''}|${activeProjectId ?? ''}|${urlSearch}|${expiring}|${sort}`,
  );
  const selectedRefs = $derived([...selection.refs]);
  const selectedItems = $derived(allItems.filter((item) => selection.refs.has(item.asset_ref)));

  $effect(() => {
    if (lastFilterKey !== null && lastFilterKey !== filterKey) {
      selection.clearForFilterChange();
      bulkErrorRefs = new Set();
    }
    lastFilterKey = filterKey;
  });

  function toggleSelection(item: LibraryAssetItem) {
    selection.toggle(item.asset_ref);
    bulkErrorRefs = new Set([...bulkErrorRefs].filter((ref) => ref !== item.asset_ref));
  }

  /* ─── Selection / detail sheets ─── */

  interface DetailsRequest {
    assetRef: string;
    rename?: boolean;
  }

  let detailsRequest = $state<DetailsRequest | null>(null);
  let groupJobId = $state<string | null>(null);
  let deleteTarget = $state<LibraryAssetItem | null>(null);

  const queryClient = useQueryClient();
  const deleteMutation = createMutation(() => deleteAssetMutationOptions(queryClient));

  function openDetails(assetRef: string, options: Omit<DetailsRequest, 'assetRef'> = {}) {
    detailsRequest = { assetRef, ...options };
  }

  /**
   * Both sheets lock/unlock body scroll in onMount/onDestroy. Setting the close and open
   * state in the same tick makes the final lock state depend on which {#if} block updates
   * first; sequencing the close through a tick guarantees destroy-before-mount either way.
   */
  async function switchFromGroupToDetails(assetRef: string) {
    groupJobId = null;
    await tick();
    openDetails(assetRef);
  }

  async function switchFromDetailsToGroup(jobId: string) {
    detailsRequest = null;
    await tick();
    groupJobId = jobId;
  }

  function handleCardClick(item: LibraryAssetItem) {
    if (item.output_count && item.output_count > 1 && item.job_id) {
      groupJobId = item.job_id;
    } else {
      openDetails(item.asset_ref);
    }
  }

  function handleLoadMore() {
    if (libraryQuery.hasNextPage && !libraryQuery.isFetchingNextPage) {
      libraryQuery.fetchNextPage();
    }
  }

  async function confirmCardDelete() {
    if (!deleteTarget) return;
    try {
      await deleteMutation.mutateAsync(deleteTarget.asset_ref);
      addToast({ type: 'success', message: m.library_delete_success() });
    } catch {
      addToast({ type: 'error', message: m.library_delete_error() });
    } finally {
      deleteTarget = null;
    }
  }

  /* ─── Upload ─── */

  let uploading = $state(false);
  let fileInput: HTMLInputElement;

  async function handleFileChange(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      addToast({ type: 'error', message: m.upload_accepted_types_video() });
      if (fileInput) fileInput.value = '';
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      addToast({ type: 'error', message: m.library_upload_too_large() });
      if (fileInput) fileInput.value = '';
      return;
    }

    const projectId = activeProject.id;
    uploading = true;
    try {
      const upload = await uploadMedia(file);
      // Assignment is metadata convenience; an otherwise successful upload remains successful.
      try {
        await inheritProjectForUpload(upload.id, projectId);
      } catch {
        // The normal Library invalidation below makes a later retry/refetch safe.
      }
      queryClient.invalidateQueries({ queryKey: libraryKeys.all });
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
      queryClient.invalidateQueries({ queryKey: storageKeys.all });
      addToast({ type: 'success', message: m.library_upload_success() });
    } catch (err) {
      const message = err instanceof ApiRequestError ? err.message : m.library_upload_error();
      addToast({ type: 'error', message });
    } finally {
      uploading = false;
      if (fileInput) fileInput.value = '';
    }
  }
</script>

<svelte:head>
  <title>{m.library_title()} — {appTitle}</title>
</svelte:head>

<div class="flex flex-col gap-4 p-4 md:flex-row md:p-0">
  <ProjectNav {activeProjectId} onActiveChange={handleProjectChange} />

  <div class="min-w-0 flex-1 space-y-4">
    <!-- Header -->
    <div class="flex items-center justify-between gap-3">
      <div>
        <h1 class="text-lg font-semibold text-text">{m.library_title()}</h1>
        {#if statsQuery.data}
          <p class="text-xs text-text-dim">
            {statsQuery.data.upload_count}
            {m.library_stats_uploads()} · {statsQuery.data.total_mb.toFixed(1)} MB
          </p>
        {/if}
      </div>
      <button
        onclick={() => fileInput.click()}
        disabled={uploading}
        class="flex shrink-0 items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
      >
        <UploadIcon size={14} />
        {uploading ? m.create_uploading() : m.library_upload_cta()}
      </button>
      <input
        bind:this={fileInput}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        class="hidden"
        onchange={handleFileChange}
      />
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <div class="min-w-44 flex-1 md:max-w-sm">
        <label class="sr-only" for="library-search">{m.library_search_placeholder()}</label>
        <div class="relative">
          <Search
            size={15}
            class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-dim"
          />
          <input
            id="library-search"
            value={searchValue}
            oninput={scheduleSearch}
            placeholder={m.library_search_placeholder()}
            class="w-full rounded-xl border border-border bg-surface py-2 pl-9 pr-3 text-xs text-text outline-none transition-colors placeholder:text-text-dim focus:border-accent"
          />
        </div>
      </div>
      <button
        type="button"
        onclick={handleExpiringChange}
        class="rounded-full px-3 py-2 text-xs font-medium transition-colors {expiring
          ? 'bg-warning/15 text-warning'
          : 'border border-border bg-surface text-text-muted hover:text-text'}"
      >
        {m.library_expiring_filter()}
      </button>
      <select
        value={sort}
        onchange={(event) =>
          handleSortChange((event.currentTarget as HTMLSelectElement).value as LibrarySort)}
        aria-label={m.library_sort()}
        class="rounded-xl border border-border bg-surface px-3 py-2 text-xs font-medium text-text-muted"
      >
        <option value="newest">{m.library_sort_newest()}</option>
        <option value="oldest">{m.library_sort_oldest()}</option>
        <option value="expiring_soon">{m.library_sort_expiring()}</option>
      </select>
    </div>

    <LibraryTabs active={tab} onchange={handleTabChange} />

    <div class="flex flex-wrap items-center gap-2">
      <LibraryFilterBar
        {mediaFilter}
        onMediaFilterChange={handleMediaFilterChange}
        models={availableModels}
        {selectedModel}
        onModelChange={handleModelChange}
      />
      {#if allItems.length > 0}
        <button
          type="button"
          onclick={() => selection.selectPage(allItems.map((item) => item.asset_ref))}
          class="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium text-text-muted hover:bg-surface-hover hover:text-text"
        >
          <CheckSquare size={14} />
          {m.library_select_page()}
        </button>
      {/if}
      <span class="ml-auto shrink-0 text-xs text-text-dim">
        {allItems.length}
        {m.library_loaded()}{libraryQuery.hasNextPage ? '+' : ''}
      </span>
    </div>

    {#if libraryQuery.isLoading}
      <div class="grid grid-cols-2 gap-2 md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
        {#each Array(8) as _, i (i)}
          <div class="aspect-square animate-pulse rounded-xl bg-surface"></div>
        {/each}
      </div>
    {:else if libraryQuery.isError}
      <div
        class="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface/50 py-20"
      >
        <p class="text-sm text-danger">{m.library_load_error()}</p>
        <button
          onclick={() => libraryQuery.refetch()}
          class="mt-2 text-sm font-medium text-accent hover:underline"
        >
          {m.common_retry()}
        </button>
      </div>
    {:else if allItems.length === 0}
      <div
        class="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface/50 py-20"
      >
        <p class="text-sm text-text-dim">
          {#if urlSearch}
            {m.library_search_empty()}
          {:else if activeProjectId}
            {m.library_project_empty()}
          {:else if tab === 'favorites'}
            {m.library_empty_favorites()}
          {:else if tab === 'uploads'}
            {m.library_empty_uploads()}
          {:else if tab === 'generated'}
            {m.library_empty_generated()}
          {:else}
            {m.library_empty_all()}
          {/if}
        </p>
        {#if hasActiveFilters}
          <button
            onclick={resetFilters}
            class="mt-2 text-sm font-medium text-accent hover:underline"
          >
            {m.library_reset_filters()}
          </button>
        {:else}
          <a href="/app/create" class="mt-2 text-sm font-medium text-accent hover:underline">
            {m.library_start_creating()}
          </a>
        {/if}
      </div>
    {:else}
      <AssetGrid
        items={allItems}
        onCardClick={handleCardClick}
        onCardDelete={(item) => (deleteTarget = item)}
        onCardRename={(item) => openDetails(item.asset_ref, { rename: true })}
        onCardExtractFrame={(item) => openDetails(item.asset_ref)}
        onCardViewSettings={(item) => openDetails(item.asset_ref)}
        onLoadMore={handleLoadMore}
        loadMoreDisabled={!libraryQuery.hasNextPage || libraryQuery.isFetchingNextPage}
        selectionActive={selection.active}
        selectedRefs={selection.refs}
        {bulkErrorRefs}
        onToggleSelect={toggleSelection}
      />

      {#if libraryQuery.isFetchingNextPage}
        <div class="flex justify-center py-4">
          <div
            class="h-5 w-5 animate-spin rounded-full border-2 border-accent border-t-transparent"
          ></div>
        </div>
      {:else if !libraryQuery.hasNextPage && allItems.length > 0}
        <p class="py-4 text-center text-xs text-text-dim">{m.library_all_caught_up()}</p>
      {/if}
    {/if}
  </div>
</div>

{#if selection.active}
  <SelectionToolbar
    {selectedItems}
    {selectedRefs}
    projects={projectsQuery.data?.items ?? []}
    onclear={() => {
      selection.clear();
      bulkErrorRefs = new Set();
    }}
    onoffenders={(refs) => (bulkErrorRefs = new Set(refs))}
  />
{/if}

{#if detailsRequest}
  <AssetDetailsSheet
    assetRef={detailsRequest.assetRef}
    startInRename={detailsRequest.rename ?? false}
    onclose={() => (detailsRequest = null)}
    onOpenGroup={switchFromDetailsToGroup}
  />
{/if}

{#if groupJobId}
  <GroupSheet
    jobId={groupJobId}
    onclose={() => (groupJobId = null)}
    onOpenAsset={switchFromGroupToDetails}
  />
{/if}

{#if deleteTarget}
  <ConfirmDeleteModal
    title={m.library_delete_title()}
    message={m.library_delete_confirm_text()}
    isPending={deleteMutation.isPending}
    onconfirm={confirmCardDelete}
    oncancel={() => (deleteTarget = null)}
  />
{/if}
