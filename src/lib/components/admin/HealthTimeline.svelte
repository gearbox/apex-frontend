<script lang="ts">
  import type { HealthSnapshotResponse } from '$lib/api/admin';

  interface Props {
    snapshots: HealthSnapshotResponse[];
  }

  let { snapshots }: Props = $props();

  const STATUS_COLORS: Record<string, string> = {
    healthy: 'var(--apex-success)',
    degraded: 'var(--apex-warning)',
    unhealthy: 'var(--apex-danger)',
  };

  // API returns newest-first; reverse for left→right chronological
  const ordered = $derived([...snapshots].reverse());

  function colorFor(status: string): string {
    return STATUS_COLORS[status] ?? 'var(--apex-text-dim)';
  }

  function ariaLabel(items: HealthSnapshotResponse[]): string {
    if (!items.length) return 'System status timeline: no data';
    const counts: Record<string, number> = {};
    for (const s of items) {
      counts[s.overall_status] = (counts[s.overall_status] ?? 0) + 1;
    }
    const parts = Object.entries(counts).map(([k, v]) => `${v} ${k}`);
    return `System status, last hour: ${parts.join(', ')}`;
  }
</script>

{#if ordered.length === 0}
  <p class="empty">No history data available.</p>
{:else}
  <svg
    class="timeline"
    viewBox="0 0 {ordered.length} 1"
    preserveAspectRatio="none"
    role="img"
    aria-label={ariaLabel(ordered)}
  >
    {#each ordered as snap, i (snap.checked_at + i)}
      <rect x={i} y={0} width={1} height={1} fill={colorFor(snap.overall_status)}>
        <title>{new Date(snap.checked_at).toLocaleString()} — {snap.overall_status}</title>
      </rect>
    {/each}
  </svg>
{/if}

<style>
  .timeline {
    display: block;
    width: 100%;
    height: 32px;
    border-radius: 4px;
    overflow: hidden;
  }

  .empty {
    font-size: 13px;
    color: var(--apex-text-dim);
    margin: 0;
  }
</style>
