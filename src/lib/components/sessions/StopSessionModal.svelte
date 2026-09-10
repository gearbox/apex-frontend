<script lang="ts">
  import { onMount } from 'svelte';
  import { createMutation, useQueryClient } from '@tanstack/svelte-query';
  import { AlertTriangle } from '@lucide/svelte';
  import { createDialogController } from '$lib/components/shared/dialogController.svelte';
  import { isRequestCancellation } from '$lib/api/client';
  import type { GpuSessionResponse, StopConfirmationResponse } from '$lib/api/sessions';
  import { ApiRequestError } from '$lib/api/errors';
  import { stopPreviewMutationOptions, confirmedStopMutationOptions } from '$lib/queries/sessions';
  import * as m from '$paraglide/messages';

  interface Props {
    sessionId: string;
    onStopped: (session: GpuSessionResponse) => void;
    onClose: () => void;
  }

  let { sessionId, onStopped, onClose }: Props = $props();
  const queryClient = useQueryClient();

  let preview = $state<StopConfirmationResponse | null>(null);
  let loadError = $state('');
  let confirmError = $state('');
  // TanStack mutation state updates are flushed on a scheduled microtask, not synchronously with
  // `.mutate()`. A plain local latch — set the instant the action starts — is what actually gates
  // the confirm button against a same-tick double click; `confirmMutation.isPending` alone lags by
  // a tick and would let a second click slip through.
  let confirming = $state(false);
  let cancelButton = $state<HTMLButtonElement>();

  const previewMutation = createMutation(() => stopPreviewMutationOptions());
  const confirmMutation = createMutation(() => confirmedStopMutationOptions(queryClient));

  const dialogController = createDialogController({
    canClose: () => !confirming,
    initialFocus: () => cancelButton,
    onClose: () => onClose(),
  });

  function formatActiveDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const min = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}h ${min.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
  }

  onMount(() => {
    const closeDialog = dialogController.open();
    previewMutation.mutate(sessionId, {
      onSuccess: (data) => {
        preview = data;
      },
      onError: (error) => {
        if (isRequestCancellation(error)) return;
        loadError = error instanceof ApiRequestError ? error.message : m.session_stop_load_failed();
      },
    });
    return closeDialog;
  });

  function handleConfirm(): void {
    if (confirming) return;
    confirming = true;
    confirmError = '';
    confirmMutation.mutate(sessionId, {
      onSuccess: (session) => {
        confirming = false;
        onStopped(session);
      },
      onError: (error) => {
        confirming = false;
        if (isRequestCancellation(error)) return;
        confirmError =
          error instanceof ApiRequestError ? error.message : m.session_stop_confirm_failed();
      },
    });
  }
</script>

<dialog
  bind:this={dialogController.dialog}
  class="modal-card"
  onclick={dialogController.handleBackdropClick}
  oncancel={dialogController.handleCancel}
  aria-labelledby="stop-session-title"
>
  <div class="modal-header">
    <div class="warning-icon"><AlertTriangle size={20} /></div>
    <h2 id="stop-session-title" class="modal-title">{m.session_stop_title()}</h2>
  </div>

  {#if !preview && !loadError}
    <p class="modal-message">{m.common_loading()}</p>
  {:else if loadError}
    <p class="modal-error">{loadError}</p>
    <div class="modal-actions">
      <button bind:this={cancelButton} class="btn-cancel" onclick={dialogController.requestClose}
        >{m.common_close()}</button
      >
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
          <span class="preview-label">{m.session_stop_preview_gpu()}</span>
          <span class="preview-value">{preview.vastai_gpu_name}</span>
        </div>
      {/if}
    </div>

    {#if confirmError}
      <p class="modal-error">{confirmError}</p>
    {/if}

    <div class="modal-actions">
      <button
        bind:this={cancelButton}
        class="btn-cancel"
        onclick={dialogController.requestClose}
        disabled={confirming}
      >
        {m.session_stop_cancel()}
      </button>
      <button class="btn-confirm" onclick={handleConfirm} disabled={confirming}>
        {confirming ? m.session_stopping() : m.session_stop_confirm()}
      </button>
    </div>
  {/if}
</dialog>

<style>
  .modal-card {
    background: var(--apex-surface);
    border-radius: 16px;
    max-width: 400px;
    width: min(400px, calc(100% - 32px));
    margin: auto;
    padding: 24px;
    border: 0;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .modal-card::backdrop {
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
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
