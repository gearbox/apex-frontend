<script lang="ts">
  import type { QueryClient } from '@tanstack/svelte-query';
  import { createMutation } from '@tanstack/svelte-query';
  import { untrack } from 'svelte';
  import { X } from 'lucide-svelte';
  import { patchAdminUserMutationOptions } from '$lib/queries/admin';
  import { addToast } from '$lib/stores/toasts';
  import type { AdminUserResponse } from '$lib/api/admin';

  interface Props {
    user: AdminUserResponse;
    queryClient: QueryClient;
    onclose: () => void;
  }

  let { user, queryClient, onclose }: Props = $props();

  const isSuperadminUser = untrack(() => user.role === 'superadmin');
  let role = $state(untrack(() => (user.role === 'admin' ? 'admin' : 'user')));
  let subscriptionTier = $state(untrack(() => user.subscription_tier));
  let isActive = $state(untrack(() => user.is_active));
  let errorMsg = $state('');

  const mutation = createMutation(() => patchAdminUserMutationOptions(queryClient));

  async function handleSave() {
    errorMsg = '';
    try {
      await mutation.mutateAsync({
        userId: user.id,
        body: { role, subscription_tier: subscriptionTier, is_active: isActive },
      });
      addToast({ type: 'success', message: `User ${user.email} updated successfully.` });
      onclose();
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : 'Failed to update user.';
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onclose();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="modal-overlay" onclick={handleBackdropClick} role="dialog" tabindex="-1" aria-modal="true" aria-label="Edit user">
  <div class="modal-card">
    <div class="modal-header">
      <h2 class="modal-title">Edit User</h2>
      <button class="close-btn" onclick={onclose} aria-label="Close">
        <X size={18} />
      </button>
    </div>

    <p class="modal-subtitle">{user.email}</p>

    <div class="form-fields">
      <div class="field">
        <label class="field-label" for="edit-role">Role</label>
        <select id="edit-role" class="field-select" bind:value={role} disabled={isSuperadminUser}>
          {#if isSuperadminUser}
            <option value="superadmin">Superadmin</option>
          {:else}
            <option value="user">User</option>
            <option value="admin">Admin</option>
          {/if}
        </select>
      </div>

      <div class="field">
        <label class="field-label" for="edit-tier">Subscription Tier</label>
        <select id="edit-tier" class="field-select" bind:value={subscriptionTier}>
          <option value="free">Free</option>
          <option value="basic">Basic</option>
          <option value="pro">Pro</option>
          <option value="enterprise">Enterprise</option>
        </select>
      </div>

      <div class="field field-row">
        <label class="field-label" for="edit-active">Active</label>
        <input type="checkbox" id="edit-active" bind:checked={isActive} />
      </div>
    </div>

    {#if errorMsg}
      <p class="error-msg">{errorMsg}</p>
    {/if}

    <div class="modal-actions">
      <button class="btn-cancel" onclick={onclose}>Cancel</button>
      <button
        class="btn-save"
        onclick={handleSave}
        disabled={mutation.isPending}
      >
        {mutation.isPending ? 'Saving…' : 'Save'}
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

  .modal-subtitle {
    font-size: 13px;
    color: var(--apex-text-muted);
    margin: 0;
  }

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

  .field-row {
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
  }

  .field-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--apex-text-muted);
  }

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
