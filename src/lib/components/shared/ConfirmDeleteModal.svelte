<script lang="ts">
  import { AlertTriangle } from 'lucide-svelte';
  import * as m from '$paraglide/messages';

  interface Props {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    isPending?: boolean;
    onconfirm: () => void;
    oncancel: () => void;
  }

  let {
    title,
    message,
    confirmLabel,
    cancelLabel,
    isPending = false,
    onconfirm,
    oncancel,
  }: Props = $props();

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) oncancel();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') oncancel();
  }
</script>

<div
  class="modal-overlay"
  onclick={handleBackdropClick}
  onkeydown={handleKeydown}
  role="dialog"
  tabindex="-1"
  aria-modal="true"
  aria-label={title}
>
  <div class="modal-card">
    <div class="modal-header">
      <div class="warning-icon">
        <AlertTriangle size={20} />
      </div>
      <h2 class="modal-title">{title}</h2>
    </div>

    <p class="modal-message">{message}</p>

    <div class="modal-actions">
      <button class="btn-cancel" onclick={oncancel} disabled={isPending}>
        {cancelLabel ?? m.common_cancel()}
      </button>
      <button class="btn-delete" onclick={onconfirm} disabled={isPending}>
        {isPending ? '…' : (confirmLabel ?? m.common_delete())}
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
    max-width: 400px;
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
    color: var(--apex-danger);
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
    line-height: 1.5;
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

  .btn-delete {
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
  .btn-delete:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
