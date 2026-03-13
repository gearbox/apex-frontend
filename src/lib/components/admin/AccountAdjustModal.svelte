<script lang="ts">
  import type { QueryClient } from '@tanstack/svelte-query';
  import { createQuery, createMutation } from '@tanstack/svelte-query';
  import { untrack } from 'svelte';
  import { X } from 'lucide-svelte';
  import {
    accountBalanceQueryOptions,
    accountTransactionsQueryOptions,
    adjustBalanceMutationOptions,
  } from '$lib/queries/admin';
  import { addToast } from '$lib/stores/toasts';

  interface Props {
    accountId: string;
    entityName: string;
    entityType: 'user' | 'org';
    queryClient: QueryClient;
    onclose: () => void;
  }

  let { accountId, entityName, queryClient, onclose }: Props = $props();

  // Snapshot stable props — modal is opened with a fixed accountId that won't change
  const aid = untrack(() => accountId);
  const qc = untrack(() => queryClient);

  let amount = $state('');
  let description = $state('');
  let errorMsg = $state('');
  let successMsg = $state('');

  const balanceQuery = createQuery(() => accountBalanceQueryOptions(aid));
  const txnsQuery = createQuery(() =>
    accountTransactionsQueryOptions(aid, { limit: 5 }),
  );
  const mutation = createMutation(() => adjustBalanceMutationOptions(qc, aid));

  const canSubmit = $derived(amount !== '' && !isNaN(Number(amount)) && description.trim().length > 0);

  async function handleSubmit() {
    errorMsg = '';
    successMsg = '';
    try {
      const result = await mutation.mutateAsync({
        amount: Number(amount),
        description: description.trim(),
      });
      successMsg = `Done! New balance: ${result.new_balance.toLocaleString()} tokens.`;
      addToast({ type: 'success', message: `Balance adjusted. New balance: ${result.new_balance.toLocaleString()} tokens.` });
      amount = '';
      description = '';
      setTimeout(() => onclose(), 1500);
    } catch (e) {
      errorMsg = e instanceof Error ? e.message : 'Failed to adjust balance.';
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) onclose();
  }

  function formatRelativeTime(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="modal-overlay" onclick={handleBackdropClick} role="dialog" tabindex="-1" aria-modal="true" aria-label="Adjust account balance">
  <div class="modal-card">
    <div class="modal-header">
      <h2 class="modal-title">Adjust Balance</h2>
      <button class="close-btn" onclick={onclose} aria-label="Close"><X size={18} /></button>
    </div>

    <p class="modal-subtitle">{entityName}</p>

    <!-- Current balance -->
    <div class="balance-display">
      <span class="balance-label">Current Balance</span>
      {#if balanceQuery.isPending}
        <span class="balance-skeleton"></span>
      {:else if balanceQuery.data}
        <span class="balance-value">{balanceQuery.data.balance.toLocaleString()} tokens</span>
      {/if}
    </div>

    <!-- Form -->
    <div class="form-fields">
      <div class="field">
        <label class="field-label" for="adjust-amount">Adjustment Amount</label>
        <input
          id="adjust-amount"
          type="number"
          class="field-input"
          placeholder="e.g. 500 or -100"
          bind:value={amount}
        />
        <span class="field-hint">Positive to credit, negative to debit</span>
      </div>

      <div class="field">
        <label class="field-label" for="adjust-desc">Reason</label>
        <input
          id="adjust-desc"
          type="text"
          class="field-input"
          placeholder="e.g. Promotional credit, Refund for failed job"
          bind:value={description}
        />
      </div>
    </div>

    {#if errorMsg}
      <p class="error-msg">{errorMsg}</p>
    {/if}

    {#if successMsg}
      <p class="success-msg">{successMsg}</p>
    {/if}

    <!-- Recent transactions -->
    {#if txnsQuery.data?.items?.length}
      <div class="txns-section">
        <span class="txns-title">Recent Transactions</span>
        <div class="txns-list">
          {#each txnsQuery.data.items as txn (txn.id)}
            <div class="txn-row">
              <span class="txn-type">{txn.transaction_type}</span>
              <span class="txn-amount" class:positive={txn.amount > 0} class:negative={txn.amount < 0}>
                {txn.amount > 0 ? '+' : ''}{txn.amount.toLocaleString()}
              </span>
              <span class="txn-desc">{txn.description ?? '—'}</span>
              <span class="txn-time">{formatRelativeTime(txn.created_at)}</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <div class="modal-actions">
      <button class="btn-cancel" onclick={onclose}>Cancel</button>
      <button
        class="btn-save"
        onclick={handleSubmit}
        disabled={!canSubmit || mutation.isPending}
      >
        {mutation.isPending ? 'Applying…' : 'Apply Adjustment'}
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
    max-height: 90dvh;
    overflow-y: auto;
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

  .balance-display {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--apex-bg);
    border: 1px solid var(--apex-border);
    border-radius: 10px;
    padding: 12px 16px;
  }

  .balance-label {
    font-size: 13px;
    color: var(--apex-text-muted);
  }

  .balance-value {
    font-size: 15px;
    font-weight: 700;
    color: var(--apex-text);
  }

  .balance-skeleton {
    display: inline-block;
    width: 100px;
    height: 20px;
    background: var(--apex-surface-hover);
    border-radius: 4px;
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.5; }
  }

  .form-fields {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .field-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--apex-text-muted);
  }

  .field-input {
    background: var(--apex-bg);
    border: 1px solid var(--apex-border);
    color: var(--apex-text);
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 14px;
    font-family: inherit;
    width: 100%;
    box-sizing: border-box;
  }

  .field-hint {
    font-size: 11px;
    color: var(--apex-text-dim);
  }

  .error-msg {
    font-size: 13px;
    color: var(--apex-danger);
    margin: 0;
    padding: 8px 12px;
    background: color-mix(in srgb, var(--apex-danger) 10%, transparent);
    border-radius: 8px;
  }

  .success-msg {
    font-size: 13px;
    color: var(--apex-success);
    margin: 0;
    padding: 8px 12px;
    background: color-mix(in srgb, var(--apex-success) 10%, transparent);
    border-radius: 8px;
  }

  .txns-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .txns-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--apex-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .txns-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .txn-row {
    display: grid;
    grid-template-columns: auto 1fr auto auto;
    gap: 10px;
    align-items: center;
    font-size: 12px;
    padding: 6px 0;
    border-bottom: 1px solid var(--apex-border);
  }
  .txn-row:last-child { border-bottom: none; }

  .txn-type {
    background: var(--apex-surface-hover);
    color: var(--apex-text-muted);
    padding: 2px 8px;
    border-radius: 99px;
    font-size: 11px;
    white-space: nowrap;
  }

  .txn-amount {
    font-weight: 600;
    text-align: center;
  }
  .txn-amount.positive { color: var(--apex-success); }
  .txn-amount.negative { color: var(--apex-danger); }

  .txn-desc {
    color: var(--apex-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .txn-time {
    color: var(--apex-text-dim);
    white-space: nowrap;
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
  .btn-save:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
