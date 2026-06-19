<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
  import { ChevronLeft, Coins, AlertCircle } from 'lucide-svelte';
  import { jobDetailQueryOptions, deleteJobMutationOptions } from '$lib/queries/jobs';
  import JobStatusBadge from '$lib/components/jobs/JobStatusBadge.svelte';
  import JobOutputGrid from '$lib/components/jobs/JobOutputGrid.svelte';
  import type { components } from '$lib/api/types';
  import { productInfo } from '$lib/stores/product';

  type JobStatus = components['schemas']['JobStatus'];

  // Derive app title from productInfo for <title> tag
  let appTitle = $derived($productInfo?.display_name ?? 'Apex');

  const TERMINAL = new Set<JobStatus>(['completed', 'failed', 'cancelled', 'moderated']);

  const queryClient = useQueryClient();
  const jobId = $derived($page.params.id ?? '');

  const query = createQuery(() => ({
    ...jobDetailQueryOptions(jobId),
    refetchInterval: (q: {
      state: { data: components['schemas']['UnifiedJobResponse'] | null | undefined };
    }) => {
      const data = q.state.data;
      if (!data || TERMINAL.has(data.status)) return false;
      return 3000;
    },
  }));

  const job = $derived(query.data ?? null);

  // ── Delete
  const deleteMutation = createMutation(() => deleteJobMutationOptions(queryClient));

  function handleDelete() {
    if (!window.confirm('Delete this job? This cannot be undone.')) return;
    deleteMutation.mutate(jobId, {
      onSuccess: () => goto('/app/jobs'),
    });
  }

  // ── Duration helper
  function formatDuration(start: string, end: string): string {
    const ms = new Date(end).getTime() - new Date(start).getTime();
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  }

  function formatDateTime(iso: string): string {
    return new Date(iso).toLocaleString();
  }

  // ── Derived display values
  const nonThumbnailOutputs = $derived((job?.outputs ?? []).filter((o) => !o.is_thumbnail));
  const hasOutputs = $derived(job?.status === 'completed' && nonThumbnailOutputs.length > 0);
  const canRetry = $derived(job?.status === 'failed' || job?.status === 'cancelled');
</script>

<svelte:head>
  <title>{job?.name ?? 'Job'} — {appTitle}</title>
</svelte:head>

