<script lang="ts">
  import type { QueryClient } from '@tanstack/svelte-query';
  import { createQuery, createMutation } from '@tanstack/svelte-query';
  import { untrack } from 'svelte';
  import { X } from 'lucide-svelte';
  import {
    adminModelsQueryOptions,
    createPricingRuleMutationOptions,
    patchPricingRuleMutationOptions,
  } from '$lib/queries/admin';
  import { addToast } from '$lib/stores/toasts';
  import type { PricingRuleResponse } from '$lib/api/admin';
  import { ApiRequestError } from '$lib/api/errors';

  const GENERATION_TYPES = ['t2i', 'i2i', 't2v', 'i2v', 'v2v', 'flf2v'] as const;

  interface Props {
    rule?: PricingRuleResponse;
    queryClient: QueryClient;
    onclose: () => void;
  }

  let { rule, queryClient, onclose }: Props = $props();

  const isEdit = $derived(rule !== undefined);

  // Form state
  let provider = $state(untrack(() => rule?.provider ?? ''));
  let generationType = $state(untrack(() => rule?.generation_type ?? 't2i'));
  let model = $state(untrack(() => rule?.model ?? ''));
  let tokenCost = $state(untrack(() => rule?.token_cost ?? 1));
  let effectiveUntil = $state(
    untrack(() => {
      if (!rule?.effective_until) return '';
      // Convert ISO datetime to datetime-local format
      return new Date(rule.effective_until).toISOString().slice(0, 16);
    }),
  );
  let notes = $state(untrack(() => rule?.notes ?? ''));
  let errorMsg = $state('');

  // Fetch models for provider/model dropdowns
  const modelsQuery = createQuery(() => adminModelsQueryOptions({ enabled_only: false }));

  const uniqueProviders = $derived(() => {
    const models = modelsQuery.data?.items ?? [];
    return [...new Set(models.map((m) => m.provider))].sort();
  });

  const filteredModels = $derived(() => {
    if (!provider) return [];
    return (modelsQuery.data?.items ?? []).filter((m) => m.provider === provider);
  });

  const createRuleMutation = createMutation(() => createPricingRuleMutationOptions(queryClient));
  const editMutation = createMutation(() => patchPricingRuleMutationOptions(queryClient));

  const isPending = $derived(createRuleMutation.isPending || editMutation.isPending);

  async function handleSave() {
    errorMsg = '';
    try {
      if (isEdit && rule) {
        const body: Record<string, unknown> = {};
        if (tokenCost !== rule.token_cost) body.token_cost = tokenCost;
        const until = effectiveUntil ? new Date(effectiveUntil).toISOString() : null;
        if (until !== (rule.effective_until ?? null)) body.effective_until = until;
        const notesVal = notes.trim() || null;
        if (notesVal !== (rule.notes ?? null)) body.notes = notesVal;
        await editMutation.mutateAsync({
          ruleId: rule.id,
          body,
        });
        addToast({ type: 'success', message: 'Pricing rule updated.' });
      } else {
        await createRuleMutation.mutateAsync({
          provider,
          generation_type: generationType,
          model: model || null,
          token_cost: tokenCost,
          notes: notes.trim() || null,
        });
        addToast({ type: 'success', message: 'Pricing rule created.' });
      }
      onclose();
    } catch (e) {
      errorMsg =
        e instanceof ApiRequestError ? e.message : 'Unexpected error. Please try again.';
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
  aria-label={isEdit ? 'Edit pricing rule' : 'Create pricing rule'}
>
  <div class="modal-card">
    <div class="modal-header">
      <h2 class="modal-title">{isEdit ? 'Edit Pricing Rule' : 'Create Pricing Rule'}</h2>
      <button class="close-btn" onclick={onclose} aria-label="Close">
        <X size={18} />
      </button>
    </div>

    <div class="form-fields">
      <!-- Provider -->
      <div class="field">
        <label class="field-label" for="pricing-provider">Provider</label>
        {#if isEdit}
          <input
            id="pricing-provider"
            class="field-input"
            value={rule?.provider}
            disabled
          />
        {:else}
          <select id="pricing-provider" class="field-select" bind:value={provider}>
            <option value="" disabled>Select provider…</option>
            {#if modelsQuery.isPending}
              <option disabled>Loading…</option>
            {:else}
              {#each uniqueProviders() as p (p)}
                <option value={p}>{p}</option>
              {/each}
            {/if}
          </select>
        {/if}
      </div>

      <!-- Generation Type -->
      <div class="field">
        <label class="field-label" for="pricing-gen-type">Generation Type</label>
        {#if isEdit}
          <input
            id="pricing-gen-type"
            class="field-input"
            value={rule?.generation_type}
            disabled
          />
        {:else}
          <select id="pricing-gen-type" class="field-select" bind:value={generationType}>
            {#each GENERATION_TYPES as gt (gt)}
              <option value={gt}>{gt}</option>
            {/each}
          </select>
        {/if}
      </div>

      <!-- Model -->
      <div class="field">
        <label class="field-label" for="pricing-model">Model</label>
        {#if isEdit}
          <input
            id="pricing-model"
            class="field-input"
            value={rule?.model ?? 'All models'}
            disabled
          />
        {:else}
          <select id="pricing-model" class="field-select" bind:value={model} disabled={!provider}>
            <option value="">All models</option>
            {#each filteredModels() as m (m.model_key)}
              <option value={m.model_key}>{m.name}</option>
            {/each}
          </select>
        {/if}
      </div>

      <!-- Token Cost -->
      <div class="field">
        <label class="field-label" for="pricing-cost">Token Cost</label>
        <input
          id="pricing-cost"
          class="field-input"
          type="number"
          min="1"
          bind:value={tokenCost}
        />
      </div>

      <!-- Effective Until (edit only) -->
      {#if isEdit}
        <div class="field">
          <label class="field-label" for="pricing-until">Effective Until</label>
          <input
            id="pricing-until"
            class="field-input"
            type="datetime-local"
            bind:value={effectiveUntil}
          />
          <span class="field-hint">Leave blank to keep open-ended.</span>
        </div>
      {/if}

      <!-- Notes -->
      <div class="field">
        <label class="field-label" for="pricing-notes">Notes</label>
        <textarea
          id="pricing-notes"
          class="field-textarea"
          bind:value={notes}
          rows={3}
          maxlength={500}
          placeholder="Optional notes…"
        ></textarea>
      </div>
    </div>

    {#if errorMsg}
      <p class="error-msg">{errorMsg}</p>
    {/if}

    <div class="modal-actions">
      <button class="btn-cancel" onclick={onclose}>Cancel</button>
      <button class="btn-save" onclick={handleSave} disabled={isPending}>
        {isPending ? 'Saving…' : 'Save'}
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
    max-height: 90vh;
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

  .field-select,
  .field-input,
  .field-textarea {
    background: var(--apex-bg);
    border: 1px solid var(--apex-border);
    color: var(--apex-text);
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 14px;
    font-family: inherit;
    width: 100%;
  }

  .field-select:disabled,
  .field-input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .field-textarea {
    resize: vertical;
    min-height: 80px;
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
