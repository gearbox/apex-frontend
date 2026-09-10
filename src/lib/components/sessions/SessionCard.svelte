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
  import {
    attachDeploymentMutationOptions,
    pauseSessionMutationOptions,
    removeDeploymentMutationOptions,
    resumeSessionMutationOptions,
  } from '$lib/queries/sessions';
  import { addToast } from '$lib/stores/toasts';
  import { parseApiError } from '$lib/api/errors';
  import OperationProgress from './OperationProgress.svelte';
  import DeploymentRow from './DeploymentRow.svelte';
  import AttachDeploymentSheet from './AttachDeploymentSheet.svelte';
  import RemoveDeploymentModal from './RemoveDeploymentModal.svelte';
  import * as m from '$paraglide/messages';

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
  let attachSubmitting = $state(false);
  let removalSubmitting = $state(false);

  const inferredDetailState = $derived('user_id' in session ? 'loaded' : 'loading');
  const resolvedDetailState = $derived(detailState ?? inferredDetailState);
  const detail = $derived(
    resolvedDetailState === 'loaded' ? (session as GpuSessionResponse) : null,
  );
  const deployments = $derived(detail?.deployments ?? []);
  const terminal = $derived(session.status === 'stopped' || session.status === 'failed');
  const lifecyclePending = $derived(pauseMutation.isPending || resumeMutation.isPending);
  const attachPending = $derived(attachSubmitting || attachMutation.isPending);
  const removePending = $derived(removalSubmitting || removeMutation.isPending);
  const actionDisabled = $derived(
    lifecyclePending ||
      removePending ||
      session.status === 'resuming' ||
      session.status === 'stopping' ||
      terminal,
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

  let uptimeNow = $state(Date.now());

  function timestampMs(value: string | null | undefined): number | null {
    if (!value) return null;
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }

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

  function operationError(error: unknown): void {
    addToast({
      type: 'error',
      message: parseApiError(error, 0).message || m.session_action_failed(),
    });
  }
  function handleAttach(model: AttachModelOption['model']): void {
    if (!detail || attachPending) return;
    attachSubmitting = true;
    attachMutation.mutate(
      { sessionId: session.id, model },
      {
        onSuccess: () => {
          attachSubmitting = false;
          attachOpen = false;
        },
        onError: (error) => {
          attachSubmitting = false;
          operationError(error);
        },
      },
    );
  }
  function handleRemove(): void {
    if (!currentRemovalTarget || removePending) return;
    // A dialog may have opened before an SSE/REST update changed either status. Re-read the
    // current detailed snapshot immediately before issuing DELETE.
    if (!canRemoveDeployment(session.status, currentRemovalTarget.status)) {
      removalTarget = null;
      return;
    }
    removalSubmitting = true;
    removeMutation.mutate(
      {
        sessionId: session.id,
        deploymentId: currentRemovalTarget.id,
        force: requiresForceToRemoveDeployment(deployments, currentRemovalTarget.id),
      },
      {
        onSuccess: () => {
          removalSubmitting = false;
          removalTarget = null;
        },
        onError: (error) => {
          removalSubmitting = false;
          operationError(error);
        },
      },
    );
  }
  function openRemoval(target: DeploymentResponse): void {
    if (!removePending && canRemoveDeployment(session.status, target.status)) {
      removalTarget = target;
    }
  }
  function closeRemoval(): void {
    if (!removePending) removalTarget = null;
  }
  function closeAttach(): void {
    if (!attachPending) attachOpen = false;
  }
  function modelName(deployment: { model_type: string }): string {
    return modelNames[deployment.model_type] ?? deployment.model_type;
  }
  function sessionStatusLabel(status: string): string {
    const labels: Record<string, () => string> = {
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
    return labels[status]?.() ?? status;
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

  {#if detail?.bootstrap_operation?.id}
    <OperationProgress
      sessionId={session.id}
      operationId={detail.bootstrap_operation.id}
      bootstrapOperationId={detail.bootstrap_operation.id}
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
          {removePending}
          removingTarget={removePending && currentRemovalTarget?.id === deployment.id}
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
        disabled={actionDisabled}
        onclick={() => pauseMutation.mutate(session.id, { onError: operationError })}
      >
        <Pause size={14} />{pauseMutation.isPending ? m.session_pausing() : m.session_pause()}
      </button>
      {#if detail}<button
          disabled={actionDisabled || attachPending}
          onclick={() => (attachOpen = true)}><Plus size={14} />{m.session_add_model()}</button
        >{/if}
    {:else if detail && session.status === 'paused'}
      <button
        disabled={actionDisabled}
        onclick={() => resumeMutation.mutate(session.id, { onError: operationError })}
      >
        <Play size={14} />{resumeMutation.isPending ? m.session_resuming() : m.session_resume()}
      </button>
    {/if}
    {#if !terminal && session.status !== 'stopping'}
      <button
        class="stop"
        disabled={actionDisabled || attachPending}
        onclick={() => onStop(session.id)}><Square size={14} />{m.session_stop()}</button
      >
    {:else}
      <button class="stop" disabled
        ><Square size={14} />{session.status === 'stopping'
          ? m.session_stopping()
          : m.session_stop()}</button
      >
    {/if}
  </div>
</article>

{#if attachOpen}
  <AttachDeploymentSheet
    models={attachableModels}
    pending={attachPending}
    onAttach={handleAttach}
    onClose={closeAttach}
  />
{/if}
{#if currentRemovalTarget}
  <RemoveDeploymentModal
    modelName={modelName(currentRemovalTarget)}
    finalLive={selectedRemovalRequiresForce}
    pending={removePending}
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
</style>
