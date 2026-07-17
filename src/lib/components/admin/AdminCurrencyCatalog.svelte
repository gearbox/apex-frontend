<script lang="ts">
  import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';
  import { AlertCircle, RefreshCw } from 'lucide-svelte';
  import * as m from '$paraglide/messages';
  import { ApiRequestError } from '$lib/api/errors';
  import {
    adminPaymentCurrenciesQueryOptions,
    refreshAdminPaymentCurrenciesMutationOptions,
  } from '$lib/queries/admin';
  import type { SyncResult } from '$lib/api/admin';

  const queryClient = useQueryClient();
  const currenciesQuery = createQuery(() => adminPaymentCurrenciesQueryOptions());
  const refreshMutation = createMutation(() =>
    refreshAdminPaymentCurrenciesMutationOptions(queryClient),
  );

  let syncResults = $state<SyncResult[] | null>(null);
  let refreshError = $state('');

  function formatDate(value: string | null): string {
    return value ? new Date(value).toLocaleString() : '—';
  }

  async function refresh(): Promise<void> {
    refreshError = '';
    try {
      syncResults = await refreshMutation.mutateAsync();
    } catch (error) {
      const detail = error instanceof ApiRequestError ? error.message : '';
      refreshError = detail
        ? `${m.admin_currency_refresh_failed()} ${detail}`
        : m.admin_currency_refresh_failed();
    }
  }
</script>

<section class="catalog" aria-labelledby="currency-catalog-heading">
  <div class="catalog-header">
    <div>
      <h2 id="currency-catalog-heading">{m.admin_currency_catalog_title()}</h2>
      <p>{m.admin_currency_catalog_workflow()}</p>
    </div>
    <button
      type="button"
      class="refresh-btn"
      disabled={refreshMutation.isPending}
      onclick={() => void refresh()}
    >
      <span class:spinning={refreshMutation.isPending}><RefreshCw size={15} /></span>
      {refreshMutation.isPending ? m.admin_currency_refreshing() : m.admin_currency_refresh()}
    </button>
  </div>

  {#if syncResults}
    <div class="sync-results" role="status">
      {#each syncResults as result (String(result.provider))}
        <p>
          {m.admin_currency_sync_counts({
            provider: String(result.provider),
            upserted: result.upserted,
            deactivated: result.deactivated,
          })}
        </p>
      {/each}
    </div>
  {/if}

  {#if refreshError}
    <p class="refresh-error" role="status">{refreshError}</p>
  {/if}

  {#if currenciesQuery.isPending}
    <div class="skeleton"></div>
  {:else if currenciesQuery.isError && !currenciesQuery.data}
    <div class="empty-state">
      <AlertCircle size={28} />
      <p>{m.admin_currency_load_error()}</p>
      <button type="button" class="retry-btn" onclick={() => currenciesQuery.refetch()}
        >{m.common_retry()}</button
      >
    </div>
  {:else}
    {@const rows = currenciesQuery.data ?? []}
    {#if rows.length === 0}
      <div class="empty-state"><p>{m.admin_currency_empty()}</p></div>
    {:else}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{m.admin_currency_ticker()}</th>
              <th>{m.admin_currency_name()}</th>
              <th>{m.admin_currency_network()}</th>
              <th>{m.admin_currency_provider()}</th>
              <th>{m.admin_currency_availability()}</th>
              <th>{m.admin_currency_last_seen()}</th>
              <th>{m.admin_currency_logo_sync()}</th>
            </tr>
          </thead>
          <tbody>
            {#each rows as currency (currency.ticker + String(currency.provider))}
              <tr class:inactive={!currency.is_available}>
                <td class="mono">{currency.ticker}</td>
                <td>{currency.name ?? currency.ticker}</td>
                <td>{currency.network ?? '—'}</td>
                <td>{String(currency.provider)}</td>
                <td>
                  <span class:available={currency.is_available} class="availability">
                    {currency.is_available
                      ? m.admin_currency_available()
                      : m.admin_currency_inactive()}
                  </span>
                </td>
                <td>{formatDate(currency.last_seen_at)}</td>
                <td>{formatDate(currency.logo_synced_at)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  {/if}
</section>

<style>
  .catalog {
    border-top: 1px solid var(--apex-border);
    margin-top: 24px;
    padding: 24px 16px 16px;
  }
  @media (min-width: 768px) {
    .catalog {
      padding: 24px;
    }
  }
  .catalog-header {
    align-items: flex-start;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    justify-content: space-between;
    margin-bottom: 16px;
  }
  h2 {
    color: var(--apex-text);
    font-size: 16px;
    margin: 0;
  }
  .catalog-header p {
    color: var(--apex-text-dim);
    font-size: 12px;
    margin: 5px 0 0;
    max-width: 580px;
  }
  .refresh-btn,
  .retry-btn {
    align-items: center;
    background: transparent;
    border: 1px solid var(--apex-border);
    border-radius: 8px;
    color: var(--apex-text);
    cursor: pointer;
    display: inline-flex;
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    gap: 6px;
    padding: 8px 10px;
  }
  .refresh-btn:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
  .spinning {
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .sync-results,
  .refresh-error {
    border-radius: 8px;
    font-size: 12px;
    margin: 0 0 12px;
    padding: 9px 10px;
  }
  .sync-results {
    background: color-mix(in srgb, var(--apex-success) 10%, transparent);
    color: var(--apex-text);
  }
  .sync-results p {
    margin: 0;
  }
  .refresh-error {
    background: color-mix(in srgb, var(--apex-warning) 10%, transparent);
    color: var(--apex-text);
  }
  .skeleton {
    animation: pulse 1.5s ease-in-out infinite;
    background: var(--apex-surface);
    border-radius: 8px;
    height: 110px;
  }
  @keyframes pulse {
    50% {
      opacity: 0.5;
    }
  }
  .empty-state {
    align-items: center;
    color: var(--apex-text-dim);
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 28px 0;
  }
  .table-wrap {
    overflow-x: auto;
  }
  table {
    border-collapse: collapse;
    font-size: 12px;
    min-width: 760px;
    width: 100%;
  }
  th,
  td {
    border-bottom: 1px solid var(--apex-border);
    padding: 9px 10px;
    text-align: left;
  }
  th {
    color: var(--apex-text-muted);
    font-size: 10px;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  td {
    color: var(--apex-text);
  }
  tr.inactive td {
    color: var(--apex-text-dim);
    opacity: 0.62;
  }
  .mono {
    font-family: monospace;
  }
  .availability {
    color: var(--apex-text-dim);
  }
  .availability.available {
    color: var(--apex-success);
  }
</style>
