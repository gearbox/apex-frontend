<script lang="ts">
  import { onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { Play, Square, X, LogIn } from '@lucide/svelte';
  import { createQuery } from '@tanstack/svelte-query';
  import StatusBadge from '$lib/components/shared/StatusBadge.svelte';
  import type { GpuSessionResponse } from '$lib/api/sessions';
  import type { CardState } from '$lib/utils/sessionState';
  import { balanceQueryOptions, canStartNewWork } from '$lib/stores/balanceGate';
  import { formatTypicalDuration } from '$lib/utils/operationDisplay';
  import { ROUTES } from '$lib/utils/routes';
  import * as m from '$paraglide/messages';

  interface Props {
    cardState: CardState;
    session: GpuSessionResponse | null;
    starting: boolean;
    typicalBootstrapSeconds?: number | null;
    onStart: () => void;
    onStopRequest: () => void;
    onResume?: (() => void) | null;
    resuming?: boolean;
  }

  let {
    cardState,
    session,
    starting,
    typicalBootstrapSeconds = null,
    onStart,
    onStopRequest,
    onResume = null,
    resuming = false,
  }: Props = $props();

  const balanceQuery = createQuery(balanceQueryOptions);
  const hasBalance = $derived(canStartNewWork(balanceQuery.data?.balance));
  const isTopUpMode = $derived(!hasBalance && !balanceQuery.isLoading);
  const provisioningTime = $derived(
    typicalBootstrapSeconds === null ? null : formatTypicalDuration(typicalBootstrapSeconds),
  );

  const CARD_COLOR_BY_STATE: Record<CardState, string> = {
    READY: 'success',
    NEEDS_SESSION: 'info',
    PROVISIONING: 'warning',
    RESTARTING: 'warning',
    REMOVING: 'warning',
    STALE: 'warning',
    STOPPING: 'muted',
    PAUSED: 'muted',
    SIGN_IN_REQUIRED: 'neutral',
    UNAVAILABLE: 'muted',
    DISABLED: 'muted',
    RUNTIME_UNKNOWN: 'muted',
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
</script>

{#if cardState === 'READY' && session}
  <!-- on_demand active session: uptime timer + Stop -->
  <div class="panel">
    <div class="panel-header">
      <StatusBadge status={m.create_state_active()} color={CARD_COLOR_BY_STATE[cardState]} />
      <div class="uptime">
        <span class="uptime-label">{m.create_session_uptime()}</span>
        <span class="uptime-value">{formatDuration(elapsed)}</span>
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
      <span class="hint">
        {provisioningTime
          ? m.gpu_session_start_hint_with_time({ time: provisioningTime })
          : m.gpu_session_start_hint_without_time()}
      </span>
    </div>
    {#if isTopUpMode}
      <button class="btn-primary" onclick={() => goto(ROUTES.billingTopUp)}>
        {m.generate_btn_topup()}
      </button>
    {:else}
      <button class="btn-primary" onclick={onStart} disabled={starting}>
        <Play size={13} />
        {starting ? m.create_state_provisioning() : m.create_session_start()}
      </button>
    {/if}
  </div>
{:else if cardState === 'PROVISIONING'}
  <div class="panel">
    <div class="panel-header">
      <StatusBadge status={m.create_state_provisioning()} color={CARD_COLOR_BY_STATE[cardState]} />
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
{:else if cardState === 'RESTARTING' || cardState === 'REMOVING'}
  <div class="panel">
    <StatusBadge
      status={cardState === 'RESTARTING' ? m.create_state_restarting() : m.create_state_removing()}
      color={CARD_COLOR_BY_STATE[cardState]}
    />
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
{:else if cardState === 'UNAVAILABLE' || cardState === 'DISABLED' || cardState === 'RUNTIME_UNKNOWN'}
  <div class="panel">
    <StatusBadge status={m.create_state_unavailable()} color={CARD_COLOR_BY_STATE[cardState]} />
  </div>
{:else if cardState === 'PAUSED'}
  <div class="panel paused">
    <span class="paused-note">{m.create_session_paused_note()}</span>
    <div class="paused-actions">
      {#if onResume}
        <button class="btn-primary" disabled={resuming} onclick={onResume}>
          {resuming ? m.session_resuming() : m.session_resume()}
        </button>
      {/if}
      <a href="/app/sessions" class="escape-link">{m.create_session_manage_link()} →</a>
      {#if session}<button class="btn-secondary" onclick={onStopRequest}
          >{m.create_session_stop()}</button
        >{/if}
    </div>
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

  .paused-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
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
