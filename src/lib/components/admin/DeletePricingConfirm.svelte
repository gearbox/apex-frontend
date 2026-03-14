<script lang="ts">
  import type { QueryClient } from '@tanstack/svelte-query';
  import { createMutation } from '@tanstack/svelte-query';
  import { AlertTriangle, X } from 'lucide-svelte';
  import { deletePricingRuleMutationOptions } from '$lib/queries/admin';
  import { addToast } from '$lib/stores/toasts';
  import type { PricingRuleResponse } from '$lib/api/admin';
  import { ApiRequestError } from '$lib/api/errors';

  interface Props {
    rule: PricingRuleResponse;
    queryClient: QueryClient;
    onclose: () => void;
  }

  let { rule, queryClient, onclose }: Props = $props();

  let errorMsg = $state('');

  const deleteMutation = createMutation(() => deletePricingRuleMutationOptions(queryClient));

  async function handleDelete() {
    errorMsg = '';
    try {
      await deleteMutation.mutateAsync(rule.id);
      addToast({ type: 'success', message: 'Pricing rule deleted.' });
      onclose();
    } catch (e) {
      errorMsg =
        e instanceof ApiRequestError ? e.message : 'Unexpected error. Please try again.';
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onclose();
  }

  const ruleSummary = $derived(
    `${rule.provider} / ${rule.generation_type} / ${rule.model ?? 'All models'} — ${rule.token_cost.toLocaleString()} tokens`,
  );
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="modal-overlay"
  onclick={handleBackdropClick}
  role="dialog"
  tabindex="-1"
  aria-modal="true"
  aria-label="Confirm delete pricing rule"
>
  <div class="modal-card">
    <div class="modal-header">
      <div class="warning-icon">
        <AlertTriangle size={20} />
      </div>
      <h2 class="modal-title">Delete Pricing Rule</h2>
      <button class="close-btn" onclick={onclose} aria-label="Close">
        <X size={18} />
      </button>
    </div>

    <p class="confirm-text">Are you sure you want to delete this pricing rule?</p>
    <p class="rule-summary">{ruleSummary}</p>

    {#if errorMsg}
      <p class="error-msg">{errorMsg}</p>
    {/if}

    <div class="modal-actions">
      <button class="btn-cancel" onclick={onclose}>Cancel</button>
      <button
        class="btn-delete"
        onclick={handleDelete}
        disabled={deleteMutation.isPending}
      >
        {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
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

  .rule-summary {
    font-size: 13px;
    font-weight: 600;
    color: var(--apex-text);
    background: var(--apex-surface-hover);
    border-radius: 8px;
    padding: 10px 14px;
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
  .btn-delete:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
