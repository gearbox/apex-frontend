<script lang="ts">
  import { X } from 'lucide-svelte';
  import { verifyAge } from '$lib/api/user';
  import { isAtLeast18 } from '$lib/utils/age';
  import { ApiRequestError } from '$lib/api/errors';
  import type { UserProfile } from '$lib/stores/auth';
  import * as m from '$paraglide/messages';

  interface Props {
    onVerified: (profile: UserProfile) => void;
    onClose: () => void;
  }

  let { onVerified, onClose }: Props = $props();

  type Step = 'input' | 'confirm';

  let step = $state<Step>('input');
  let dob = $state('');
  let error = $state('');
  let submitting = $state(false);

  const today = new Date().toISOString().split('T')[0];

  function handleSave() {
    error = '';
    if (!dob) {
      error = m.age_gate_error_dob_missing();
      return;
    }
    if (!isAtLeast18(dob)) {
      error = m.age_gate_error_underage();
      return;
    }
    step = 'confirm';
  }

  async function handleConfirm() {
    error = '';
    submitting = true;
    try {
      const profile = await verifyAge(dob);
      onVerified(profile);
      onClose();
    } catch (e) {
      error = e instanceof ApiRequestError ? e.message : 'Unexpected error. Please try again.';
    } finally {
      submitting = false;
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<div
  class="modal-overlay"
  onclick={handleBackdropClick}
  onkeydown={handleKeydown}
  role="dialog"
  tabindex="-1"
  aria-modal="true"
  aria-label={m.age_gate_title()}
>
  <div class="modal-card">
    <div class="modal-header">
      <h2 class="modal-title">{m.age_gate_title()}</h2>
      <button class="close-btn" onclick={onClose} aria-label={m.common_close()}>
        <X size={18} />
      </button>
    </div>

    <p class="modal-subtitle">{m.age_gate_subtitle()}</p>

    {#if error}
      <p class="error-msg">{error}</p>
    {/if}

    {#if step === 'input'}
      <div class="field">
        <label class="field-label" for="age-dob">{m.age_gate_dob_label()}</label>
        <input id="age-dob" type="date" bind:value={dob} max={today} class="field-input" />
      </div>

      <div class="modal-actions">
        <button class="btn-cancel" onclick={onClose}>{m.age_verify_cancel()}</button>
        <button class="btn-primary" onclick={handleSave}>{m.age_verify_save()}</button>
      </div>
    {:else}
      <div class="review-block">
        <span class="review-label">{m.age_verify_review_dob()}</span>
        <span class="review-value">{dob}</span>
      </div>

      <p class="warning-text">{m.age_verify_permanent_warning()}</p>

      <div class="modal-actions">
        <button
          class="btn-cancel"
          onclick={() => {
            step = 'input';
            error = '';
          }}>{m.age_verify_back()}</button
        >
        <button class="btn-primary" onclick={handleConfirm} disabled={submitting}>
          {submitting ? m.age_verify_confirming() : m.age_verify_confirm()}
        </button>
      </div>
    {/if}
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
  .close-btn:hover {
    background: var(--apex-surface-hover);
  }

  .modal-subtitle {
    font-size: 14px;
    color: var(--apex-text-muted);
    margin: 0;
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
  .field-input:focus {
    border-color: var(--apex-border-active);
  }

  .review-block {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 12px;
    border-radius: 8px;
    background: var(--apex-bg);
    border: 1px solid var(--apex-border);
  }

  .review-label {
    font-size: 11px;
    font-weight: 600;
    color: var(--apex-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .review-value {
    font-size: 15px;
    font-weight: 600;
    color: var(--apex-text);
  }

  .warning-text {
    font-size: 13px;
    color: var(--apex-text-muted);
    margin: 0;
    padding: 10px 12px;
    background: color-mix(in srgb, var(--apex-warning) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--apex-warning) 30%, transparent);
    border-radius: 8px;
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
  .btn-cancel:hover {
    background: var(--apex-surface-hover);
  }

  .btn-primary {
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
  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .btn-primary:not(:disabled):hover {
    opacity: 0.9;
  }
</style>
