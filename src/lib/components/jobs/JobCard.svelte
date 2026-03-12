<script lang="ts">
  import { goto } from '$app/navigation';
  import { MoreHorizontal } from 'lucide-svelte';
  import { timeAgo } from '$lib/utils/format';
  import JobStatusBadge from './JobStatusBadge.svelte';
  import JobTypeIcon from './JobTypeIcon.svelte';
  import type { components } from '$lib/api/types';

  type UnifiedJobResponse = components['schemas']['UnifiedJobResponse'];

  let { job, onDelete }: { job: UnifiedJobResponse; onDelete?: (id: string) => void } = $props();

  let menuOpen = $state(false);

  function handleWindowPointerDown(e: PointerEvent) {
    if (!menuOpen) return;
    const target = e.target as HTMLElement;
    if (!target.closest('[data-menu]')) {
      menuOpen = false;
    }
  }
</script>

<svelte:window onpointerdown={handleWindowPointerDown} />

<a
  href="/app/jobs/{job.id}"
  class="relative flex items-center gap-3 rounded-xl border border-border bg-surface p-3 text-left transition-colors hover:border-border-active hover:bg-surface-hover"
>
  {#if job.status === 'running'}
    <div class="absolute bottom-0 left-0 h-0.5 w-full animate-pulse rounded-full bg-accent"></div>
  {/if}

  <!-- Thumbnail -->
  {#if job.thumbnail_url}
    <img
      src={job.thumbnail_url}
      loading="lazy"
      class="h-12 w-12 shrink-0 rounded-lg object-cover"
      alt={job.name}
    />
  {:else}
    <div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-text-dim">
      <JobTypeIcon generationType={job.generation_type} size={20} />
    </div>
  {/if}

  <!-- Name + prompt -->
  <div class="min-w-0 flex-1">
    <p class="truncate text-sm font-medium text-text">{job.name}</p>
    <p class="truncate text-xs text-text-muted">{job.prompt.slice(0, 80)}</p>
  </div>

  <!-- Badge + time -->
  <div class="relative z-10 flex shrink-0 flex-col items-end gap-1">
    <JobStatusBadge status={job.status} />
    <span class="text-xs text-text-dim">{timeAgo(job.created_at)}</span>
  </div>

  <!-- Actions menu -->
  <div class="relative z-10" data-menu>
    <button
      onclick={(e) => { e.preventDefault(); e.stopPropagation(); menuOpen = !menuOpen; }}
      class="flex h-7 w-7 items-center justify-center rounded-lg text-text-dim transition-colors hover:bg-surface-hover hover:text-text"
      aria-label="Job actions"
    >
      <MoreHorizontal size={15} />
    </button>
    {#if menuOpen}
      <div
        class="absolute right-0 top-8 z-10 min-w-[130px] overflow-hidden rounded-lg border border-border bg-surface shadow-lg"
        data-menu
      >
        <button
          onclick={(e) => { e.preventDefault(); menuOpen = false; goto('/app/jobs/' + job.id); }}
          class="w-full px-3 py-2 text-left text-sm text-text hover:bg-surface-hover"
        >
          View details
        </button>
        {#if onDelete}
          <button
            onclick={(e) => { e.preventDefault(); menuOpen = false; onDelete!(job.id); }}
            class="w-full px-3 py-2 text-left text-sm text-danger hover:bg-danger/10"
          >
            Delete
          </button>
        {/if}
      </div>
    {/if}
  </div>
</a>
