<script lang="ts">
  import { onDestroy } from 'svelte';
  import { createQuery } from '@tanstack/svelte-query';
  import { Activity } from 'lucide-svelte';
  import { HealthStreamService, type HealthStreamStatus } from '$lib/services/healthStream';
  import { adminHealthQueryOptions, adminHealthHistoryQueryOptions } from '$lib/queries/admin';
  import StatusBadge from '$lib/components/shared/StatusBadge.svelte';
  import HealthTimeline from './HealthTimeline.svelte';
  import type { DetailedHealthResponse } from '$lib/api/admin';

  const HEALTH_STATUS_COLOR_MAP: Record<string, string> = {
    healthy: 'success',
    degraded: 'warning',
    unhealthy: 'danger',
    unknown: 'muted',
    inactive: 'muted',
  };

  let streamStatus = $state<HealthStreamStatus>('disconnected');
  let streamSnapshot = $state<DetailedHealthResponse | null>(null);

  const service = new HealthStreamService();

  service.start({
    onSnapshot: (snap) => {
      streamSnapshot = snap;
    },
    onStatus: (s) => {
      streamStatus = s;
    },
  });

  onDestroy(() => {
    service.stop();
  });

  const refetchInterval = $derived(streamStatus === 'connected' ? false : 60_000);

  const healthQuery = createQuery(() => adminHealthQueryOptions(refetchInterval));
  const historyQuery = createQuery(() => adminHealthHistoryQueryOptions({ limit: 60 }));

  const snapshot = $derived(streamSnapshot ?? healthQuery.data ?? null);

  function formatTs(ts: string | undefined): string {
    if (!ts) return '—';
    return new Date(ts).toLocaleString();
  }
</script>

