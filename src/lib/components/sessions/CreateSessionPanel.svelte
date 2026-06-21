<script lang="ts">
  import { onDestroy } from 'svelte';
  import { Play, Square, X, LogIn } from 'lucide-svelte';
  import StatusBadge from '$lib/components/shared/StatusBadge.svelte';
  import type { GpuSessionResponse } from '$lib/api/sessions';
  import type { CardState } from '$lib/utils/sessionState';
  import * as m from '$paraglide/messages';

  interface Props {
    cardState: CardState;
    session: GpuSessionResponse | null;
    starting: boolean;
    onStart: () => void;
    onStopRequest: () => void;
  }

  let { cardState, session, starting, onStart, onStopRequest }: Props = $props();

  const CARD_COLOR_BY_STATE: Record<CardState, string> = {
    READY: 'success',
    NEEDS_SESSION: 'info',
    PROVISIONING: 'warning',
    STALE: 'warning',
    STOPPING: 'muted',
    SIGN_IN_REQUIRED: 'neutral',
    UNAVAILABLE: 'muted',
    PAUSED_HIDDEN: 'muted',
  };

  // Running uptime timer (active sessions only)
  let elapsed = $state(0);
  let intervalId: ReturnType<typeof setInterval> | null = null;

  function startTimer() {
    if (!session?.started_at) return;
    const startMs = new Date(session.started_at).getTime();
    if (Number.isNaN(startMs)) {
      elapsed = 0;
      return;
    }
    const compute = () => Math.max(0, Math.floor((Date.now() - startMs) / 1000));
    elapsed = compute();
    intervalId = setInterval(() => {
      elapsed = compute();
    }, 1000);
  }

  function stopTimer() {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  $effect(() => {
    if (cardState === 'READY' && session?.started_at && intervalId === null) {
      startTimer();
    } else if (cardState !== 'READY') {
      stopTimer();
    }
  });

  onDestroy(() => stopTimer());

  function formatDuration(secs: number): string {
    const h = Math.floor(secs / 3600);
    const min = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return h > 0
      ? `${h}h ${min.toString().padStart(2, '0')}m`
      : `${min}m ${s.toString().padStart(2, '0')}s`;
  }

  function microsToUsd(micros: number, seconds: number): string {
    const hours = seconds / 3600;
    const usd = (micros / 1_000_000) * hours;
    return `$${usd.toFixed(4)}`;
  }
</script>

{#if cardState === 'READY' && session}
  <!-- on_demand active session: uptime timer + Stop -->
  <div class="panel">
    <div class="panel-header">
      <StatusBadge status={m.create_state_active()} color={CARD_COLOR_BY_STATE[cardState]} />
      <div class="uptime">
        <span class="uptime-label">{m.create_session_uptime()}</span>
        <span class="uptime-value">{formatDuration(elapsed)}</span>
        {#if session.vastai_cost_per_hour_micros}
          <span class="cost-hint">
            {m.create_session_cost_so_far()}
            {microsToUsd(session.vastai_cost_per_hour_micros, elapsed)}
          </span>
        {/if}
      </div>
    </div>
    <button class="btn-secondary" onclick={onStopRequest}>
      <Square size={13} />
      {m.create_session_stop()}
    </button>
  </div>
{:else if cardState === 'NEEDS_SESSION'}
  <div class="panel">
    <div class="panel-header">
      <StatusBadge status={m.create_state_needs_session()} color={CARD_COLOR_BY_STATE[cardState]} />
      <span class="hint">{m.create_session_cost_hint()}</span>
    </div>
    <button class="btn-primary" onclick={onStart} disabled={starting}>
      <Play size={13} />
      {starting ? m.create_state_provisioning() : m.create_session_start()}
    </button>
  </div>
{:else if cardState === 'PROVISIONING'}
  <div class="panel">
    <div class="panel-header">
      <StatusBadge status={m.create_state_provisioning()} color={CARD_COLOR_BY_STATE[cardState]} />
      {#if session?.provisioning_phase}
        <span class="hint">{session.provisioning_phase}</span>
      {/if}
    </div>
    <button class="btn-secondary" onclick={onStopRequest}>
      <X size={13} />
      {m.create_session_cancel()}
    </button>
  </div>
{:else if cardState === 'STALE'}
  <div class="panel">
    <div class="panel-header">
      <StatusBadge status={m.create_state_stale()} color={CARD_COLOR_BY_STATE[cardState]} />
      {#if session?.error_message}
        <span class="hint error">{session.error_message}</span>
      {/if}
    </div>
    <button class="btn-secondary" onclick={onStopRequest}>
      <Square size={13} />
      {m.create_session_stop()}
    </button>
  </div>
{:else if cardState === 'STOPPING'}
  <div class="panel">
    <StatusBadge status={m.create_state_stopping()} color={CARD_COLOR_BY_STATE[cardState]} />
  </div>
{:else if cardState === 'SIGN_IN_REQUIRED'}
  <div class="panel">
    <div class="panel-header">
      <StatusBadge status={m.create_state_sign_in()} color={CARD_COLOR_BY_STATE[cardState]} />
    </div>
    <a href="/login" class="btn-primary btn-link">
      <LogIn size={13} />
      {m.create_session_sign_in_cta()}
    </a>
  </div>
{:else if cardState === 'UNAVAILABLE'}
  <div class="panel">
    <StatusBadge status={m.create_state_unavailable()} color={CARD_COLOR_BY_STATE[cardState]} />
  </div>
{:else if cardState === 'PAUSED_HIDDEN'}
  <div class="panel paused">
    <span class="paused-note">{m.create_session_paused_note()}</span>
    <a href="/app/sessions" class="escape-link">{m.create_session_manage_link()} →</a>
  </div>
{/if}

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: var(--apex-surface);
    border: 1px solid var(--apex-border);
    border-radius: 12px;
    padding: 14px;
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .uptime {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
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

  .cost-hint {
    font-size: 11px;
    color: var(--apex-text-dim);
    margin-left: auto;
  }

  .hint {
    font-size: 12px;
    color: var(--apex-text-dim);
  }

  .hint.error {
    color: var(--apex-warning);
  }

  .btn-primary,
  .btn-secondary {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 16px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: all 0.15s;
    align-self: flex-start;
    text-decoration: none;
  }

  .btn-primary {
    background: var(--apex-accent);
    color: white;
    border: none;
  }

  .btn-primary:hover:not(:disabled) {
    opacity: 0.88;
  }

  .btn-primary:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: transparent;
    color: var(--apex-text-muted);
    border: 1px solid var(--apex-border);
  }

  .btn-secondary:hover:not(:disabled) {
    background: color-mix(in srgb, var(--apex-danger) 10%, transparent);
    border-color: var(--apex-danger);
    color: var(--apex-danger);
  }

  .btn-link {
    background: var(--apex-accent);
    color: white;
    border: none;
  }

  .btn-link:hover {
    opacity: 0.88;
  }

  .paused {
    gap: 6px;
  }

  .paused-note {
    font-size: 12px;
    color: var(--apex-text-dim);
  }

  .escape-link {
    font-size: 12px;
    color: var(--apex-text-dim);
    text-decoration: none;
  }

  .escape-link:hover {
    color: var(--apex-accent);
    text-decoration: underline;
  }
</style>
