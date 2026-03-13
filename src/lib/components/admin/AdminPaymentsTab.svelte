<script lang="ts">
  import { createQuery } from '@tanstack/svelte-query';
  import { CreditCard, AlertCircle } from 'lucide-svelte';
  import { adminPaymentsQueryOptions } from '$lib/queries/admin';
  import Pagination from '$lib/components/shared/Pagination.svelte';
  import StatusBadge from '$lib/components/shared/StatusBadge.svelte';

  const PAGE_SIZE = 20;

  let statusFilter = $state('');
  let providerFilter = $state('');
  let offset = $state(0);

  const paymentsQuery = createQuery(() =>
    adminPaymentsQueryOptions({
      ...(statusFilter ? { status: statusFilter } : {}),
      ...(providerFilter ? { payment_provider: providerFilter } : {}),
      limit: PAGE_SIZE,
      offset,
    }),
  );

  function formatAmount(amount: string): string {
    return `$${parseFloat(amount).toFixed(2)}`;
  }

  function formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString();
  }

  function truncateId(id: string): string {
    return id.slice(0, 8) + '…';
  }

  function onStatusChange(e: Event) {
    statusFilter = (e.target as HTMLSelectElement).value;
    offset = 0;
  }

  function onProviderChange(e: Event) {
    providerFilter = (e.target as HTMLSelectElement).value;
    offset = 0;
  }
</script>

<div class="tab-content">
  <!-- Filters -->
  <div class="filters">
    <select class="filter-select" onchange={onStatusChange}>
      <option value="">All Status</option>
      <option value="pending">Pending</option>
      <option value="completed">Completed</option>
      <option value="failed">Failed</option>
      <option value="refunded">Refunded</option>
    </select>
    <select class="filter-select" onchange={onProviderChange}>
      <option value="">All Providers</option>
      <option value="stripe">Stripe</option>
      <option value="nowpayments">NowPayments</option>
    </select>
  </div>

  {#if paymentsQuery.isPending}
    <div class="skeleton-list">
      {#each { length: 5 } as _, i (i)}
        <div class="skeleton-row"></div>
      {/each}
    </div>
  {:else if paymentsQuery.isError}
    <div class="empty-state">
      <AlertCircle size={32} />
      <p>Failed to load payments.</p>
      <button class="retry-btn" onclick={() => paymentsQuery.refetch()}>Retry</button>
    </div>
  {:else if paymentsQuery.data}
    {@const items = paymentsQuery.data.items}
    {@const total = paymentsQuery.data.total}

    {#if items.length === 0}
      <div class="empty-state">
        <CreditCard size={32} />
        <p>No payments found</p>
      </div>
    {:else}
      <!-- Desktop table -->
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Provider</th>
              <th>Amount</th>
              <th>Tokens</th>
              <th>Status</th>
              <th>Created</th>
              <th>Completed</th>
            </tr>
          </thead>
          <tbody>
            {#each items as payment (payment.id)}
              <tr>
                <td class="mono">{truncateId(payment.id)}</td>
                <td>{payment.payment_provider}</td>
                <td class="amount-cell">{formatAmount(payment.amount_usd)}</td>
                <td>{payment.tokens_granted.toLocaleString()}</td>
                <td><StatusBadge status={payment.status} /></td>
                <td class="date-cell">{formatDate(payment.created_at)}</td>
                <td class="date-cell">{formatDate(payment.completed_at)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <!-- Mobile card list -->
      <div class="card-list">
        {#each items as payment (payment.id)}
          <div class="payment-card">
            <div class="card-main">
              <span class="card-amount">{formatAmount(payment.amount_usd)}</span>
              <span class="card-meta-row">
                <StatusBadge status={payment.payment_provider} />
                <StatusBadge status={payment.status} />
              </span>
            </div>
            <div class="card-right">
              <span class="card-tokens">{payment.tokens_granted.toLocaleString()} tokens</span>
              <span class="card-date">{formatDate(payment.created_at)}</span>
            </div>
          </div>
        {/each}
      </div>

      <Pagination
        {total}
        limit={PAGE_SIZE}
        {offset}
        onpagechange={(newOffset) => (offset = newOffset)}
      />
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
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 20px;
  }
  @media (min-width: 768px) {
    .filters { flex-direction: row; }
  }

  .filter-select {
    background: var(--apex-surface);
    border: 1px solid var(--apex-border);
    color: var(--apex-text);
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 14px;
    font-family: inherit;
    width: 100%;
    max-width: 200px;
  }

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

  .mono { font-family: monospace; font-size: 12px; }
  .date-cell { white-space: nowrap; font-size: 12px; }
  .amount-cell { font-weight: 600; }

  .card-list { display: flex; flex-direction: column; gap: 10px; }
  @media (min-width: 768px) { .card-list { display: none; } }

  .payment-card {
    background: var(--apex-surface);
    border: 1px solid var(--apex-border);
    border-radius: 12px;
    padding: 14px 16px;
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .card-main {
    display: flex;
    flex-direction: column;
    flex: 1;
    gap: 4px;
  }

  .card-amount {
    font-size: 16px;
    font-weight: 700;
    color: var(--apex-text);
  }

  .card-meta-row {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
  }

  .card-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
    flex-shrink: 0;
  }

  .card-tokens {
    font-size: 12px;
    color: var(--apex-text-muted);
  }

  .card-date {
    font-size: 11px;
    color: var(--apex-text-dim);
  }
</style>
