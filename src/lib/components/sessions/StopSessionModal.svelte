<script lang="ts">
  import { onMount } from 'svelte';
  import { AlertTriangle } from 'lucide-svelte';
  import { previewStop, stopSession } from '$lib/api/sessions';
  import type { StopConfirmationResponse } from '$lib/api/sessions';
  import { ApiRequestError } from '$lib/api/errors';
  import * as m from '$paraglide/messages';

  interface Props {
    sessionId: string;
    onStopped: () => void;
    onClose: () => void;
  }

  let { sessionId, onStopped, onClose }: Props = $props();

  let preview = $state<StopConfirmationResponse | null>(null);
  let loadError = $state('');
  let loading = $state(true);
  let confirming = $state(false);
  let confirmError = $state('');

  function formatActiveDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const min = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}h ${min.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
  }

  onMount(async () => {
    try {
      preview = await previewStop(sessionId);
    } catch (e) {
      loadError = e instanceof ApiRequestError ? e.message : 'Failed to load session info.';
    } finally {
      loading = false;
    }
  });

  async function handleConfirm() {
    if (confirming) return;
    confirming = true;
    confirmError = '';
    try {
      await stopSession(sessionId);
      onStopped();
    } catch (e) {
      confirmError = e instanceof ApiRequestError ? e.message : 'Failed to stop session.';
    } finally {
      confirming = false;
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
  aria-label={m.session_stop_title()}
>
  <div class="modal-card">
    <div class="modal-header">
      <div class="warning-icon"><AlertTriangle size={20} /></div>
      <h2 class="modal-title">{m.session_stop_title()}</h2>
    </div>

    {#if loading}
      <p class="modal-message">{m.common_loading()}</p>
    {:else if loadError}
      <p class="modal-error">{loadError}</p>
      <div class="modal-actions">
        <button class="btn-cancel" onclick={onClose}>{m.common_close()}</button>
      </div>
    {:else if preview}
      <div class="preview-details">
        <div class="preview-row">
          <span class="preview-label">{m.session_stop_preview_tokens()}</span>
          <span class="preview-value">{preview.estimated_final_tokens.toLocaleString()}</span>
        </div>
        <div class="preview-row">
          <span class="preview-label">{m.session_stop_preview_duration()}</span>
          <span class="preview-value">{formatActiveDuration(preview.active_duration_seconds)}</span>
        </div>
        {#if preview.vastai_gpu_name}
          <div class="preview-row">
            <span class="preview-label">GPU</span>
            <span class="preview-value">{preview.vastai_gpu_name}</span>
          </div>
        {/if}
      </div>

      {#if confirmError}
        <p class="modal-error">{confirmError}</p>
      {/if}

      <div class="modal-actions">
        <button class="btn-cancel" onclick={onClose} disabled={confirming}>
          {m.session_stop_cancel()}
        </button>
        <button class="btn-confirm" onclick={handleConfirm} disabled={confirming}>
          {confirming ? m.session_stopping() : m.session_stop_confirm()}
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
    max-width: 400px;
    width: calc(100% - 32px);
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
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

  .modal-message {
    font-size: 14px;
    color: var(--apex-text-muted);
    margin: 0;
  }

  .modal-error {
    font-size: 13px;
    color: var(--apex-danger);
    margin: 0;
  }

  .preview-details {
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: var(--apex-bg);
    border-radius: 10px;
    padding: 14px;
  }

  .preview-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 12px;
  }

  .preview-label {
    font-size: 12px;
    color: var(--apex-text-muted);
  }

  .preview-value {
    font-size: 13px;
    font-weight: 600;
    color: var(--apex-text);
    font-variant-numeric: tabular-nums;
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

  .btn-cancel:hover:not(:disabled) {
    background: var(--apex-surface-hover);
  }

  .btn-cancel:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-confirm {
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

  .btn-confirm:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
