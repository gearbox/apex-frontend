<script lang="ts">
  import { useQueryClient, createQuery, createMutation } from '@tanstack/svelte-query';
  import { ShieldCheck, Trash2, AlertCircle, Plus, ChevronDown, ChevronUp } from 'lucide-svelte';
  import {
    adminListQueryOptions,
    auditLogQueryOptions,
    revokeRoleMutationOptions,
    grantRoleMutationOptions,
    grantPermissionMutationOptions,
    revokePermissionMutationOptions,
    type AuditLogFilters,
  } from '$lib/queries/admin';
  import type { AdminRoleResponse, AuditLogEntry } from '$lib/api/admin';
  import { currentUser } from '$lib/stores/auth';
  import { addToast } from '$lib/stores/toasts';
  import { ApiRequestError } from '$lib/api/errors';
  import { formatRelativeTime } from '$lib/utils/format';
  import StatusBadge from '$lib/components/shared/StatusBadge.svelte';
  import ConfirmDeleteModal from '$lib/components/shared/ConfirmDeleteModal.svelte';
  import GrantRoleModal from './GrantRoleModal.svelte';

  const queryClient = useQueryClient();

  // ─── Admin list ───
  const adminsQuery = createQuery(() => adminListQueryOptions());

  // ─── Audit log ───
  let auditFilters = $state<AuditLogFilters>({});
  const auditQuery = createQuery(() => auditLogQueryOptions(auditFilters));

  // ─── Mutations ───
  const revokeMutation = createMutation(() => revokeRoleMutationOptions(queryClient));
  const promoteMutation = createMutation(() => grantRoleMutationOptions(queryClient));
  const grantPermMutation = createMutation(() => grantPermissionMutationOptions(queryClient));
  const revokePermMutation = createMutation(() => revokePermissionMutationOptions(queryClient));

  // ─── Modal state ───
  let showGrantModal = $state(false);
  let pendingRevoke = $state<AdminRoleResponse | null>(null);
  let pendingDemote = $state<AdminRoleResponse | null>(null);

  // ─── Actions ───
  async function handleRevoke() {
    if (!pendingRevoke) return;
    try {
      await revokeMutation.mutateAsync(pendingRevoke.id);
      addToast({ type: 'success', message: `${pendingRevoke.email} revoked from admin.` });
    } catch (e) {
      const msg = e instanceof ApiRequestError && e.message ? e.message : 'Failed to revoke role.';
      addToast({ type: 'error', message: msg });
    } finally {
      pendingRevoke = null;
    }
  }

  async function handleDemote() {
    if (!pendingDemote) return;
    try {
      await promoteMutation.mutateAsync({ userId: pendingDemote.id, role: 'admin' });
      addToast({ type: 'success', message: `${pendingDemote.email} demoted to admin.` });
    } catch (e) {
      const msg = e instanceof ApiRequestError && e.message ? e.message : 'Failed to demote role.';
      addToast({ type: 'error', message: msg });
    } finally {
      pendingDemote = null;
    }
  }

  async function toggleBillingAdjust(admin: AdminRoleResponse) {
    const hasPerm = admin.permissions.includes('billing_adjust');
    try {
      if (hasPerm) {
        await revokePermMutation.mutateAsync({ userId: admin.id, permission: 'billing_adjust' });
        addToast({ type: 'success', message: `billing_adjust revoked from ${admin.email}.` });
      } else {
        await grantPermMutation.mutateAsync({ userId: admin.id, permission: 'billing_adjust' });
        addToast({ type: 'success', message: `billing_adjust granted to ${admin.email}.` });
      }
    } catch (e) {
      const msg = e instanceof ApiRequestError && e.message ? e.message : 'Failed to update permission.';
      addToast({ type: 'error', message: msg });
    }
  }

  function isSelf(admin: AdminRoleResponse): boolean {
    return $currentUser?.id === admin.id;
  }

  function auditActionLabel(action: string): string {
    return action.replace('.', ' ');
  }

  async function handlePromoteToSuperadmin(admin: AdminRoleResponse) {
    try {
      await promoteMutation.mutateAsync({ userId: admin.id, role: 'superadmin' });
      addToast({ type: 'success', message: `${admin.email} promoted to superadmin.` });
    } catch (e) {
      addToast({ type: 'error', message: e instanceof Error ? e.message : 'Failed.' });
    }
  }
</script>

