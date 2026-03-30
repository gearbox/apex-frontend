<script lang="ts">
  import { createQuery } from '@tanstack/svelte-query';
  import { userStatsQueryOptions } from '$lib/queries/user';
  import { formatBytes, formatNumber } from '$lib/utils/format';
  import * as m from '$paraglide/messages';

  const query = createQuery(() => userStatsQueryOptions());
</script>

{#if query.isLoading}
  <div class="stats-section">
    <p class="section-header">{m.profile_stats_title()}</p>
    <div class="stats-grid">
      {#each Array(6) as _, i (i)}
        <div class="stat-card skeleton"></div>
      {/each}
    </div>
  </div>
{:else if query.isSuccess}
  <div class="stats-section">
    <p class="section-header">{m.profile_stats_title()}</p>
    <div class="stats-grid">
      <div class="stat-card">
        <span class="stat-label">{m.profile_stats_total_jobs()}</span>
        <span class="stat-value">{formatNumber(query.data.total_jobs)}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">{m.profile_stats_completed()}</span>
        <span class="stat-value">{formatNumber(query.data.completed_jobs)}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">{m.profile_stats_failed()}</span>
        <span class="stat-value">{formatNumber(query.data.failed_jobs)}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">{m.profile_stats_outputs()}</span>
        <span class="stat-value">{formatNumber(query.data.total_outputs)}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">{m.profile_stats_uploads()}</span>
        <span class="stat-value">{formatNumber(query.data.total_uploads)}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">{m.profile_stats_storage()}</span>
        <span class="stat-value">{formatBytes(query.data.storage_used_bytes)}</span>
      </div>
    </div>
  </div>
{/if}

<style>
  .stats-section {
    margin-top: 24px;
  }

  .section-header {
    font-size: 11px;
    color: var(--apex-text-muted);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin: 0 0 14px;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  @media (min-width: 768px) {
    .stats-grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  .stat-card {
    background: var(--apex-surface);
    border: 1px solid var(--apex-border);
    border-radius: 10px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .stat-card.skeleton {
    height: 60px;
    animation: pulse 1.5s ease-in-out infinite;
    border: none;
    background: var(--apex-surface);
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
  }

  .stat-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--apex-text-muted);
  }

  .stat-value {
    font-size: 20px;
    font-weight: 700;
    color: var(--apex-text);
  }
</style>
