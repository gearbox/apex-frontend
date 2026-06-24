<script lang="ts">
  import { goto } from '$app/navigation';
  import { createQuery } from '@tanstack/svelte-query';
  import { Zap } from 'lucide-svelte';
  import { balanceQueryOptions, canStartNewWork } from '$lib/stores/balanceGate';
  import { ROUTES } from '$lib/utils/routes';
  import * as m from '$paraglide/messages';

  interface ModelOption {
    model_key: string;
    name: string;
    available: boolean;
  }

  interface Props {
    onDemandModels: ModelOption[];
    starting: boolean;
    onStart: (model: string) => void;
  }

  let { onDemandModels, starting, onStart }: Props = $props();

  let selectedModel = $state('');

  // Falls back to first available model if none explicitly selected
  const resolvedModel = $derived(selectedModel || onDemandModels[0]?.model_key || '');
  const selectedInfo = $derived(onDemandModels.find((m) => m.model_key === resolvedModel) ?? null);

  const balanceQuery = createQuery(balanceQueryOptions);
  const hasBalance = $derived(canStartNewWork(balanceQuery.data?.balance));
  const isTopUpMode = $derived(!hasBalance && !balanceQuery.isLoading);

  const canStart = $derived(!starting && !!selectedInfo?.available && !isTopUpMode);
</script>

<div class="start-panel">
  <h2 class="panel-heading">{m.sessions_start_heading()}</h2>

  {#if onDemandModels.length === 0}
    <p class="no-models">{m.sessions_empty()}</p>
  {:else}
    <div class="model-select-group">
      <label class="select-label" for="model-select">{m.sessions_start_model_label()}</label>
      <div class="select-wrap">
        <select
          id="model-select"
          value={resolvedModel}
          onchange={(e) => {
            selectedModel = (e.currentTarget as HTMLSelectElement).value;
          }}
          class="model-select"
          disabled={starting}
        >
          {#each onDemandModels as model (model.model_key)}
            <option value={model.model_key} disabled={!model.available}>
              {model.name}{!model.available ? ' — ' + m.sessions_provider_unavailable() : ''}
            </option>
          {/each}
        </select>
      </div>
    </div>

    {#if selectedInfo && !selectedInfo.available}
      <p class="unavailable-hint">{m.sessions_provider_unavailable()}</p>
    {:else}
      <p class="hint">{m.sessions_start_hint()}</p>
    {/if}

    {#if isTopUpMode}
      <button class="btn-start" onclick={() => goto(ROUTES.billingTopUp)}>
        {m.generate_btn_topup()}
      </button>
    {:else}
      <button
        class="btn-start"
        disabled={!canStart}
        onclick={() => canStart && onStart(resolvedModel)}
      >
        <Zap size={15} />
        {starting ? m.common_loading() : m.sessions_start_cta()}
      </button>
    {/if}
  {/if}
</div>

<style>
  .start-panel {
    background: var(--apex-surface);
    border: 1px solid var(--apex-border);
    border-radius: 14px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .panel-heading {
    font-size: 15px;
    font-weight: 700;
    color: var(--apex-text);
    margin: 0;
  }

  .no-models {
    font-size: 13px;
    color: var(--apex-text-muted);
    margin: 0;
  }

  .model-select-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .select-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--apex-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .select-wrap {
    position: relative;
  }

  .model-select {
    width: 100%;
    padding: 10px 14px;
    border-radius: 10px;
    border: 1px solid var(--apex-border);
    background: var(--apex-bg);
    color: var(--apex-text);
    font-size: 14px;
    font-family: inherit;
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
  }

  .model-select:focus {
    outline: none;
    border-color: var(--apex-accent);
  }

  .model-select:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .hint {
    font-size: 12px;
    color: var(--apex-text-muted);
    margin: 0;
  }

  .unavailable-hint {
    font-size: 12px;
    color: var(--apex-warning);
    margin: 0;
  }

  .btn-start {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    width: 100%;
    padding: 11px 20px;
    border-radius: 10px;
    border: none;
    background: linear-gradient(135deg, var(--apex-accent-dim), var(--apex-accent));
    color: white;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    font-family: inherit;
    transition: opacity 0.15s;
  }

  .btn-start:hover:not(:disabled) {
    opacity: 0.9;
  }

  .btn-start:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
