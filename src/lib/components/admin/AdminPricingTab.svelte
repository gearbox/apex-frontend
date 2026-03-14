<script lang="ts">
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
  import { Coins, AlertCircle, Plus, Pencil, Trash2 } from 'lucide-svelte';
  import { adminPricingQueryOptions, patchPricingRuleMutationOptions } from '$lib/queries/admin';
  import ToggleSwitch from '$lib/components/shared/ToggleSwitch.svelte';
  import PricingRuleModal from '$lib/components/admin/PricingRuleModal.svelte';
  import DeletePricingConfirm from '$lib/components/admin/DeletePricingConfirm.svelte';
  import type { PricingRuleResponse } from '$lib/api/admin';
  import { addToast } from '$lib/stores/toasts';
  import { ApiRequestError } from '$lib/api/errors';

  let activeOnly = $state(true);
  const queryClient = useQueryClient();

  const pricingQuery = createQuery(() => adminPricingQueryOptions({ active_only: activeOnly }));
  const patchMutation = createMutation(() => patchPricingRuleMutationOptions(queryClient));

  let togglingIds = $state<Set<string>>(new Set());
  let editingRule = $state<PricingRuleResponse | null>(null);
  let deletingRule = $state<PricingRuleResponse | null>(null);
  let showCreateModal = $state(false);

  async function onToggle(rule: PricingRuleResponse) {
    togglingIds = new Set([...togglingIds, rule.id]);
    try {
      await patchMutation.mutateAsync({ ruleId: rule.id, body: { is_active: !rule.is_active } });
    } catch (e) {
      const msg =
        e instanceof ApiRequestError ? e.message : 'Failed to update pricing rule.';
      addToast({ type: 'error', message: msg });
    } finally {
      togglingIds = new Set([...togglingIds].filter((id) => id !== rule.id));
    }
  }

  function formatTokenCost(cost: number): string {
    return `${cost.toLocaleString()} tokens`;
  }

  function formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString();
  }
</script>

