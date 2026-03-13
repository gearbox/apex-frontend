<script lang="ts">
  import { createQuery, useQueryClient } from '@tanstack/svelte-query';
  import { Users, Pencil, Wallet, AlertCircle } from 'lucide-svelte';
  import { adminUsersQueryOptions } from '$lib/queries/admin';
  import { fetchUserAccount } from '$lib/api/admin';
  import type { AdminUserResponse } from '$lib/api/admin';
  import { currentUser } from '$lib/stores/auth';
  import Pagination from '$lib/components/shared/Pagination.svelte';
  import StatusBadge from '$lib/components/shared/StatusBadge.svelte';
  import EditUserModal from './EditUserModal.svelte';
  import AccountAdjustModal from './AccountAdjustModal.svelte';

  const PAGE_SIZE = 20;

  let emailSearch = $state('');
  let roleFilter = $state('');
  let activeFilter = $state('');
  let offset = $state(0);
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let debouncedEmail = $state('');

  let editingUser = $state<AdminUserResponse | null>(null);
  let adjustAccountId = $state<string | null>(null);
  let adjustEntityName = $state('');

  function onEmailInput(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    emailSearch = val;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debouncedEmail = val;
      offset = 0;
    }, 400);
  }

  function onRoleChange(e: Event) {
    roleFilter = (e.target as HTMLSelectElement).value;
    offset = 0;
  }

  function onActiveChange(e: Event) {
    activeFilter = (e.target as HTMLSelectElement).value;
    offset = 0;
  }

  const queryClient = useQueryClient();

  const usersQuery = createQuery(() =>
    adminUsersQueryOptions({
      ...(debouncedEmail ? { email: debouncedEmail } : {}),
      ...(roleFilter ? { role: roleFilter } : {}),
      ...(activeFilter !== '' ? { is_active: activeFilter === 'true' } : {}),
      limit: PAGE_SIZE,
      offset,
    }),
  );

  async function openAdjust(user: AdminUserResponse) {
    try {
      const account = await fetchUserAccount(user.id);
      adjustAccountId = account.account_id;
      adjustEntityName = user.email;
    } catch {
      // ignore
    }
  }

  function closeAdjust() {
    adjustAccountId = null;
    adjustEntityName = '';
  }
</script>

<div class="tab-content">
  <!-- Filters -->
  <div class="filters">
    <input
      type="text"
      class="filter-input"
      placeholder="Search by email..."
      value={emailSearch}
      oninput={onEmailInput}
    />
    <select class="filter-select" onchange={onRoleChange}>
      <option value="">All Roles</option>
      <option value="admin">Admin</option>
      <option value="user">User</option>
    </select>
    <select class="filter-select" onchange={onActiveChange}>
      <option value="">All Status</option>
      <option value="true">Active</option>
      <option value="false">Inactive</option>
    </select>
  </div>

  {#if usersQuery.isPending}
    <!-- Skeleton -->
    <div class="skeleton-list">
      {#each { length: 5 } as _, i (i)}
        <div class="skeleton-row"></div>
      {/each}
    </div>
  {:else if usersQuery.isError}
    <div class="empty-state">
      <AlertCircle size={32} />
      <p>Failed to load users.</p>
      <button class="retry-btn" onclick={() => usersQuery.refetch()}>Retry</button>
    </div>
  {:else if usersQuery.data}
    {@const items = usersQuery.data.items}
    {@const total = usersQuery.data.total}

    {#if items.length === 0}
      <div class="empty-state">
        <Users size={32} />
        <p>No users found</p>
      </div>
    {:else}
      <!-- Desktop table -->
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Role</th>
              <th>Tier</th>
              <th>Active</th>
              <th>Verified</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each items as user (user.id)}
              {@const isSelf = $currentUser?.id === user.id}
              <tr>
                <td class="email-cell">{user.email}</td>
                <td>{user.display_name ?? '—'}</td>
                <td><StatusBadge status={user.role} /></td>
                <td><StatusBadge status={user.subscription_tier} /></td>
                <td><StatusBadge status={user.is_active ? 'active' : 'inactive'} /></td>
                <td>{user.email_verified_at ? 'Yes' : 'No'}</td>
                <td class="actions-cell">
                  <button
                    class="icon-btn"
                    onclick={() => !isSelf && (editingUser = user)}
                    disabled={isSelf}
                    title={isSelf ? 'Cannot edit own account' : 'Edit user'}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    class="icon-btn"
                    onclick={() => openAdjust(user)}
                    title="Adjust balance"
                  >
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
        {#each items as user (user.id)}
          {@const isSelf = $currentUser?.id === user.id}
          <div class="user-card">
            <div class="card-main">
              <span class="card-email">{user.email}</span>
              <span class="card-name">{user.display_name ?? ''}</span>
            </div>
            <div class="card-badges">
              <StatusBadge status={user.role} />
              <StatusBadge status={user.subscription_tier} />
              <span class="status-dot" class:active={user.is_active}></span>
            </div>
            <div class="card-actions">
              <button
                class="icon-btn"
                onclick={() => !isSelf && (editingUser = user)}
                disabled={isSelf}
                title={isSelf ? 'Cannot edit own account' : 'Edit'}
              >
                <Pencil size={15} />
              </button>
              <button class="icon-btn" onclick={() => openAdjust(user)} title="Balance">
                <Wallet size={15} />
              </button>
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

{#if editingUser}
  <EditUserModal
    user={editingUser}
    {queryClient}
    onclose={() => (editingUser = null)}
  />
{/if}

{#if adjustAccountId}
  <AccountAdjustModal
    accountId={adjustAccountId}
    entityName={adjustEntityName}
    entityType="user"
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
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 20px;
  }

  @media (min-width: 768px) {
    .filters {
      flex-direction: row;
    }
  }

  .filter-input,
  .filter-select {
    background: var(--apex-surface);
    border: 1px solid var(--apex-border);
    color: var(--apex-text);
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 14px;
    font-family: inherit;
    width: 100%;
  }

  @media (min-width: 768px) {
    .filter-input {
      max-width: 280px;
    }
    .filter-select {
      max-width: 160px;
    }
  }

  /* Skeleton */
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
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  /* Empty / Error */
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

  .email-cell {
    font-size: 13px;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .actions-cell {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  /* Mobile card list */
  .card-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  @media (min-width: 768px) {
    .card-list {
      display: none;
    }
  }

  .user-card {
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

  .card-email {
    font-size: 13px;
    font-weight: 500;
    color: var(--apex-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-name {
    font-size: 12px;
    color: var(--apex-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-badges {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-shrink: 0;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--apex-text-dim);
    flex-shrink: 0;
  }

  .status-dot.active {
    background: var(--apex-success);
  }

  .card-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }

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
  }

  .icon-btn:hover:not(:disabled) {
    background: var(--apex-surface-hover);
    color: var(--apex-text);
  }

  .icon-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
</style>
