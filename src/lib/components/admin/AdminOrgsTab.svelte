<script lang="ts">
  import { createQuery, useQueryClient } from '@tanstack/svelte-query';
  import { Building2, Wallet, AlertCircle } from 'lucide-svelte';
  import { adminOrgsQueryOptions } from '$lib/queries/admin';
  import { fetchOrgAccount } from '$lib/api/admin';
  import type { AdminOrgResponse } from '$lib/api/admin';
  import Pagination from '$lib/components/shared/Pagination.svelte';
  import StatusBadge from '$lib/components/shared/StatusBadge.svelte';
  import AccountAdjustModal from './AccountAdjustModal.svelte';

  const PAGE_SIZE = 20;

  let activeFilter = $state('');
  let offset = $state(0);

  let adjustAccountId = $state<string | null>(null);
  let adjustEntityName = $state('');

  const queryClient = useQueryClient();

  const orgsQuery = createQuery(() =>
    adminOrgsQueryOptions({
      ...(activeFilter !== '' ? { is_active: activeFilter === 'true' } : {}),
      limit: PAGE_SIZE,
      offset,
    }),
  );

  async function openAdjust(org: AdminOrgResponse) {
    try {
      const account = await fetchOrgAccount(org.id);
      adjustAccountId = account.account_id;
      adjustEntityName = org.name;
    } catch {
      // ignore
    }
  }

  function closeAdjust() {
    adjustAccountId = null;
    adjustEntityName = '';
  }

  function formatBalance(balance: number): string {
    return balance.toLocaleString();
  }

  function onActiveChange(e: Event) {
    activeFilter = (e.target as HTMLSelectElement).value;
    offset = 0;
  }
</script>

<div class="tab-content">
  <!-- Filters -->
  <div class="filters">
    <select class="filter-select" onchange={onActiveChange}>
      <option value="">All Status</option>
      <option value="true">Active</option>
      <option value="false">Inactive</option>
    </select>
  </div>

  {#if orgsQuery.isPending}
    <div class="skeleton-list">
      {#each { length: 5 } as _, i (i)}
        <div class="skeleton-row"></div>
      {/each}
    </div>
  {:else if orgsQuery.isError}
    <div class="empty-state">
      <AlertCircle size={32} />
      <p>Failed to load organizations.</p>
      <button class="retry-btn" onclick={() => orgsQuery.refetch()}>Retry</button>
    </div>
  {:else if orgsQuery.data}
    {@const items = orgsQuery.data.items}
    {@const total = orgsQuery.data.total}

    {#if items.length === 0}
      <div class="empty-state">
        <Building2 size={32} />
        <p>No organizations found</p>
      </div>
    {:else}
      <!-- Desktop table -->
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Slug</th>
              <th>Owner ID</th>
              <th>Members</th>
              <th>Token Balance</th>
              <th>Active</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each items as org (org.id)}
              <tr>
                <td class="name-cell">{org.name}</td>
                <td class="mono">{org.slug}</td>
                <td class="mono truncated">{org.owner_id}</td>
                <td>{org.member_count}</td>
                <td class:balance-positive={org.token_balance > 0} class:balance-zero={org.token_balance === 0}>
                  {formatBalance(org.token_balance)}
                </td>
                <td><StatusBadge status={org.is_active ? 'active' : 'inactive'} /></td>
                <td class="date-cell">{new Date(org.created_at).toLocaleDateString()}</td>
                <td>
                  <button class="icon-btn" onclick={() => openAdjust(org)} title="Adjust balance">
                    <Wallet size={15} />
                  </button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <!-- Mobile card list -->
      <div class="card-list">
        {#each items as org (org.id)}
          <div class="org-card">
            <div class="card-main">
              <span class="card-name">{org.name}</span>
              <span class="card-slug">{org.slug}</span>
            </div>
            <div class="card-meta">
              <span class="member-badge">{org.member_count} members</span>
              <span class="balance-badge" class:balance-positive={org.token_balance > 0}>
                {formatBalance(org.token_balance)} tokens
              </span>
              <span class="status-dot" class:active={org.is_active}></span>
            </div>
            <button class="icon-btn" onclick={() => openAdjust(org)} title="Balance">
              <Wallet size={15} />
            </button>
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

{#if adjustAccountId}
  <AccountAdjustModal
    accountId={adjustAccountId}
    entityName={adjustEntityName}
    entityType="org"
    {queryClient}
    onclose={closeAdjust}
  />
{/if}

<style>
  .tab-content {
    padding: 16px;
  }

  @media (min-width: 768px) {
    .tab-content {
      padding: 24px;
    }
  }

  .filters {
    margin-bottom: 20px;
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

  .table-wrap {
    display: none;
    overflow-x: auto;
  }
  @media (min-width: 768px) {
    .table-wrap { display: block; }
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

  .name-cell { font-weight: 500; }
  .mono { font-family: monospace; font-size: 12px; }
  .truncated { max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .date-cell { white-space: nowrap; }

  .balance-positive { color: var(--apex-success); font-weight: 600; }
  .balance-zero { color: var(--apex-text-dim); }

  .card-list { display: flex; flex-direction: column; gap: 10px; }
  @media (min-width: 768px) {
    .card-list { display: none; }
  }

  .org-card {
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
    min-width: 0;
  }

  .card-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--apex-text);
  }

  .card-slug {
    font-size: 11px;
    color: var(--apex-text-muted);
    font-family: monospace;
  }

  .card-meta {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  .member-badge {
    font-size: 11px;
    color: var(--apex-text-muted);
    background: var(--apex-surface-hover);
    padding: 2px 8px;
    border-radius: 99px;
  }

  .balance-badge {
    font-size: 11px;
    color: var(--apex-text-dim);
    background: var(--apex-surface-hover);
    padding: 2px 8px;
    border-radius: 99px;
  }

  .balance-badge.balance-positive {
    color: var(--apex-success);
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--apex-text-dim);
    flex-shrink: 0;
  }
  .status-dot.active { background: var(--apex-success); }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 6px;
    border: 1px solid var(--apex-border);
    background: transparent;
    color: var(--apex-text-muted);
    cursor: pointer;
    transition: all 0.15s;
    flex-shrink: 0;
  }
  .icon-btn:hover {
    background: var(--apex-surface-hover);
    color: var(--apex-text);
  }
</style>
