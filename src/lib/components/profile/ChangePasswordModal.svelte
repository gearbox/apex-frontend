<script lang="ts">
  import { createMutation } from '@tanstack/svelte-query';
  import { X } from 'lucide-svelte';
  import { changePasswordMutationOptions } from '$lib/queries/user';
  import { addToast } from '$lib/stores/toasts';
  import { ApiRequestError } from '$lib/api/errors';
  import * as m from '$paraglide/messages';

  interface Props {
    onclose: () => void;
  }

  let { onclose }: Props = $props();

  let currentPassword = $state('');
  let newPassword = $state('');
  let confirmPassword = $state('');
  let errorMsg = $state('');

  const mutation = createMutation(() => changePasswordMutationOptions());

  const passwordTooShort = $derived(newPassword.length > 0 && newPassword.length < 8);
  const passwordMismatch = $derived(confirmPassword.length > 0 && newPassword !== confirmPassword);
  const canSubmit = $derived(
    currentPassword.length > 0 &&
      newPassword.length >= 8 &&
      newPassword === confirmPassword &&
      !mutation.isPending,
  );

  async function handleSubmit(e: Event) {
    e.preventDefault();
    errorMsg = '';
    try {
      await mutation.mutateAsync({ current_password: currentPassword, new_password: newPassword });
      addToast({ type: 'success', message: m.profile_change_password_success() });
      onclose();
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
  aria-label={m.profile_change_password_title()}
>
  <div class="modal-card">
    <div class="modal-header">
      <h2 class="modal-title">{m.profile_change_password_title()}</h2>
      <button class="close-btn" onclick={onclose} aria-label="Close">
        <X size={18} />
      </button>
    </div>

    <form onsubmit={handleSubmit}>
      <div class="form-fields">
        <div class="field">
          <label class="field-label" for="current-password">{m.profile_change_password_current()}</label>
          <input
            id="current-password"
            type="password"
            class="field-input"
            bind:value={currentPassword}
            autocomplete="current-password"
          />
        </div>

        <div class="field">
          <label class="field-label" for="new-password">{m.profile_change_password_new()}</label>
          <input
            id="new-password"
            type="password"
            class="field-input"
            class:field-input--error={passwordTooShort}
            bind:value={newPassword}
            autocomplete="new-password"
          />
          {#if passwordTooShort}
            <p class="field-error">{m.profile_change_password_too_short()}</p>
          {/if}
        </div>

        <div class="field">
          <label class="field-label" for="confirm-password">{m.profile_change_password_confirm()}</label>
          <input
            id="confirm-password"
            type="password"
            class="field-input"
            class:field-input--error={passwordMismatch}
            bind:value={confirmPassword}
            autocomplete="new-password"
          />
          {#if passwordMismatch}
            <p class="field-error">{m.profile_change_password_mismatch()}</p>
          {/if}
        </div>
      </div>

      {#if errorMsg}
        <p class="error-msg">{errorMsg}</p>
      {/if}

      <div class="modal-actions">
        <button type="button" class="btn-cancel" onclick={onclose}>{m.common_cancel()}</button>
        <button type="submit" class="btn-submit" disabled={!canSubmit}>
          {mutation.isPending ? m.profile_change_password_updating() : m.profile_change_password_submit()}
        </button>
      </div>
    </form>
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
    gap: 20px;
  }

  .modal-header {
    display: flex;
    align-items: center;
    gap: 10px;
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
    font-size: 12px;
    font-weight: 600;
    color: var(--apex-text-muted);
  }

  .field-input {
    padding: 9px 12px;
    border-radius: 8px;
    border: 1px solid var(--apex-border);
    background: var(--apex-bg);
    color: var(--apex-text);
    font-size: 14px;
    font-family: inherit;
    outline: none;
    transition: border-color 0.15s;
  }
  .field-input:focus { border-color: var(--apex-border-active); }
  .field-input--error { border-color: var(--apex-danger); }

  .field-error {
    font-size: 12px;
    color: var(--apex-danger);
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

  .btn-submit {
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
  .btn-submit:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