<div class="mx-auto max-w-4xl space-y-5 p-4 md:p-6">
  <!-- Back button -->
  <button
    onclick={() => goto('/app/jobs')}
    class="flex items-center gap-1 text-sm text-text-muted transition-colors hover:text-text"
  >
    <ChevronLeft size={16} />
    Jobs
  </button>

  {#if query.isLoading}
    <!-- Skeleton -->
    <div class="space-y-4">
      <div class="h-7 w-48 animate-pulse rounded-lg bg-surface"></div>
      <div class="h-24 animate-pulse rounded-xl bg-surface"></div>
      <div class="h-48 animate-pulse rounded-xl bg-surface"></div>
    </div>
  {:else if !job}
    <!-- Not found -->
    <div
      class="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-20 text-center"
    >
      <p class="text-sm font-medium text-text">Job not found</p>
      <p class="mt-1 text-xs text-text-muted">This job may have been deleted.</p>
      <button
        onclick={() => goto('/app/jobs')}
        class="mt-4 rounded-lg bg-surface px-4 py-2 text-sm text-text hover:bg-surface-hover"
      >
        Back to Jobs
      </button>
    </div>
  {:else}
    <!-- Header -->
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="flex flex-col gap-1.5">
        <h1 class="text-xl font-semibold text-text">{job.name}</h1>
        <div class="flex flex-wrap items-center gap-2">
          <JobStatusBadge status={job.status} />
          <span class="rounded-full bg-surface px-2 py-0.5 text-xs uppercase text-text-muted">
            {job.generation_type}
          </span>
          {#if job.model}
            <span class="rounded-full bg-surface px-2 py-0.5 text-xs text-text-muted">
              {job.model}
            </span>
          {/if}
          <span class="rounded-full bg-surface px-2 py-0.5 text-xs capitalize text-text-muted">
            {job.provider}
          </span>
        </div>
      </div>

      <!-- Action buttons -->
      <div class="flex gap-2">
        {#if canRetry}
          <a
            href="/app/create?prompt={encodeURIComponent(job.prompt)}"
            class="rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text transition-colors hover:bg-surface-hover"
          >
            Try again
          </a>
        {/if}
        <button
          onclick={handleDelete}
          disabled={deleteMutation.isPending}
          class="rounded-lg border border-danger/30 px-3 py-1.5 text-sm text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
        >
          {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>

    <!-- Prompt -->
    <div>
      <p class="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">Prompt</p>
      <pre
        class="whitespace-pre-wrap wrap-break-word rounded-lg bg-surface p-3 font-mono text-sm text-text">{job.prompt}</pre>
    </div>

    <!-- Parameters + Timing -->
    <div class="grid gap-4 sm:grid-cols-2">
      <!-- Parameters -->
      <div class="rounded-xl border border-border bg-surface p-4">
        <p class="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">Parameters</p>
        <dl class="flex flex-col gap-2 text-xs">
          {#if job.aspect_ratio}
            <div class="flex justify-between">
              <dt class="text-text-dim">Aspect ratio</dt>
              <dd class="font-medium text-text">{job.aspect_ratio}</dd>
            </div>
          {/if}
          {#if job.token_cost != null}
            <div class="flex justify-between">
              <dt class="text-text-dim">Token cost</dt>
              <dd class="flex items-center gap-1 font-medium text-accent">
                <Coins size={11} />
                {job.token_cost}
              </dd>
            </div>
          {/if}
        </dl>
      </div>

      <!-- Timing -->
      <div class="rounded-xl border border-border bg-surface p-4">
        <p class="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">Timing</p>
        <dl class="flex flex-col gap-2 text-xs">
          <div class="flex justify-between">
            <dt class="text-text-dim">Created</dt>
            <dd class="font-medium text-text">{formatDateTime(job.created_at)}</dd>
          </div>
          {#if job.started_at}
            <div class="flex justify-between">
              <dt class="text-text-dim">Started</dt>
              <dd class="font-medium text-text">{formatDateTime(job.started_at)}</dd>
            </div>
          {/if}
          {#if job.completed_at}
            <div class="flex justify-between">
              <dt class="text-text-dim">Completed</dt>
              <dd class="font-medium text-text">{formatDateTime(job.completed_at)}</dd>
            </div>
          {/if}
          {#if job.started_at && job.completed_at}
            <div class="flex justify-between">
              <dt class="text-text-dim">Duration</dt>
              <dd class="font-medium text-text">
                {formatDuration(job.started_at, job.completed_at)}
              </dd>
            </div>
          {/if}
        </dl>
      </div>
    </div>

    <!-- Error / moderation block -->
    {#if (job.status === 'failed' || job.status === 'moderated') && job.error}
      <div class="flex gap-3 rounded-xl border border-danger/20 bg-danger/5 p-4">
        <AlertCircle size={16} class="mt-0.5 shrink-0 text-danger" />
        <p class="text-sm text-danger">{job.error}</p>
      </div>
    {/if}

    <!-- Outputs -->
    {#if hasOutputs}
      <div>
        <p class="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">
          Outputs ({nonThumbnailOutputs.length})
        </p>
        <JobOutputGrid outputs={job.outputs ?? []} generationType={job.generation_type} />
      </div>
    {:else if job.status !== 'completed'}
      <!-- Still running — polling indicator -->
      <div class="flex items-center gap-2 text-xs text-text-muted">
        <div class="h-2 w-2 animate-pulse rounded-full bg-accent"></div>
        Waiting for outputs…
      </div>
    {/if}
  {/if}
</div>