<div class="tab-content">
  <!-- Admins & Permissions section -->
  <div class="section">
    <div class="section-header">
      <h3 class="section-title">
        <ShieldCheck size={16} />
        Admins &amp; Permissions
      </h3>
      <button class="btn-add" onclick={() => (showGrantModal = true)}>
        <Plus size={14} />
        Add Admin
      </button>
    </div>

    {#if adminsQuery.isPending}
      <div class="skeleton-list">
        {#each { length: 3 } as _, i (i)}
          <div class="skeleton-row"></div>
        {/each}
      </div>
    {:else if adminsQuery.isError}
      <div class="empty-state">
        <AlertCircle size={28} />
        <p>Failed to load admin list.</p>
        <button class="retry-btn" onclick={() => adminsQuery.refetch()}>Retry</button>
      </div>
    {:else if adminsQuery.data}
      {@const admins = adminsQuery.data}
      {#if admins.length === 0}
        <div class="empty-state">
          <ShieldCheck size={28} />
          <p>No admins found.</p>
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
                <th>Permissions</th>
                <th>Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {#each admins as admin (admin.id)}
                <tr>
                  <td class="email-cell">{admin.email}</td>
                  <td>{admin.display_name ?? '—'}</td>
                  <td><StatusBadge status={admin.role} /></td>
                  <td class="perms-cell">
                    {#if admin.permissions.length > 0}
                      {#each admin.permissions as perm (perm)}
                        <StatusBadge status={perm} />
                      {/each}
                    {:else}
                      <span class="no-perms">—</span>
                    {/if}
                  </td>
                  <td><StatusBadge status={admin.is_active ? 'active' : 'inactive'} /></td>
                  <td class="actions-cell">
                    {#if admin.role === 'admin'}
                      <!-- Promote to superadmin -->
                      <button
                        class="action-btn promote"
                        onclick={() => handlePromoteToSuperadmin(admin)}
                        title="Promote to Superadmin"
                      >
                        <ChevronUp size={14} /> Promote
                      </button>
                      <!-- Toggle billing_adjust -->
                      <button
                        class="action-btn perm"
                        class:active={admin.permissions.includes('billing_adjust')}
                        onclick={() => toggleBillingAdjust(admin)}
                        title={admin.permissions.includes('billing_adjust') ? 'Revoke billing_adjust' : 'Grant billing_adjust'}
                      >
                        billing_adjust
                      </button>
                    {/if}
                    {#if admin.role === 'superadmin' && !isSelf(admin)}
                      <!-- Demote to admin -->
                      <button
                        class="action-btn demote"
                        onclick={() => (pendingDemote = admin)}
                        title="Demote to Admin"
                      >
                        <ChevronDown size={14} /> Demote
                      </button>
                    {/if}
                    {#if !isSelf(admin)}
                      <button
                        class="action-btn danger"
                        onclick={() => (pendingRevoke = admin)}
                        title="Revoke admin access"
                      >
                        <Trash2 size={13} /> Revoke
                      </button>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <!-- Mobile card list -->
        <div class="card-list">
          {#each admins as admin (admin.id)}
            <div class="admin-card">
              <div class="card-top">
                <div class="card-info">
                  <span class="card-email">{admin.email}</span>
                  <span class="card-name">{admin.display_name ?? ''}</span>
                </div>
                <div class="card-badges">
                  <StatusBadge status={admin.role} />
                  {#each admin.permissions as perm (perm)}
                    <StatusBadge status={perm} />
                  {/each}
                </div>
              </div>
              <div class="card-actions">
                {#if admin.role === 'admin'}
                  <button
                    class="action-btn promote"
                    onclick={() => handlePromoteToSuperadmin(admin)}
                  >
                    Promote
                  </button>
                  <button
                    class="action-btn perm"
                    class:active={admin.permissions.includes('billing_adjust')}
                    onclick={() => toggleBillingAdjust(admin)}
                  >
                    billing_adjust
                  </button>
                {/if}
                {#if admin.role === 'superadmin' && !isSelf(admin)}
                  <button class="action-btn demote" onclick={() => (pendingDemote = admin)}>
                    Demote
                  </button>
                {/if}
                {#if !isSelf(admin)}
                  <button class="action-btn danger" onclick={() => (pendingRevoke = admin)}>
                    Revoke
                  </button>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {/if}
  </div>

  <!-- Audit Log section -->
  <div class="section">
    <div class="section-header">
      <h3 class="section-title">Audit Log</h3>
      {#if adminsQuery.data && adminsQuery.data.length > 0}
        <select
          class="audit-filter"
          onchange={(e) => {
            const val = (e.target as HTMLSelectElement).value;
            auditFilters = val ? { target_user_id: val } : {};
          }}
        >
          <option value="">All users</option>
          {#each adminsQuery.data as admin (admin.id)}
            <option value={admin.id}>{admin.email}</option>
          {/each}
        </select>
      {/if}
    </div>

    {#if auditQuery.isPending}
      <div class="skeleton-list">
        {#each { length: 4 } as _, i (i)}
          <div class="skeleton-row"></div>
        {/each}
      </div>
    {:else if auditQuery.isError}
      <div class="empty-state">
        <AlertCircle size={28} />
        <p>Failed to load audit log.</p>
        <button class="retry-btn" onclick={() => auditQuery.refetch()}>Retry</button>
      </div>
    {:else if auditQuery.data}
      {@const entries = auditQuery.data as AuditLogEntry[]}
      {#if entries.length === 0}
        <div class="empty-state">
          <p>No audit entries.</p>
        </div>
      {:else}
        <ul class="audit-list">
          {#each entries as entry (entry.id)}
            <li class="audit-entry">
              <div class="audit-left">
                <StatusBadge status={auditActionLabel(entry.action)} />
                <StatusBadge status={entry.source} />
              </div>
              <p class="audit-detail">{entry.detail ?? '—'}</p>
              <span class="audit-time">{formatRelativeTime(entry.created_at)}</span>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
  </div>
</div>

{#if showGrantModal}
  <GrantRoleModal {queryClient} onclose={() => (showGrantModal = false)} />
{/if}

{#if pendingRevoke}
  <ConfirmDeleteModal
    title="Revoke Admin Access"
    message="This will permanently remove all admin privileges and permissions from {pendingRevoke.email}."
    confirmLabel="Revoke"
    onconfirm={handleRevoke}
    oncancel={() => (pendingRevoke = null)}
  />
{/if}

{#if pendingDemote}
  <ConfirmDeleteModal
    title="Demote to Admin"
    message="Demote {pendingDemote.email} from superadmin to admin?"
    confirmLabel="Demote"
    onconfirm={handleDemote}
    oncancel={() => (pendingDemote = null)}
  />
{/if}

<style>
  .tab-content {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 32px;
  }

  @media (min-width: 768px) {
    .tab-content {
      padding: 24px;
    }
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 15px;
    font-weight: 700;
    color: var(--apex-text);
    margin: 0;
  }

  .btn-add {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 7px 14px;
    border-radius: 8px;
    border: none;
    background: var(--apex-accent);
    color: white;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: opacity 0.15s;
    flex-shrink: 0;
  }
  .btn-add:hover { opacity: 0.85; }

  /* Skeleton */
  .skeleton-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .skeleton-row {
    height: 44px;
    background: var(--apex-surface);
    border-radius: 8px;
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  /* Empty / error */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 40px 0;
    color: var(--apex-text-dim);
    font-size: 14px;
  }

  .retry-btn {
    padding: 7px 18px;
    border-radius: 8px;
    border: 1px solid var(--apex-border);
    background: transparent;
    color: var(--apex-text-muted);
    font-size: 13px;
    cursor: pointer;
    font-family: inherit;
  }

  /* Desktop table */
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

  .email-cell {
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .perms-cell {
    display: flex;
    gap: 4px;
    align-items: center;
    flex-wrap: wrap;
  }

  .no-perms {
    color: var(--apex-text-dim);
  }

  .actions-cell {
    display: flex;
    gap: 5px;
    align-items: center;
    flex-wrap: wrap;
  }

  /* Mobile cards */
  .card-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  @media (min-width: 768px) {
    .card-list { display: none; }
  }

  .admin-card {
    background: var(--apex-surface);
    border: 1px solid var(--apex-border);
    border-radius: 12px;
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .card-top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }

  .card-info {
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
  }

  .card-badges {
    display: flex;
    gap: 4px;
    align-items: center;
    flex-shrink: 0;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .card-actions {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  /* Action buttons */
  .action-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 5px 10px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    border: 1px solid var(--apex-border);
    background: transparent;
    color: var(--apex-text-muted);
    transition: all 0.12s;
    white-space: nowrap;
  }

  .action-btn:hover:not(:disabled) {
    background: var(--apex-surface-hover);
    color: var(--apex-text);
  }

  .action-btn.promote {
    color: var(--apex-accent);
    border-color: var(--apex-accent-dim);
  }

  .action-btn.demote {
    color: var(--apex-warning);
    border-color: color-mix(in srgb, var(--apex-warning) 40%, transparent);
  }

  .action-btn.danger {
    color: var(--apex-danger);
    border-color: color-mix(in srgb, var(--apex-danger) 40%, transparent);
  }

  .action-btn.perm {
    font-family: monospace;
    font-size: 11px;
  }

  .action-btn.perm.active {
    background: var(--apex-accent-glow);
    color: var(--apex-accent);
    border-color: var(--apex-accent-dim);
  }

  /* Audit log */
  .audit-filter {
    background: var(--apex-surface);
    border: 1px solid var(--apex-border);
    color: var(--apex-text);
    border-radius: 8px;
    padding: 6px 10px;
    font-size: 13px;
    font-family: inherit;
  }

  .audit-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .audit-entry {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 0;
    border-bottom: 1px solid var(--apex-border);
    flex-wrap: wrap;
  }

  .audit-left {
    display: flex;
    gap: 5px;
    align-items: center;
    flex-shrink: 0;
  }

  .audit-detail {
    flex: 1;
    font-size: 13px;
    color: var(--apex-text-muted);
    margin: 0;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .audit-time {
    font-size: 11px;
    color: var(--apex-text-dim);
    flex-shrink: 0;
  }
</style>
