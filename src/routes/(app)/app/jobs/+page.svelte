<script lang="ts">
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
  import * as m from '$paraglide/messages';
  import { Inbox, RefreshCw } from 'lucide-svelte';
  import { jobsListQueryOptions, deleteJobMutationOptions, jobKeys } from '$lib/queries/jobs';
  import JobCard from '$lib/components/jobs/JobCard.svelte';
  import JobFilters from '$lib/components/jobs/JobFilters.svelte';
  import type { components } from '$lib/api/types';
  import type { JobListFilters } from '$lib/queries/jobs';
  import { isSSEConnected } from '$lib/stores/eventStream';
  import { productInfo } from '$lib/stores/product';

  type UnifiedJobResponse = components['schemas']['UnifiedJobResponse'];

  const NON_TERMINAL: components['schemas']['JobStatus'][] = ['pending', 'queued', 'running'];

  const queryClient = useQueryClient();

  // ── Filter + pagination state
  let filters = $state<JobListFilters>({ limit: 20 });
  let openMenuJobId = $state<string | null>(null);

  function handleWindowPointerDown(e: PointerEvent) {
    if (!openMenuJobId) return;
    if (!(e.target as HTMLElement).closest('[data-menu]')) {
      openMenuJobId = null;
    }
  }
  let accumulatedItems = $state<UnifiedJobResponse[]>([]);
  let nextCursor = $state<string | null>(null);
  let loadingMore = $state(false);

  // Derive app title from productInfo for <title> tag
  let appTitle = $derived($productInfo?.display_name ?? 'Apex');

  // ── Query — auto-refresh while any non-terminal job exists
  const hasActiveJobs = $derived(accumulatedItems.some((j) => NON_TERMINAL.includes(j.status)));

  const query = createQuery(() => ({
    ...jobsListQueryOptions(filters),
    // When SSE is connected, job status updates arrive in real-time.
    // Fall back to 5s polling only when SSE is down AND there are active jobs.
    refetchInterval: $isSSEConnected ? false : hasActiveJobs ? 5000 : false,
  }));

  // Append or replace on new data
  $effect(() => {
    const data = query.data;
    if (!data) return;
    if (!filters.cursor) {
      accumulatedItems = data.items;
    } else {
      accumulatedItems = [...accumulatedItems, ...data.items];
    }
    nextCursor = data.next_cursor ?? null;
    loadingMore = false;
  });

  // ── Delete mutation
  const deleteMutation = createMutation(() => deleteJobMutationOptions(queryClient));

  function handleDelete(jobId: string) {
    // Optimistic removal
    accumulatedItems = accumulatedItems.filter((j) => j.id !== jobId);
    deleteMutation.mutate(jobId);
  }

  function handleFilterChange(newFilters: JobListFilters) {
    accumulatedItems = [];
    filters = { ...newFilters, cursor: null };
  }

  function handleLoadMore() {
    if (!nextCursor) return;
    loadingMore = true;
    filters = { ...filters, cursor: nextCursor };
  }
</script>

<svelte:window onpointerdown={handleWindowPointerDown} />

<svelte:head>
  <title>Jobs — {appTitle}</title>
</svelte:head>

<div class="space-y-4 p-4 md:p-0">
  <!-- Header -->
  <div class="flex items-center justify-between">
    <h1 class="text-lg font-semibold text-text">{m.jobs_title()}</h1>
    <button
      onclick={() => queryClient.invalidateQueries({ queryKey: jobKeys.all })}
      class="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
      aria-label="Refresh jobs"
    >
      <RefreshCw size={15} />
    </button>
  </div>

  <!-- Filters -->
  <JobFilters {filters} onChange={handleFilterChange} />

  <!-- States -->
  {#if query.isLoading && accumulatedItems.length === 0}
    <!-- Loading skeletons -->
    <div class="flex flex-col gap-2">
      {#each Array(5) as _, i (i)}
        <div class="h-18 animate-pulse rounded-xl bg-surface"></div>
      {/each}
    </div>
  {:else if query.isError}
    <!-- Error -->
    <div class="rounded-xl border border-danger/20 bg-danger/5 p-4 text-center">
      <p class="mb-3 text-sm text-danger">{query.error?.message ?? 'Failed to load jobs'}</p>
      <button
        onclick={() => query.refetch()}
        class="rounded-lg bg-surface px-3 py-1.5 text-xs font-medium text-text hover:bg-surface-hover"
      >
        {m.common_retry()}
      </button>
    </div>
  {:else if accumulatedItems.length === 0}
    <!-- Empty state -->
    <div
      class="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20 text-center"
    >
      <Inbox size={40} class="mb-3 text-text-dim opacity-40" />
      <p class="text-sm font-medium text-text">{m.jobs_empty()}</p>
      <p class="mt-1 text-xs text-text-muted">{m.jobs_empty_subtitle()}</p>
      <a
        href="/app/create"
        class="mt-4 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-bg transition-opacity hover:opacity-90"
      >
        {m.jobs_empty_cta()}
      </a>
    </div>
  {:else}
    <!-- Job list -->
    <div class="flex flex-col gap-2">
      {#each accumulatedItems as job (job.id)}
        <JobCard
          {job}
          onDelete={handleDelete}
          menuOpen={openMenuJobId === job.id}
          onMenuToggle={(id) => (openMenuJobId = id)}
        />
      {/each}
    </div>

    <!-- Load more -->
    {#if nextCursor !== null}
      <div class="flex justify-center pt-2">
        <button
          onclick={handleLoadMore}
          disabled={loadingMore || query.isFetching}
          class="flex items-center gap-2 rounded-lg border border-border bg-surface px-4 py-2 text-sm text-text-muted transition-colors hover:bg-surface-hover disabled:opacity-50"
        >
          {#if loadingMore || query.isFetching}
            <div
              class="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent border-t-transparent"
            ></div>
            {m.jobs_loading()}
          {:else}
            {m.jobs_load_more()}
          {/if}
        </button>
      </div>
    {/if}
  {/if}
</div>
