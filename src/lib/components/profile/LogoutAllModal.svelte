<script lang="ts">
  import { createMutation } from '@tanstack/svelte-query';
  import { AlertTriangle, X } from 'lucide-svelte';
  import { goto } from '$app/navigation';
  import { logoutAllMutationOptions } from '$lib/queries/user';
  import { clearAuth } from '$lib/stores/auth';
  import { ApiRequestError } from '$lib/api/errors';
  import * as m from '$paraglide/messages';

  interface Props {
    onclose: () => void;
  }

  let { onclose }: Props = $props();

  let errorMsg = $state('');

  const mutation = createMutation(() => logoutAllMutationOptions());

  async function handleSubmit() {
    errorMsg = '';
    try {
      await mutation.mutateAsync();
      clearAuth();
      goto('/login', { replaceState: true });
    } catch (e) {
      errorMsg = e instanceof ApiRequestError ? e.message : 'Unexpected error. Please try again.';
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onclose();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="modal-overlay"
  onclick={handleBackdropClick}
  role="dialog"
  tabindex="-1"
  aria-modal="true"
  aria-label={m.profile_logout_all_title()}
>
  <div class="modal-card">
    <div class="modal-header">
      <div class="warning-icon">
        <AlertTriangle size={20} />
      </div>
      <h2 class="modal-title">{m.profile_logout_all_title()}</h2>
      <button class="close-btn" onclick={onclose} aria-label="Close">
        <X size={18} />
      </button>
    </div>

    <p class="confirm-text">{m.profile_logout_all_confirm_text()}</p>

    {#if errorMsg}
      <p class="error-msg">{errorMsg}</p>
    {/if}

    <div class="modal-actions">
      <button class="btn-cancel" onclick={onclose}>{m.common_cancel()}</button>
      <button
        class="btn-danger"
        onclick={handleSubmit}
        disabled={mutation.isPending}
      >
        {mutation.isPending ? m.profile_logout_all_submitting() : m.profile_logout_all_submit()}
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
    max-width: 440px;
    width: calc(100% - 32px);
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .modal-header {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .warning-icon {
    display: flex;
    color: var(--apex-warning);
    flex-shrink: 0;
  }

  .modal-title {
    font-size: 17px;
    font-weight: 700;
    color: var(--apex-text);
    margin: 0;
    flex: 1;
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

  .confirm-text {
    font-size: 14px;
    color: var(--apex-text-muted);
    margin: 0;
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

  .btn-danger {
    padding: 9px 20px;
    border-radius: 8px;
    border: none;
    background: var(--apex-danger);
    color: white;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: opacity 0.15s;
  }
  .btn-danger:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
