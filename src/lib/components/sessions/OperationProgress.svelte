<script module lang="ts">
  import * as m from '$paraglide/messages';

  const PHASE_LABELS: Record<string, () => string> = {
    preflight: m.operation_phase_preflight,
    comfyui: m.operation_phase_comfyui,
    requirements_base: m.operation_phase_requirements_base,
    requirements_locked: m.operation_phase_requirements_locked,
    custom_nodes: m.operation_phase_custom_nodes,
    models: m.operation_phase_models,
    workflow: m.operation_phase_workflow,
    verifying: m.operation_phase_verifying,
    restart: m.operation_phase_restart,
  };
</script>

<script lang="ts">
  import { createQuery, useQueryClient } from '@tanstack/svelte-query';
  import { isSSEFallback } from '$lib/stores/eventStream';
  import { operationQueryOptions } from '$lib/queries/operations';
  import {
    clampProgress,
    formatDuration,
    formatOperationRate,
    formatOperationValue,
    formatTypicalDuration,
    timestampMs,
  } from '$lib/utils/operationDisplay';

  interface Props {
    sessionId: string;
    operationId: string;
    compact?: boolean;
    /** The bootstrap operation ID is retained because a snapshot can establish context before it
     * has reached the canonical operation cache. */
    bootstrapOperationId?: string | null;
    typicalBootstrapSeconds?: number | null;
    typicalAttachSeconds?: number | null;
  }

  let {
    sessionId,
    operationId,
    compact = false,
    bootstrapOperationId = null,
    typicalBootstrapSeconds = null,
    typicalAttachSeconds = null,
  }: Props = $props();
  const queryClient = useQueryClient();
  const operationQuery = createQuery(() =>
    operationQueryOptions(queryClient, sessionId, operationId, {
      fallback: $isSSEFallback,
      enabled: Boolean(sessionId && operationId),
    }),
  );

  const operation = $derived(operationQuery.data);
  const progress = $derived(operation?.progress ?? null);
  const percentage = $derived(
    progress?.progress_pct != null ? clampProgress(progress.progress_pct) : null,
  );
  const typicalSeconds = $derived(
    operation?.kind === 'session_bootstrap' || operation?.id === bootstrapOperationId
      ? typicalBootstrapSeconds
      : operation?.kind === 'bundle_provision'
        ? typicalAttachSeconds
        : null,
  );

  let elapsedNow = $state(Date.now());

  const elapsedSeconds = $derived.by(() => {
    const startedAt = timestampMs(operation?.started_at);
    if (startedAt === null) return null;
    const finishedAt = timestampMs(operation?.finished_at);
    const endAt = finishedAt ?? elapsedNow;
    return Math.max(0, Math.floor((endAt - startedAt) / 1000));
  });

  // This display-only clock intentionally does not refetch the operation. It is scoped to one
  // non-terminal operation and is disposed whenever the operation changes or the component dies.
  $effect(() => {
    const startedAt = timestampMs(operation?.started_at);
    if (startedAt === null || operation?.status === 'succeeded' || operation?.status === 'failed') {
      return;
    }

    elapsedNow = Date.now();
    const timer = window.setInterval(() => {
      elapsedNow = Date.now();
    }, 1000);
    return () => window.clearInterval(timer);
  });

  function phaseLabel(phase: string | null | undefined): string | null {
    if (!phase) return null;
    return PHASE_LABELS[phase]?.() ?? null;
  }

  function workLabel(work: NonNullable<typeof progress>['work' | 'items']): string | null {
    if (!work) return null;
    const completed = formatOperationValue(work.completed, work.unit);
    const total = work.total === null ? null : formatOperationValue(work.total, work.unit);
    if (work.unit === 'bytes') {
      return total === null
        ? m.operation_work_downloaded_unknown({ completed })
        : m.operation_work_downloaded({ completed, total });
    }
    if (work.unit === 'files') {
      return total === null
        ? m.operation_work_files_unknown({ completed })
        : m.operation_work_files({ completed, total });
    }
    return total === null
      ? m.operation_work_items_unknown({ completed })
      : m.operation_work_items({ completed, total });
  }
</script>

<section class:compact class="operation" aria-busy={!operation}>
  {#if operation}
    <div class="operation-head" aria-live="polite">
      <strong
        >{operation.status === 'queued'
          ? m.operation_status_queued()
          : operation.status === 'running'
            ? m.operation_status_running()
            : operation.status === 'succeeded'
              ? m.operation_status_succeeded()
              : m.operation_status_failed()}</strong
      >
      {#if phaseLabel(operation.phase)}
        <span class="phase">{phaseLabel(operation.phase)}</span>
      {/if}
    </div>

    {#if percentage !== null}
      <div
        class="bar"
        role="progressbar"
        aria-label={m.operation_progress_label()}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={percentage}
      >
        <span style={`width: ${percentage}%`}></span>
      </div>
    {:else if operation.status === 'queued' || operation.status === 'running'}
      <span class="waiting">{m.operation_waiting_for_progress()}</span>
    {/if}

    {#if (!compact && progress) || elapsedSeconds !== null}
      <div class="details">
        {#if !compact && progress}
          {#if workLabel(progress.work)}<span>{workLabel(progress.work)}</span>{/if}
          {#if workLabel(progress.items)}<span>{workLabel(progress.items)}</span>{/if}
          {#if progress.rate}<span
              >{m.operation_rate({ rate: formatOperationRate(progress.rate) })}</span
            >{/if}
          {#if progress.eta_seconds !== null}<span
              >{m.operation_eta({ time: formatDuration(progress.eta_seconds) })}</span
            >{/if}
        {/if}
        {#if elapsedSeconds !== null}<span
            >{m.operation_elapsed({ time: formatDuration(elapsedSeconds) })}</span
          >{/if}
      </div>
    {/if}

    {#if operation.status === 'failed' && operation.error?.message}
      <p class="error" role="alert">{operation.error.message}</p>
    {:else if operation.message}
      <p class="message">{operation.message}</p>
    {:else if typicalSeconds !== null && (operation.status === 'queued' || operation.status === 'running') && progress?.eta_seconds == null}
      <p class="message">
        {m.operation_typical_duration({ time: formatTypicalDuration(typicalSeconds) })}
      </p>
    {/if}
  {:else}
    <span class="waiting">{m.operation_loading()}</span>
  {/if}
</section>

<style>
  .operation {
    display: flex;
    flex-direction: column;
    gap: 7px;
    min-width: 0;
    color: var(--apex-text-muted);
  }
  .operation.compact {
    gap: 5px;
  }
  .operation-head,
  .details {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
  }
  .operation-head strong {
    color: var(--apex-text);
    font-size: 12px;
  }
  .phase,
  .details,
  .waiting,
  .message,
  .error {
    font-size: 12px;
    overflow-wrap: anywhere;
  }
  .phase {
    color: var(--apex-text-muted);
  }
  .bar {
    height: 7px;
    width: 100%;
    overflow: hidden;
    border-radius: 999px;
    background: var(--apex-surface-hover);
  }
  .bar span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--apex-accent);
    transition: width 0.25s ease;
  }
  .details {
    color: var(--apex-text-dim);
  }
  .message,
  .error {
    margin: 0;
  }
  .error {
    color: var(--apex-danger);
  }
  @media (prefers-reduced-motion: reduce) {
    .bar span {
      transition: none;
    }
  }
</style>