<div class="health-tab">
  <div class="tab-header">
    <Activity size={20} />
    <h2 class="tab-title">System Health</h2>
    <span
      class="stream-indicator"
      class:live={streamStatus === 'connected'}
      data-testid="stream-indicator"
    >
      {#if streamStatus === 'connected'}
        <span class="dot live-dot"></span> Live
      {:else}
        <span class="dot poll-dot"></span> Polling
      {/if}
    </span>
  </div>

  {#if !snapshot}
    <p class="loading-msg">
      {#if healthQuery.isLoading}Loading health data…{:else if healthQuery.isError}Failed to load
        health data.{/if}
    </p>
  {:else}
    <!-- Overall status -->
    <div class="overall-row">
      <StatusBadge status={snapshot.status} colorMap={HEALTH_STATUS_COLOR_MAP} />
      <span class="checked-at">Last checked: {formatTs(snapshot.checked_at)}</span>
    </div>

    <!-- Infrastructure -->
    <section class="category-section" data-testid="category-infrastructure">
      <div class="category-header">
        <span class="category-name">Infrastructure</span>
        <StatusBadge status={snapshot.infrastructure.status} colorMap={HEALTH_STATUS_COLOR_MAP} />
      </div>
      <ul class="component-list">
        {#each snapshot.infrastructure.components as comp (comp.name)}
          <li class="component-row">
            <span
              class="status-dot"
              style="background:{HEALTH_STATUS_COLOR_MAP[comp.status]
                ? `var(--apex-${HEALTH_STATUS_COLOR_MAP[comp.status]})`
                : 'var(--apex-text-dim)'}"
            ></span>
            <span class="comp-name">{comp.name}</span>
            <span class="comp-latency">{comp.latency_ms} ms</span>
            {#if comp.message}
              <span class="comp-message">{comp.message}</span>
            {/if}
          </li>
        {/each}
      </ul>
    </section>

    <!-- Platform APIs -->
    <section class="category-section" data-testid="category-platform-apis">
      <div class="category-header">
        <span class="category-name">Platform APIs</span>
        <StatusBadge status={snapshot.platform_apis.status} colorMap={HEALTH_STATUS_COLOR_MAP} />
      </div>
      <ul class="component-list">
        {#each snapshot.platform_apis.components as comp (comp.name)}
          <li class="component-row">
            <span
              class="status-dot"
              style="background:{HEALTH_STATUS_COLOR_MAP[comp.status]
                ? `var(--apex-${HEALTH_STATUS_COLOR_MAP[comp.status]})`
                : 'var(--apex-text-dim)'}"
            ></span>
            <span class="comp-name">{comp.name}</span>
            <span class="comp-latency">{comp.latency_ms} ms</span>
            {#if comp.message}
              <span class="comp-message">{comp.message}</span>
            {/if}
          </li>
        {/each}
      </ul>
    </section>

    <!-- Cloud Providers -->
    {#each Object.entries(snapshot.cloud_providers) as [productId, category] (productId)}
      <section class="category-section" data-testid="category-cloud-{productId}">
        <div class="category-header">
          <span class="category-name">Cloud: {productId}</span>
          <StatusBadge status={category.status} colorMap={HEALTH_STATUS_COLOR_MAP} />
        </div>
        <ul class="component-list">
          {#each category.components as comp (comp.name)}
            <li class="component-row">
              <span
                class="status-dot"
                style="background:{HEALTH_STATUS_COLOR_MAP[comp.status]
                  ? `var(--apex-${HEALTH_STATUS_COLOR_MAP[comp.status]})`
                  : 'var(--apex-text-dim)'}"
              ></span>
              <span class="comp-name">{comp.name}</span>
              <span class="comp-latency">{comp.latency_ms} ms</span>
              {#if comp.message}
                <span class="comp-message">{comp.message}</span>
              {/if}
            </li>
          {/each}
        </ul>
      </section>
    {/each}

    <!-- GPU Sessions -->
    <section class="category-section" data-testid="category-gpu-sessions">
      <div class="category-header">
        <span class="category-name">GPU Sessions</span>
        <StatusBadge status={snapshot.gpu_sessions.status} colorMap={HEALTH_STATUS_COLOR_MAP} />
      </div>
      <div class="gpu-counts">
        <span class="gpu-stat"><strong>{snapshot.gpu_sessions.healthy}</strong> healthy</span>
        <span class="gpu-stat"><strong>{snapshot.gpu_sessions.stale}</strong> stale</span>
        <span class="gpu-stat"><strong>{snapshot.gpu_sessions.total}</strong> total</span>
        {#if snapshot.gpu_sessions.message}
          <span class="comp-message">{snapshot.gpu_sessions.message}</span>
        {/if}
      </div>
    </section>
  {/if}

  <!-- History Timeline -->
  <section class="history-section">
    <h3 class="section-title">Last Hour</h3>
    <HealthTimeline snapshots={historyQuery.data ?? []} />
  </section>
</div>

<style>
  .health-tab {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-width: 900px;
  }

  .tab-header {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .tab-title {
    font-size: 16px;
    font-weight: 600;
    color: var(--apex-text);
    margin: 0;
    flex: 1;
  }

  .stream-indicator {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    font-weight: 500;
    color: var(--apex-text-dim);
    padding: 3px 10px;
    border-radius: 99px;
    background: var(--apex-surface-hover);
  }

  .stream-indicator.live {
    color: var(--apex-success);
    background: color-mix(in srgb, var(--apex-success) 12%, transparent);
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    display: inline-block;
    flex-shrink: 0;
  }

  .live-dot {
    background: var(--apex-success);
  }

  .poll-dot {
    background: var(--apex-text-dim);
  }

  .loading-msg {
    color: var(--apex-text-dim);
    font-size: 14px;
    margin: 0;
  }

  .overall-row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .checked-at {
    font-size: 12px;
    color: var(--apex-text-dim);
  }

  .category-section {
    background: var(--apex-surface);
    border: 1px solid var(--apex-border);
    border-radius: 8px;
    overflow: hidden;
  }

  .category-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border-bottom: 1px solid var(--apex-border);
    background: var(--apex-surface-hover);
  }

  .category-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--apex-text);
  }

  .component-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .component-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 14px;
    border-bottom: 1px solid var(--apex-border);
    font-size: 13px;
  }

  .component-row:last-child {
    border-bottom: none;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .comp-name {
    flex: 1;
    color: var(--apex-text);
  }

  .comp-latency {
    color: var(--apex-text-muted);
    font-size: 12px;
    min-width: 54px;
    text-align: right;
  }

  .comp-message {
    color: var(--apex-text-dim);
    font-size: 12px;
    font-style: italic;
  }

  .gpu-counts {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 10px 14px;
    font-size: 13px;
    color: var(--apex-text);
    flex-wrap: wrap;
  }

  .gpu-stat strong {
    color: var(--apex-accent);
  }

  .history-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .section-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--apex-text-muted);
    margin: 0;
  }
</style>
