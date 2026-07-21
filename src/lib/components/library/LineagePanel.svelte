<script lang="ts">
  import { createQuery } from '@tanstack/svelte-query';
  import { ChevronRight, History, Image as ImageIcon } from 'lucide-svelte';
  import type { components } from '$lib/api/types';
  import { lineageQueryOptions } from '$lib/queries/library';
  import { timeAgo } from '$lib/utils/format';
  import MediaImage from '$lib/media/MediaImage.svelte';
  import * as m from '$paraglide/messages';

  type LineageEdge = components['schemas']['LineageEdge'];
  type LineageNode = components['schemas']['LineageNode'];
  type LineageRelation = components['schemas']['LineageRelation'];

  let {
    assetRef,
    onNavigate,
  }: {
    assetRef: string;
    onNavigate: (assetRef: string) => void;
  } = $props();

  const lineageQuery = createQuery(() => lineageQueryOptions(assetRef));
  const ancestors = $derived([...(lineageQuery.data?.ancestors ?? [])].reverse());
  const descendantGroups = $derived.by(() => {
    const groups: Partial<Record<LineageRelation, LineageEdge[]>> = {};
    for (const edge of lineageQuery.data?.descendants ?? []) {
      (groups[edge.relation] ??= []).push(edge);
    }
    return (Object.entries(groups) as [LineageRelation, LineageEdge[]][]).map(
      ([relation, edges]) => ({ relation, edges }),
    );
  });

  function formatTimestamp(timestampMs: number): string {
    const value = Math.max(0, Math.round(timestampMs));
    const minutes = Math.floor(value / 60_000);
    const seconds = Math.floor((value % 60_000) / 1_000);
    const milliseconds = value % 1_000;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(
      milliseconds,
    ).padStart(3, '0')}`;
  }

  function relationLabel(relation: LineageRelation): string {
    if (relation === 'generated_from_upload') return m.library_lineage_generated_from_upload();
    if (relation === 'generated_from_output') return m.library_lineage_generated_from_output();
    return relation === 'frame_of_output'
      ? m.library_lineage_frame_of_output()
      : m.library_lineage_frame_of_upload();
  }

  function navigate(nextAssetRef: string) {
    if (nextAssetRef !== assetRef) onNavigate(nextAssetRef);
  }
</script>

{#snippet nodeRow(
  node: LineageNode,
  relation: string,
  sourceTimestamp?: number | null,
  focus = false,
)}
  <button
    type="button"
    onclick={() => navigate(node.asset_ref)}
    class="flex w-full items-center gap-2 rounded-lg p-1.5 text-left transition-colors hover:bg-surface-hover {focus
      ? 'bg-accent/10 ring-1 ring-accent/30'
      : ''}"
  >
    <MediaImage
      media={node.media}
      alt={node.asset_ref}
      sizes="48px"
      class="h-10 w-10 shrink-0 rounded object-cover"
    />
    <span class="min-w-0 flex-1">
      <span class="block truncate text-xs font-medium text-text">{node.asset_ref}</span>
      <span class="block truncate text-[11px] text-text-dim">
        {relation}
        {#if sourceTimestamp != null}
          · {formatTimestamp(sourceTimestamp)}{/if}
      </span>
    </span>
    <span class="shrink-0 text-[10px] text-text-dim">{timeAgo(node.created_at)}</span>
    {#if node.source === 'output' && node.model}
      <span
        class="max-w-24 truncate rounded-full bg-surface-hover px-1.5 py-0.5 text-[10px] text-text-muted"
        >{node.model}</span
      >
    {/if}
    <ChevronRight size={14} class="shrink-0 text-text-dim" />
  </button>
{/snippet}

{#if lineageQuery.isLoading}
  <div class="space-y-2 py-2" aria-label={m.library_lineage_loading()}>
    <div class="h-12 animate-pulse rounded-lg bg-surface-hover"></div>
    <div class="h-12 animate-pulse rounded-lg bg-surface-hover"></div>
  </div>
{:else if lineageQuery.isError}
  <div class="py-2 text-center">
    <p class="text-xs text-danger">{m.library_lineage_load_error()}</p>
    <button
      type="button"
      class="mt-1 text-xs font-medium text-accent hover:underline"
      onclick={() => lineageQuery.refetch()}>{m.common_retry()}</button
    >
  </div>
{:else if lineageQuery.data}
  <div class="space-y-1 py-2">
    {#if lineageQuery.data.ancestors_truncated}
      <div class="flex items-center gap-2 px-2 py-1.5 text-[11px] text-text-dim">
        <History size={13} />
        {m.library_lineage_history_continues()}
      </div>
    {/if}

    {#each ancestors as edge (edge.node.asset_ref)}
      {@render nodeRow(edge.node, relationLabel(edge.relation), edge.source_timestamp_ms)}
    {/each}

    {@render nodeRow(lineageQuery.data.focus, m.library_lineage_current(), undefined, true)}

    {#if descendantGroups.length > 0}
      <div class="mt-2 flex items-center gap-2 px-2 pt-2 text-[11px] font-medium text-text-muted">
        <ImageIcon size={13} />
        {m.library_lineage_descendants({
          jobs: lineageQuery.data.descendant_totals.job_count,
          frames: lineageQuery.data.descendant_totals.frame_count,
        })}
      </div>
      {#each descendantGroups as group (group.relation)}
        <p class="px-2 pt-1 text-[10px] font-semibold uppercase tracking-wide text-text-dim">
          {relationLabel(group.relation)}
        </p>
        {#each group.edges as edge (edge.node.asset_ref)}
          {@render nodeRow(edge.node, relationLabel(edge.relation), edge.source_timestamp_ms)}
        {/each}
      {/each}
    {/if}

    {#if lineageQuery.data.descendants_truncated}
      <p class="px-2 pt-1 text-[11px] text-text-dim">
        {m.library_lineage_showing_first({ count: 50 })}
      </p>
    {/if}
  </div>
{/if}
