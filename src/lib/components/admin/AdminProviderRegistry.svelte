<script lang="ts">
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
  import { Landmark, AlertCircle, ChevronUp, ChevronDown } from 'lucide-svelte';
  import {
    adminPaymentProvidersQueryOptions,
    updatePaymentProviderMutationOptions,
  } from '$lib/queries/admin';
  import ToggleSwitch from '$lib/components/shared/ToggleSwitch.svelte';
  import { addToast } from '$lib/stores/toasts';
  import { ApiRequestError } from '$lib/api/errors';
  import type { PaymentProviderInfo } from '$lib/api/admin';

  const queryClient = useQueryClient();
  const providersQuery = createQuery(() => adminPaymentProvidersQueryOptions());
  const updateMutation = createMutation(() => updatePaymentProviderMutationOptions(queryClient));

  let pendingProviders = $state<Set<string>>(new Set());

  const sortedProviders = $derived(
    [...(providersQuery.data ?? [])].sort((a, b) => a.display_order - b.display_order),
  );

  function providerLabel(provider: string): string {
    return provider === 'stripe' ? 'Stripe' : provider === 'nowpayments' ? 'NowPayments' : provider;
  }

  async function withPending(providers: string[], fn: () => Promise<unknown>) {
    pendingProviders = new Set([...pendingProviders, ...providers]);
    try {
      await fn();
    } catch (e) {
      const msg = e instanceof ApiRequestError ? e.message : 'Failed to update payment provider.';
      addToast({ type: 'error', message: msg });
    } finally {
      pendingProviders = new Set([...pendingProviders].filter((p) => !providers.includes(p)));
    }
  }

  function onToggle(item: PaymentProviderInfo) {
    withPending([item.provider], () =>
      updateMutation.mutateAsync({
        provider: item.provider,
        body: { is_enabled: !item.is_enabled },
      }),
    );
  }

  function move(index: number, direction: -1 | 1) {
    const list = sortedProviders;
    const current = list[index];
    const other = list[index + direction];
    if (!current || !other) return;

    withPending([current.provider, other.provider], async () => {
      await updateMutation.mutateAsync({
        provider: current.provider,
        body: { display_order: other.display_order },
      });
      await updateMutation.mutateAsync({
        provider: other.provider,
        body: { display_order: current.display_order },
      });
    });
  }
</script>

<div class="tab-content">
  {#if providersQuery.isPending}
    <div class="skeleton-list">
      {#each { length: 3 } as _, i (i)}
        <div class="skeleton-row"></div>
      {/each}
    </div>
  {:else if providersQuery.isError}
    <div class="empty-state">
      <AlertCircle size={32} />
      <p>Failed to load payment providers.</p>
      <button class="retry-btn" onclick={() => providersQuery.refetch()}>Retry</button>
    </div>
  {:else if sortedProviders.length === 0}
    <div class="empty-state">
      <Landmark size={32} />
      <p>No payment providers found</p>
    </div>
  {:else}
    <!-- Desktop table -->
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>Provider</th>
            <th>Enabled</th>
            <th>Display Order</th>
            <th>Credentials</th>
            <th>Reorder</th>
          </tr>
        </thead>
        <tbody>
          {#each sortedProviders as item, index (item.provider)}
            <tr>
              <td class="provider-cell">{providerLabel(item.provider)}</td>
              <td>
                <ToggleSwitch
                  checked={item.is_enabled}
                  loading={pendingProviders.has(item.provider)}
                  ontoggle={() => onToggle(item)}
                />
              </td>
              <td class="order-cell">{item.display_order}</td>
              <td>
                {#if !item.credentials_configured}
                  <span class="warning-badge" title="Credentials not configured">
                    <AlertCircle size={13} />
                    Credentials not configured
                  </span>
                {:else}
                  <span class="ok-text">Configured</span>
                {/if}
              </td>
              <td>
                <div class="reorder-actions">
                  <button
                    class="action-btn"
                    aria-label="Move {providerLabel(item.provider)} up"
                    disabled={index === 0 || pendingProviders.has(item.provider)}
                    onclick={() => move(index, -1)}
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    class="action-btn"
                    aria-label="Move {providerLabel(item.provider)} down"
                    disabled={index === sortedProviders.length - 1 ||
                      pendingProviders.has(item.provider)}
                    onclick={() => move(index, 1)}
                  >
                    <ChevronDown size={14} />
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
      {#each sortedProviders as item, index (item.provider)}
        <div class="provider-card">
          <div class="card-header">
            <span class="card-provider">{providerLabel(item.provider)}</span>
            <ToggleSwitch
              checked={item.is_enabled}
              loading={pendingProviders.has(item.provider)}
              ontoggle={() => onToggle(item)}
            />
          </div>
          {#if !item.credentials_configured}
            <span class="warning-badge" title="Credentials not configured">
              <AlertCircle size={13} />
              Credentials not configured
            </span>
          {/if}
          <div class="card-footer">
            <span class="card-order">Order: {item.display_order}</span>
            <div class="reorder-actions">
              <button
                class="action-btn"
                aria-label="Move {providerLabel(item.provider)} up"
                disabled={index === 0 || pendingProviders.has(item.provider)}
                onclick={() => move(index, -1)}
              >
                <ChevronUp size={14} />
              </button>
              <button
                class="action-btn"
                aria-label="Move {providerLabel(item.provider)} down"
                disabled={index === sortedProviders.length - 1 ||
                  pendingProviders.has(item.provider)}
                onclick={() => move(index, 1)}
              >
                <ChevronDown size={14} />
              </button>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .tab-content {
    padding: 16px;
  }
  @media (min-width: 768px) {
    .tab-content {
      padding: 24px;
    }
  }

  .skeleton-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .skeleton-row {
    height: 48px;
    background: var(--apex-surface);
    border-radius: 8px;
    animation: pulse 1.5s ease-in-out infinite;
  }
  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
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

  .table-wrap {
    display: none;
    overflow-x: auto;
  }
  @media (min-width: 768px) {
    .table-wrap {
      display: block;
    }
  }

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

  .provider-cell {
    font-weight: 600;
  }
  .order-cell {
    font-family: monospace;
  }

  .warning-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--apex-warning);
    font-size: 12px;
  }
  .ok-text {
    color: var(--apex-text-dim);
    font-size: 12px;
  }

  .reorder-actions {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 5px;
    border-radius: 6px;
    border: 1px solid var(--apex-border);
    background: transparent;
    color: var(--apex-text-muted);
    cursor: pointer;
    font-family: inherit;
    transition:
      background 0.15s,
      color 0.15s;
  }
  .action-btn:hover:not(:disabled) {
    background: var(--apex-surface-hover);
    color: var(--apex-text);
  }
  .action-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* Mobile card list */
  .card-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  @media (min-width: 768px) {
    .card-list {
      display: none;
    }
  }

  .provider-card {
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
    align-items: center;
    justify-content: space-between;
  }

  .card-provider {
    font-size: 14px;
    font-weight: 700;
    color: var(--apex-text);
  }

  .card-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 4px;
  }

  .card-order {
    font-size: 11px;
    color: var(--apex-text-dim);
    font-family: monospace;
  }
</style>