<div class="tab-content">
  <!-- Filters + Add button -->
  <div class="filters">
    <label class="filter-toggle">
      <input type="checkbox" bind:checked={activeOnly} />
      <span>Active only</span>
    </label>
    <button class="add-btn" onclick={() => (showCreateModal = true)}>
      <Plus size={15} />
      <span>Add Rule</span>
    </button>
  </div>

  {#if pricingQuery.isPending}
    <div class="skeleton-list">
      {#each { length: 5 } as _, i (i)}
        <div class="skeleton-row"></div>
      {/each}
    </div>
  {:else if pricingQuery.isError}
    <div class="empty-state">
      <AlertCircle size={32} />
      <p>Failed to load pricing rules.</p>
      <button class="retry-btn" onclick={() => pricingQuery.refetch()}>Retry</button>
    </div>
  {:else if pricingQuery.data}
    {@const items = pricingQuery.data}

    {#if items.length === 0}
      <div class="empty-state">
        <Coins size={32} />
        <p>No pricing rules found</p>
      </div>
    {:else}
      <!-- Desktop table -->
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Provider</th>
              <th>Gen Type</th>
              <th>Model</th>
              <th>Token Cost</th>
              <th>Active</th>
              <th>Effective From</th>
              <th>Effective Until</th>
              <th class="notes-col">Notes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each items as rule (rule.id)}
              <tr>
                <td>{rule.provider}</td>
                <td><span class="gen-type-badge">{rule.generation_type}</span></td>
                <td>
                  {#if rule.model}
                    <code class="model-key">{rule.model}</code>
                  {:else}
                    <span class="all-models-badge">All models</span>
                  {/if}
                </td>
                <td class="cost-cell">{formatTokenCost(rule.token_cost)}</td>
                <td>
                  <ToggleSwitch
                    checked={rule.is_active}
                    loading={togglingIds.has(rule.id)}
                    ontoggle={() => onToggle(rule)}
                  />
                </td>
                <td class="date-cell">{formatDate(rule.effective_from)}</td>
                <td class="date-cell">{formatDate(rule.effective_until)}</td>
                <td class="notes-col">
                  <span class="notes-text">{rule.notes ?? '—'}</span>
                </td>
                <td>
                  <div class="row-actions">
                    <button
                      class="action-btn"
                      aria-label="Edit rule"
                      onclick={() => (editingRule = rule)}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      class="action-btn action-btn--danger"
                      aria-label="Delete rule"
                      onclick={() => (deletingRule = rule)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <!-- Mobile card list -->
      <div class="card-list">
        {#each items as rule (rule.id)}
          <div class="pricing-card">
            <div class="card-header">
              <div class="card-info">
                <span class="card-provider">{rule.provider}</span>
                <div class="card-badges">
                  <span class="gen-type-badge">{rule.generation_type}</span>
                  {#if rule.model}
                    <code class="model-key">{rule.model}</code>
                  {:else}
                    <span class="all-models-badge">All models</span>
                  {/if}
                </div>
              </div>
              <ToggleSwitch
                checked={rule.is_active}
                loading={togglingIds.has(rule.id)}
                ontoggle={() => onToggle(rule)}
              />
            </div>
            <div class="card-cost">{formatTokenCost(rule.token_cost)}</div>
            <div class="card-dates">
              <span class="date-label">From:</span>
              <span class="date-value">{formatDate(rule.effective_from)}</span>
              <span class="date-label">Until:</span>
              <span class="date-value">{formatDate(rule.effective_until)}</span>
            </div>
            {#if rule.notes}
              <p class="card-notes">{rule.notes}</p>
            {/if}
            <div class="card-actions">
              <button class="action-btn" onclick={() => (editingRule = rule)}>
                <Pencil size={14} />
                Edit
              </button>
              <button
                class="action-btn action-btn--danger"
                onclick={() => (deletingRule = rule)}
              >
                <Trash2 size={14} />
                Delete
              </button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  {/if}
</div>

{#if showCreateModal}
  <PricingRuleModal
    {queryClient}
    onclose={() => (showCreateModal = false)}
  />
{/if}

{#if editingRule}
  <PricingRuleModal
    rule={editingRule}
    {queryClient}
    onclose={() => (editingRule = null)}
  />
{/if}

{#if deletingRule}
  <DeletePricingConfirm
    rule={deletingRule}
    {queryClient}
    onclose={() => (deletingRule = null)}
  />
{/if}

<style>
  .tab-content {
    padding: 16px;
  }
  @media (min-width: 768px) {
    .tab-content { padding: 24px; }
  }

  .filters {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 20px;
  }
  @media (min-width: 768px) {
    .filters {
      flex-direction: row;
      align-items: center;
      justify-content: space-between;
    }
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

  .add-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 9px 16px;
    border-radius: 8px;
    border: none;
    background: var(--apex-accent);
    color: white;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: opacity 0.15s;
    width: 100%;
    justify-content: center;
  }
  @media (min-width: 768px) {
    .add-btn { width: auto; }
  }
  .add-btn:hover { opacity: 0.9; }

  .skeleton-list { display: flex; flex-direction: column; gap: 8px; }
  .skeleton-row {
    height: 48px;
    background: var(--apex-surface);
    border-radius: 8px;
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

  /* Desktop table */
  .table-wrap { display: none; overflow-x: auto; }
  @media (min-width: 768px) { .table-wrap { display: block; } }

  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  .data-table th {
    text-align: left;
    padding: 8px 12px;
    color: var(--apex-text-muted);
    font-weight: 600;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    border-bottom: 1px solid var(--apex-border);
    white-space: nowrap;
  }
  .data-table td {
    padding: 10px 12px;
    color: var(--apex-text);
    border-bottom: 1px solid var(--apex-border);
    vertical-align: middle;
  }

  .date-cell { white-space: nowrap; font-size: 12px; color: var(--apex-text-muted); }
  .cost-cell { font-weight: 600; }

  .notes-col {
    max-width: 180px;
  }
  .notes-text {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--apex-text-muted);
    font-size: 12px;
    max-width: 180px;
  }

  .gen-type-badge {
    display: inline-flex;
    padding: 2px 8px;
    border-radius: 99px;
    font-size: 11px;
    font-weight: 600;
    background: var(--apex-surface-hover);
    color: var(--apex-accent);
  }

  .all-models-badge {
    display: inline-flex;
    padding: 2px 8px;
    border-radius: 99px;
    font-size: 11px;
    background: var(--apex-surface-hover);
    color: var(--apex-text-muted);
  }

  .model-key {
    font-family: monospace;
    font-size: 11px;
    color: var(--apex-text-dim);
  }

  .row-actions {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .action-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 5px 8px;
    border-radius: 6px;
    border: 1px solid var(--apex-border);
    background: transparent;
    color: var(--apex-text-muted);
    font-size: 12px;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.15s, color 0.15s;
  }
  .action-btn:hover { background: var(--apex-surface-hover); color: var(--apex-text); }
  .action-btn--danger { color: var(--apex-danger); }
  .action-btn--danger:hover { background: color-mix(in srgb, var(--apex-danger) 10%, transparent); }

  /* Mobile card list */
  .card-list { display: flex; flex-direction: column; gap: 12px; }
  @media (min-width: 768px) { .card-list { display: none; } }

  .pricing-card {
    background: var(--apex-surface);
    border: 1px solid var(--apex-border);
    border-radius: 12px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .card-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .card-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .card-provider {
    font-size: 14px;
    font-weight: 700;
    color: var(--apex-text);
  }

  .card-badges {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
  }

  .card-cost {
    font-size: 15px;
    font-weight: 700;
    color: var(--apex-text);
  }

  .card-dates {
    display: grid;
    grid-template-columns: auto 1fr auto 1fr;
    gap: 4px 8px;
    font-size: 11px;
    align-items: center;
  }

  .date-label {
    color: var(--apex-text-dim);
    font-weight: 500;
  }

  .date-value {
    color: var(--apex-text-muted);
  }

  .card-notes {
    font-size: 12px;
    color: var(--apex-text-muted);
    margin: 0;
  }

  .card-actions {
    display: flex;
    gap: 8px;
    margin-top: 4px;
  }
</style>
