<script lang="ts">
  import type { QueryClient } from '@tanstack/svelte-query';
  import { createQuery, createMutation } from '@tanstack/svelte-query';
  import { X } from 'lucide-svelte';
  import { adminUsersQueryOptions, grantRoleMutationOptions } from '$lib/queries/admin';
  import { addToast } from '$lib/stores/toasts';
  import { ApiRequestError } from '$lib/api/errors';
  import StatusBadge from '$lib/components/shared/StatusBadge.svelte';

  interface Props {
    queryClient: QueryClient;
    onclose: () => void;
  }

  let { queryClient, onclose }: Props = $props();

  let searchInput = $state('');
  let debouncedSearch = $state('');
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let selectedUserId = $state('');
  let selectedEmail = $state('');
  let selectedRole = $state<'admin' | 'superadmin'>('admin');
  let errorMsg = $state('');

  function onSearchInput(e: Event) {
    const val = (e.target as HTMLInputElement).value;
    searchInput = val;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debouncedSearch = val;
      selectedUserId = '';
      selectedEmail = '';
    }, 400);
  }

  const searchQuery = createQuery(() =>
    adminUsersQueryOptions(
      debouncedSearch.length >= 2
        ? { email: debouncedSearch, limit: 5 }
        : { limit: 0 },
    ),
  );

  const grantMutation = createMutation(() => grantRoleMutationOptions(queryClient));

  async function handleConfirm() {
    if (!selectedUserId) return;
    errorMsg = '';
    try {
      await grantMutation.mutateAsync({ userId: selectedUserId, role: selectedRole });
      addToast({ type: 'success', message: `${selectedEmail} promoted to ${selectedRole}.` });
      onclose();
    } catch (e) {
      if (e instanceof ApiRequestError && e.status_code === 403) {
        errorMsg = 'Cannot modify your own role.';
      } else if (e instanceof ApiRequestError && e.status_code === 404) {
        errorMsg = 'User not found.';
      } else {
        errorMsg = e instanceof Error ? e.message : 'Failed to grant role.';
      }
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onclose();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="modal-overlay" onclick={handleBackdropClick} role="dialog" tabindex="-1" aria-modal="true" aria-label="Grant admin role">
  <div class="modal-card">
    <div class="modal-header">
      <h2 class="modal-title">Add Admin</h2>
      <button class="close-btn" onclick={onclose} aria-label="Close"><X size={18} /></button>
    </div>

    <div class="form-fields">
      <div class="field">
        <label class="field-label" for="grant-search">Search user by email</label>
        <input
          id="grant-search"
          type="text"
          class="field-input"
          placeholder="user@example.com"
          value={searchInput}
          oninput={onSearchInput}
          autocomplete="off"
        />
      </div>

      {#if debouncedSearch.length >= 2}
        {#if searchQuery.isPending}
          <div class="search-hint">Searching…</div>
        {:else if searchQuery.isError}
          <div class="search-hint error">Failed to search users.</div>
        {:else if searchQuery.data}
          {@const results = searchQuery.data.items}
          {#if results.length === 0}
            <div class="search-hint">No users found.</div>
          {:else}
            <ul class="results-list">
              {#each results as u (u.id)}
                {@const alreadyAdmin = u.role === 'admin' || u.role === 'superadmin'}
                <li>
                  <button
                    class="result-row"
                    class:selected={selectedUserId === u.id}
                    class:dimmed={alreadyAdmin}
                    disabled={alreadyAdmin}
                    onclick={() => { selectedUserId = u.id; selectedEmail = u.email; }}
                  >
                    <span class="result-email">{u.email}</span>
                    <StatusBadge status={u.role} />
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        {/if}
      {/if}

      <div class="field">
        <label class="field-label" for="grant-role">Role to grant</label>
        <select id="grant-role" class="field-select" bind:value={selectedRole}>
          <option value="admin">Admin</option>
          <option value="superadmin">Superadmin</option>
        </select>
      </div>
    </div>

    {#if errorMsg}
      <p class="error-msg">{errorMsg}</p>
    {/if}

    <div class="modal-actions">
      <button class="btn-cancel" onclick={onclose}>Cancel</button>
      <button
        class="btn-save"
        onclick={handleConfirm}
        disabled={!selectedUserId || grantMutation.isPending}
      >
        {grantMutation.isPending ? 'Granting…' : 'Grant Role'}
      </button>
    </div>
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    z-index: 200;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }

  .modal-card {
    background: var(--apex-surface);
    border-radius: 16px;
    max-width: 480px;
    width: calc(100% - 32px);
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .modal-title {
    font-size: 17px;
    font-weight: 700;
    color: var(--apex-text);
    margin: 0;
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: none;
    background: transparent;
    color: var(--apex-text-muted);
    cursor: pointer;
  }
  .close-btn:hover { background: var(--apex-surface-hover); }

  .form-fields {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--apex-text-muted);
  }

  .field-input,
  .field-select {
    background: var(--apex-bg);
    border: 1px solid var(--apex-border);
    color: var(--apex-text);
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 14px;
    font-family: inherit;
    width: 100%;
  }

  .search-hint {
    font-size: 13px;
    color: var(--apex-text-dim);
    padding: 4px 0;
  }

  .search-hint.error {
    color: var(--apex-danger);
  }

  .results-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 200px;
    overflow-y: auto;
  }

  .result-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 8px 12px;
    border-radius: 8px;
    border: 1px solid var(--apex-border);
    background: transparent;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.12s;
    gap: 8px;
  }

  .result-row:hover:not(:disabled) {
    background: var(--apex-surface-hover);
  }

  .result-row.selected {
    border-color: var(--apex-accent);
    background: var(--apex-accent-glow);
  }

  .result-row.dimmed {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .result-email {
    font-size: 13px;
    color: var(--apex-text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    text-align: left;
  }

  .error-msg {
    font-size: 13px;
    color: var(--apex-danger);
    margin: 0;
    padding: 8px 12px;
    background: color-mix(in srgb, var(--apex-danger) 10%, transparent);
    border-radius: 8px;
  }

  .modal-actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
  }

  .btn-cancel {
    padding: 9px 18px;
    border-radius: 8px;
    border: 1px solid var(--apex-border);
    background: transparent;
    color: var(--apex-text-muted);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: all 0.15s;
  }
  .btn-cancel:hover { background: var(--apex-surface-hover); }

  .btn-save {
    padding: 9px 20px;
    border-radius: 8px;
    border: none;
    background: var(--apex-accent);
    color: white;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: opacity 0.15s;
  }
  .btn-save:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
