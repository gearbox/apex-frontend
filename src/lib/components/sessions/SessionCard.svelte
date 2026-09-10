<script module lang="ts">
  import * as m from '$paraglide/messages';

  const SESSION_COLOR_MAP: Record<string, string> = {
    active: 'success',
    pending: 'warning',
    provisioning: 'warning',
    resuming: 'warning',
    stale: 'warning',
    paused: 'muted',
    stopping: 'muted',
    stopped: 'muted',
    failed: 'danger',
  };

  const SESSION_STATUS_LABELS: Record<string, () => string> = {
    pending: m.session_status_pending,
    provisioning: m.session_status_provisioning,
    active: m.session_status_active,
    stale: m.session_status_stale,
    paused: m.session_status_paused,
    resuming: m.session_status_resuming,
    stopping: m.session_status_stopping,
    stopped: m.session_status_stopped,
    failed: m.session_status_failed,
  };
</script>

<script lang="ts">
  import { createMutation, useQueryClient } from '@tanstack/svelte-query';
  import { Pause, Play, Plus, Square } from '@lucide/svelte';
  import StatusBadge from '$lib/components/shared/StatusBadge.svelte';
  import type {
    GpuSessionListItemResponse,
    GpuSessionResponse,
    DeploymentResponse,
  } from '$lib/api/sessions';
  import type { AttachModelOption, ModelProvisioningHints } from '$lib/utils/deploymentEligibility';
  import {
    canRemoveDeployment,
    requiresForceToRemoveDeployment,
  } from '$lib/utils/deploymentEligibility';
  import { timestampMs } from '$lib/utils/operationDisplay';
  import {
    attachDeploymentMutationOptions,
    pauseSessionMutationOptions,
    removeDeploymentMutationOptions,
    resumeSessionMutationOptions,
  } from '$lib/queries/sessions';
  import { addToast } from '$lib/stores/toasts';
  import { parseApiError } from '$lib/api/errors';
  import { isRequestCancellation } from '$lib/api/client';
  import OperationProgress from './OperationProgress.svelte';
  import DeploymentRow from './DeploymentRow.svelte';
  import AttachDeploymentSheet from './AttachDeploymentSheet.svelte';
  import RemoveDeploymentModal from './RemoveDeploymentModal.svelte';

  interface Props {
    session: GpuSessionResponse | GpuSessionListItemResponse;
    modelNames?: Record<string, string>;
    attachableModels?: AttachModelOption[];
    provisioningHints?: Map<string, ModelProvisioningHints>;
    detailState?: 'loading' | 'error' | 'loaded';
    onDetailRetry?: (() => void) | null;
    onStop: (id: string) => void;
  }

  let {
    session,
    modelNames = {},
    attachableModels = [],
    provisioningHints = new Map(),
    detailState = undefined,
    onDetailRetry = null,
    onStop,
  }: Props = $props();
  const queryClient = useQueryClient();
  const pauseMutation = createMutation(() => pauseSessionMutationOptions(queryClient));
  const resumeMutation = createMutation(() => resumeSessionMutationOptions(queryClient));
  const attachMutation = createMutation(() => attachDeploymentMutationOptions(queryClient));
  const removeMutation = createMutation(() => removeDeploymentMutationOptions(queryClient));

  let attachOpen = $state(false);
  let removalTarget = $state<DeploymentResponse | null>(null);
  // TanStack mutation state flushes on a scheduled tick, not synchronously with `.mutate()`. This
  // single latch — set the instant a command starts, cleared in its onSuccess/onError — is what
  // actually prevents a same-tick double submission and lets every entry point derive one
  // session-level "command in flight" state instead of juggling per-action duplicate booleans.
  let pendingCommand = $state<'pause' | 'resume' | 'attach' | 'remove' | null>(null);

  const inferredDetailState = $derived('user_id' in session ? 'loaded' : 'loading');
  const resolvedDetailState = $derived(detailState ?? inferredDetailState);
  const detail = $derived(
    resolvedDetailState === 'loaded' ? (session as GpuSessionResponse) : null,
  );
  const deployments = $derived(detail?.deployments ?? []);
  const terminal = $derived(session.status === 'stopped' || session.status === 'failed');
  const commandInFlight = $derived(
    pendingCommand !== null ||
      pauseMutation.isPending ||
      resumeMutation.isPending ||
      attachMutation.isPending ||
      removeMutation.isPending,
  );
  const inFlightJobCount = $derived(detail?.in_flight_job_count ?? 0);
  const pauseBlockedByJobs = $derived(inFlightJobCount > 0);
  const actionDisabled = $derived(
    commandInFlight || session.status === 'resuming' || session.status === 'stopping' || terminal,
  );
  const currentRemovalTarget = $derived(
    removalTarget
      ? (deployments.find((deployment) => deployment.id === removalTarget?.id) ?? null)
      : null,
  );
  const selectedRemovalRequiresForce = $derived(
    currentRemovalTarget
      ? requiresForceToRemoveDeployment(deployments, currentRemovalTarget.id)
      : false,
  );
  const currentDeployments = $derived(
    (session.deployments ?? []).filter(
      (deployment) =>
        deployment.status === 'active' ||
        deployment.status === 'deploying' ||
        deployment.status === 'removing',
    ),
  );
  const headerModelNames = $derived(
    Array.from(new Set(currentDeployments.map((deployment) => modelName(deployment)))).join(', '),
  );
  const bootstrapDeployment = $derived(
    deployments.find((deployment) => deployment.is_primary) ?? currentDeployments[0] ?? null,
  );
  const typicalBootstrapSeconds = $derived(
    bootstrapDeployment
      ? (provisioningHints.get(bootstrapDeployment.model_type)?.typicalBootstrapSeconds ?? null)
      : null,
  );
  // A bootstrap operation is normally also the primary deployment's current operation. The
  // deployment row owns that presentation when it is available; keep this card-level instance
  // only for operation associations that are not represented by a deployment snapshot.
  const deploymentOperationIds = $derived(
    new Set(
      deployments
        .map((deployment) => deployment.current_operation?.id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const standaloneBootstrapOperation = $derived(
    detail?.bootstrap_operation && !deploymentOperationIds.has(detail.bootstrap_operation.id)
      ? detail.bootstrap_operation
      : null,
  );

  let uptimeNow = $state(Date.now());

  const uptimeSeconds = $derived.by(() => {
    const startedAt = timestampMs(detail?.started_at);
    return startedAt === null ? null : Math.max(0, Math.floor((uptimeNow - startedAt) / 1000));
  });

  // Detailed active sessions get a local, minute-granularity clock. It never fetches and the
  // effect cleanup prevents duplicate intervals as lifecycle snapshots change.
  $effect(() => {
    const startedAt = timestampMs(detail?.started_at);
    if (detail?.status !== 'active' || startedAt === null) return;

    uptimeNow = Date.now();
    const timer = window.setInterval(() => {
      uptimeNow = Date.now();
    }, 60_000);
    return () => window.clearInterval(timer);
  });

  function operationError(error: unknown): void {
    if (isRequestCancellation(error)) return;
    addToast({
      type: 'error',
      message: parseApiError(error, 0).message || m.session_action_failed(),
    });
  }

  function handlePauseError(error: unknown): void {
    if (isRequestCancellation(error)) return;
    // The count can race between the read that enabled this button and the command itself; the
    // backend remains authoritative and rejects with this code when jobs started in between.
    if (parseApiError(error, 0).error === 'jobs_in_flight') {
      addToast({ type: 'warning', message: m.session_pause_blocked_hint() });
      return;
    }
    operationError(error);
  }

  function handlePause(): void {
    if (commandInFlight || pauseBlockedByJobs) return;
    pendingCommand = 'pause';
    pauseMutation.mutate(session.id, {
      onSuccess: () => {
        pendingCommand = null;
      },
      onError: (error) => {
        pendingCommand = null;
        handlePauseError(error);
      },
    });
  }

  function handleResume(): void {
    if (commandInFlight) return;
    pendingCommand = 'resume';
    resumeMutation.mutate(session.id, {
      onSuccess: () => {
        pendingCommand = null;
      },
      onError: (error) => {
        pendingCommand = null;
        operationError(error);
      },
    });
  }

  function handleAttach(model: AttachModelOption['model']): void {
    if (!detail || commandInFlight) return;
    // The sheet can stay open while SSE/REST updates change eligibility underneath it — the
    // session can leave 'active', or the selected model can stop being attachable. Revalidate
    // against current reactive state immediately before sending the request.
    const stillEligible =
      detail.status === 'active' && attachableModels.some((option) => option.model === model);
    if (!stillEligible) {
      attachOpen = false;
      addToast({ type: 'warning', message: m.session_attach_state_changed() });
      return;
    }
    pendingCommand = 'attach';
    attachMutation.mutate(
      { sessionId: session.id, model },
      {
        onSuccess: () => {
          pendingCommand = null;
          attachOpen = false;
        },
        onError: (error) => {
          pendingCommand = null;
          operationError(error);
        },
      },
    );
  }

  function handleRemove(): void {
    if (!currentRemovalTarget || commandInFlight) return;
    // A dialog may have opened before an SSE/REST update changed either status. Re-read the
    // current detailed snapshot immediately before issuing DELETE.
    if (!canRemoveDeployment(session.status, currentRemovalTarget.status)) {
      removalTarget = null;
      return;
    }
    pendingCommand = 'remove';
    removeMutation.mutate(
      {
        sessionId: session.id,
        deploymentId: currentRemovalTarget.id,
        force: requiresForceToRemoveDeployment(deployments, currentRemovalTarget.id),
      },
      {
        onSuccess: () => {
          pendingCommand = null;
          removalTarget = null;
        },
        onError: (error) => {
          pendingCommand = null;
          operationError(error);
        },
      },
    );
  }
  function openRemoval(target: DeploymentResponse): void {
    if (!commandInFlight && canRemoveDeployment(session.status, target.status)) {
      removalTarget = target;
    }
  }
  function closeRemoval(): void {
    if (!commandInFlight) removalTarget = null;
  }
  function closeAttach(): void {
    if (!commandInFlight) attachOpen = false;
  }
  function modelName(deployment: { model_type: string }): string {
    return modelNames[deployment.model_type] ?? deployment.model_type;
  }
  function sessionStatusLabel(status: string): string {
    return SESSION_STATUS_LABELS[status]?.() ?? status;
  }
  function formatUptime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }
</script>

<article class="session-card">
  <header class="card-header">
    <div class="card-title-row">
      <div class="card-model">
        <strong>{headerModelNames || m.session_no_current_deployments()}</strong>
      </div>
      <StatusBadge
        status={sessionStatusLabel(session.status)}
        color={SESSION_COLOR_MAP[session.status]}
      />
    </div>
    {#if detail?.vastai_gpu_name}<small>{detail.vastai_gpu_name}</small>{/if}
    {#if detail?.status === 'active' && uptimeSeconds !== null}<small
        >{m.session_uptime()}: {formatUptime(uptimeSeconds)}</small
      >{/if}
    {#if detail?.error_message}<p class="session-error">{detail.error_message}</p>{/if}
  </header>

  {#if standaloneBootstrapOperation}
    <OperationProgress
      sessionId={session.id}
      operationId={standaloneBootstrapOperation.id}
      bootstrapOperationId={standaloneBootstrapOperation.id}
      {typicalBootstrapSeconds}
    />
  {/if}

  {#if detail}
    <div class="deployments" aria-label={m.session_deployments_label()}>
      {#each deployments as deployment (deployment.id)}
        <DeploymentRow
          sessionId={session.id}
          sessionStatus={session.status}
          {deployment}
          modelName={modelName(deployment)}
          typicalAttachSeconds={provisioningHints.get(deployment.model_type)
            ?.typicalAttachSeconds ?? null}
          actionLocked={commandInFlight}
          removingTarget={pendingCommand === 'remove' && currentRemovalTarget?.id === deployment.id}
          onRemove={openRemoval}
        />
      {/each}
    </div>
  {:else if resolvedDetailState === 'error'}
    <div class="detail-error">
      <p class="session-error">{m.session_detail_error()}</p>
      {#if onDetailRetry}
        <button class="retry" onclick={onDetailRetry}>{m.session_detail_retry()}</button>
      {/if}
    </div>
  {:else}
    <p class="loading">{m.session_detail_loading()}</p>
  {/if}

  <div class="card-actions">
    {#if detail && session.status === 'active'}
      <button
        disabled={actionDisabled || pauseBlockedByJobs}
        title={pauseBlockedByJobs ? m.session_pause_blocked_hint() : undefined}
        onclick={handlePause}
      >
        <Pause size={14} />{pendingCommand === 'pause' ? m.session_pausing() : m.session_pause()}
      </button>
      <button
        disabled={actionDisabled || attachableModels.length === 0}
        title={attachableModels.length === 0 ? m.session_attach_empty() : undefined}
        onclick={() => (attachOpen = true)}><Plus size={14} />{m.session_add_model()}</button
      >
    {:else if detail && session.status === 'paused'}
      <button disabled={actionDisabled} onclick={handleResume}>
        <Play size={14} />{pendingCommand === 'resume' ? m.session_resuming() : m.session_resume()}
      </button>
    {/if}
    {#if !terminal && session.status !== 'stopping'}
      <button class="stop" disabled={actionDisabled} onclick={() => onStop(session.id)}
        ><Square size={14} />{m.session_stop()}</button
      >
    {:else}
      <button class="stop" disabled
        ><Square size={14} />{session.status === 'stopping'
          ? m.session_stopping()
          : m.session_stop()}</button
      >
    {/if}
  </div>
  {#if pauseBlockedByJobs}
    <small class="pause-hint">{m.session_pause_blocked_hint()}</small>
  {/if}
</article>

{#if attachOpen}
  <AttachDeploymentSheet
    models={attachableModels}
    pending={pendingCommand === 'attach'}
    onAttach={handleAttach}
    onClose={closeAttach}
  />
{/if}
{#if currentRemovalTarget}
  <RemoveDeploymentModal
    modelName={modelName(currentRemovalTarget)}
    finalLive={selectedRemovalRequiresForce}
    pending={pendingCommand === 'remove'}
    onConfirm={handleRemove}
    onClose={closeRemoval}
  />
{/if}

<style>
  .session-card {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 18px;
    border: 1px solid var(--apex-border);
    border-radius: 14px;
    background: var(--apex-surface);
  }
  .card-header {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .card-title-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 10px;
  }
  .card-model {
    min-width: 0;
    color: var(--apex-text);
    overflow-wrap: anywhere;
  }
  .card-header small,
  .loading {
    color: var(--apex-text-muted);
    font-size: 12px;
    margin: 0;
  }
  .session-error {
    margin: 0;
    font-size: 13px;
    color: var(--apex-danger);
    overflow-wrap: anywhere;
  }
  .detail-error {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .retry {
    border: 1px solid var(--apex-border);
    border-radius: 7px;
    padding: 6px 10px;
    background: transparent;
    color: var(--apex-text);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .deployments {
    display: grid;
    gap: 9px;
  }
  .card-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .card-actions button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    border: 1px solid var(--apex-border);
    border-radius: 8px;
    background: transparent;
    color: var(--apex-text);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
  .card-actions .stop {
    color: var(--apex-danger);
  }
  .card-actions button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .pause-hint {
    margin: 0;
    font-size: 12px;
    color: var(--apex-text-muted);
  }
</style>
