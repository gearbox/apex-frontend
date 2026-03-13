<script lang="ts">
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
  import { Cpu, AlertCircle } from 'lucide-svelte';
  import { adminModelsQueryOptions, toggleAdminModelMutationOptions } from '$lib/queries/admin';
  import ToggleSwitch from '$lib/components/shared/ToggleSwitch.svelte';

  let enabledOnly = $state(false);
  const queryClient = useQueryClient();

  const modelsQuery = createQuery(() =>
    adminModelsQueryOptions({ enabled_only: enabledOnly || undefined }),
  );
  const toggleMutation = createMutation(() => toggleAdminModelMutationOptions(queryClient));

  let togglingKeys = $state<Set<string>>(new Set());

  async function onToggle(modelKey: string, currentEnabled: boolean) {
    togglingKeys = new Set([...togglingKeys, modelKey]);
    try {
      await toggleMutation.mutateAsync({ modelKey, isEnabled: !currentEnabled });
    } finally {
      togglingKeys = new Set([...togglingKeys].filter((k) => k !== modelKey));
    }
  }

  function formatRelativeTime(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }
</script>

<div class="tab-content">
  <!-- Filter -->
  <div class="filters">
    <label class="filter-toggle">
      <input
        type="checkbox"
        bind:checked={enabledOnly}
      />
      <span>Enabled only</span>
    </label>
  </div>

  {#if modelsQuery.isPending}
    <div class="model-grid">
      {#each { length: 4 } as _, i (i)}
        <div class="skeleton-card"></div>
      {/each}
    </div>
  {:else if modelsQuery.isError}
    <div class="empty-state">
      <AlertCircle size={32} />
      <p>Failed to load models.</p>
      <button class="retry-btn" onclick={() => modelsQuery.refetch()}>Retry</button>
    </div>
  {:else if modelsQuery.data}
    {@const items = modelsQuery.data.items}

    {#if items.length === 0}
      <div class="empty-state">
        <Cpu size={32} />
        <p>No models found</p>
      </div>
    {:else}
      <div class="model-grid">
        {#each items as model (model.model_key)}
          <div class="model-card">
            <div class="model-header">
              <div class="model-info">
                <span class="model-name">{model.name}</span>
                <span class="provider-badge">{model.provider}</span>
              </div>
              <ToggleSwitch
                checked={model.is_enabled}
                loading={togglingKeys.has(model.model_key)}
                ontoggle={() => onToggle(model.model_key, model.is_enabled)}
              />
            </div>
            <code class="model-key">{model.model_key}</code>
            <p class="model-desc">{model.description}</p>
            <span class="model-updated">Updated: {formatRelativeTime(model.updated_at)}</span>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .tab-content {
    padding: 16px;
  }
  @media (min-width: 768px) {
    .tab-content { padding: 24px; }
  }

  .filters {
    margin-bottom: 20px;
  }

  .filter-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    color: var(--apex-text-muted);
    cursor: pointer;
  }

  .filter-toggle input {
    accent-color: var(--apex-accent);
  }

  .model-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 12px;
  }
  @media (min-width: 768px) {
    .model-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  .skeleton-card {
    height: 140px;
    background: var(--apex-surface);
    border-radius: 12px;
    animation: pulse 1.5s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 48px 0;
    color: var(--apex-text-dim);
  }

  .retry-btn {
    padding: 8px 20px;
    border-radius: 8px;
    border: 1px solid var(--apex-border);
    background: transparent;
    color: var(--apex-text-muted);
    font-size: 14px;
    cursor: pointer;
    font-family: inherit;
  }

  .model-card {
    background: var(--apex-surface);
    border: 1px solid var(--apex-border);
    border-radius: 12px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .model-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .model-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .model-name {
    font-size: 14px;
    font-weight: 700;
    color: var(--apex-text);
  }

  .provider-badge {
    display: inline-flex;
    padding: 2px 10px;
    border-radius: 99px;
    font-size: 11px;
    background: var(--apex-surface-hover);
    color: var(--apex-text-muted);
    width: fit-content;
  }

  .model-key {
    font-family: monospace;
    font-size: 12px;
    color: var(--apex-text-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .model-desc {
    font-size: 13px;
    color: var(--apex-text-muted);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin: 0;
  }

  .model-updated {
    font-size: 11px;
    color: var(--apex-text-dim);
  }
</style>
