<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Square } from '@lucide/svelte';
  import StatusBadge from '$lib/components/shared/StatusBadge.svelte';
  import type { GpuSessionListItemResponse } from '$lib/api/sessions';
  import * as m from '$paraglide/messages';

  interface Props {
    session: GpuSessionListItemResponse;
    onStop: (id: string) => void;
  }

  let { session, onStop }: Props = $props();

  const SESSION_COLOR_MAP: Record<string, string> = {
    active: 'success',
    pending: 'warning',
    provisioning: 'warning',
    resuming: 'warning',
    stale: 'warning',
    stopping: 'muted',
    stopped: 'muted',
    failed: 'danger',
  };

  let elapsed = $state(0);
  let intervalId: ReturnType<typeof setInterval> | null = null;

  function startTimer() {
    if (!session.started_at) return;
    const startMs = new Date(session.started_at).getTime();
    elapsed = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
    intervalId = setInterval(() => {
      elapsed = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
    }, 1000);
  }

  function stopTimer() {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  onMount(() => {
    if (session.status === 'active' && session.started_at) {
      startTimer();
    }
  });

  onDestroy(() => {
    stopTimer();
  });

  $effect(() => {
    if (session.status === 'active' && session.started_at && intervalId === null) {
      startTimer();
    } else if (session.status !== 'active') {
      stopTimer();
    }
  });

  function formatDuration(secs: number): string {
    const h = Math.floor(secs / 3600);
    const min = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return h > 0
      ? `${h}h ${min.toString().padStart(2, '0')}m`
      : `${min}m ${s.toString().padStart(2, '0')}s`;
  }

  const isTerminal = $derived(session.status === 'stopped' || session.status === 'failed');
  const stopDisabled = $derived(session.status === 'stopping' || isTerminal);
</script>

<div class="session-card">
  <div class="card-header">
    <div class="card-title-row">
      <div class="card-model">
        <span class="model-name"
          >{session.deployments.map((deployment) => deployment.model_type).join(', ')}</span
        >
      </div>
      <StatusBadge status={session.status} colorMap={SESSION_COLOR_MAP} />
    </div>
  </div>

  {#if session.status === 'active' && session.started_at}
    <div class="card-uptime">
      <span class="uptime-label">{m.session_uptime()}</span>
      <span class="uptime-value">{formatDuration(elapsed)}</span>
    </div>
  {/if}

  <div class="card-actions">
    <button class="btn-stop" disabled={stopDisabled} onclick={() => onStop(session.id)}>
      <Square size={14} />
      {session.status === 'stopping' ? m.session_stopping() : m.session_stop()}
    </button>
  </div>
</div>

<style>
  .session-card {
    background: var(--apex-surface);
    border: 1px solid var(--apex-border);
    border-radius: 14px;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .card-header {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .card-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .card-model {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .model-name {
    font-size: 15px;
    font-weight: 700;
    color: var(--apex-text);
  }

  .card-uptime {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .uptime-label {
    font-size: 12px;
    color: var(--apex-text-muted);
  }

  .uptime-value {
    font-size: 13px;
    font-weight: 600;
    color: var(--apex-text);
    font-variant-numeric: tabular-nums;
  }

  .card-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    justify-content: flex-end;
  }

  .btn-stop {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    border-radius: 8px;
    border: 1px solid var(--apex-border);
    background: transparent;
    color: var(--apex-text-muted);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;
    transition: all 0.15s;
  }

  .btn-stop:hover:not(:disabled) {
    background: color-mix(in srgb, var(--apex-danger) 10%, transparent);
    border-color: var(--apex-danger);
    color: var(--apex-danger);
  }

  .btn-stop:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
