<script lang="ts">
  import { createMutation, useQueryClient } from '@tanstack/svelte-query';
  import { Pause, Play, Plus, Square } from '@lucide/svelte';
  import StatusBadge from '$lib/components/shared/StatusBadge.svelte';
  import type {
    GpuSessionListItemResponse,
    GpuSessionResponse,
    DeploymentResponse,
  } from '$lib/api/sessions';
  import type { AttachModelOption } from '$lib/utils/deploymentEligibility';
  import {
    attachDeploymentMutationOptions,
    pauseSessionMutationOptions,
    removeDeploymentMutationOptions,
    resumeSessionMutationOptions,
  } from '$lib/queries/sessions';
  import { isLastLiveDeployment } from '$lib/utils/operationDisplay';
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
    onStop: (id: string) => void;
  }

  let { session, modelNames = {}, attachableModels = [], onStop }: Props = $props();
  const queryClient = useQueryClient();
  const pauseMutation = createMutation(() => pauseSessionMutationOptions(queryClient));
  const resumeMutation = createMutation(() => resumeSessionMutationOptions(queryClient));
  const attachMutation = createMutation(() => attachDeploymentMutationOptions(queryClient));
  const removeMutation = createMutation(() => removeDeploymentMutationOptions(queryClient));

  let attachOpen = $state(false);
  let removalTarget = $state<DeploymentResponse | null>(null);

  const isDetailed = $derived('user_id' in session);
  const detail = $derived(isDetailed ? (session as GpuSessionResponse) : null);
  const deployments = $derived(detail?.deployments ?? []);
  const terminal = $derived(session.status === 'stopped' || session.status === 'failed');
  const lifecyclePending = $derived(pauseMutation.isPending || resumeMutation.isPending);
  const actionDisabled = $derived(lifecyclePending || session.status === 'stopping' || terminal);
  const selectedRemovalIsLastLive = $derived(
    removalTarget ? isLastLiveDeployment(deployments, removalTarget.id) : false,
  );

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
    attachMutation.mutate(
      { sessionId: session.id, model },
      {
        onSuccess: () => {
          attachOpen = false;
        },
        onError: operationError,
      },
    );
  }
  function handleRemove(): void {
    if (!removalTarget) return;
    removeMutation.mutate(
      { sessionId: session.id, deploymentId: removalTarget.id, force: selectedRemovalIsLastLive },
      {
        onSuccess: () => {
          removalTarget = null;
        },
        onError: operationError,
      },
    );
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
  function formatUptime(startedAt: string): string {
    const seconds = Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }
</script>

<article class="session-card">
  <header class="card-header">
    <div class="card-title-row">
      <div class="card-model">
        <strong>{(session.deployments ?? []).map(modelName).join(', ')}</strong>
      </div>
      <StatusBadge
        status={sessionStatusLabel(session.status)}
        color={SESSION_COLOR_MAP[session.status]}
      />
    </div>
    {#if detail?.vastai_gpu_name}<small>{detail.vastai_gpu_name}</small>{/if}
    {#if detail?.status === 'active' && detail.started_at}<small
        >{m.session_uptime()}: {formatUptime(detail.started_at)}</small
      >{/if}
    {#if detail?.error_message}<p class="session-error">{detail.error_message}</p>{/if}
  </header>

  {#if detail?.bootstrap_operation?.id}
    <OperationProgress sessionId={session.id} operationId={detail.bootstrap_operation.id} />
  {/if}

  {#if detail}
    <div class="deployments" aria-label={m.session_deployments_label()}>
      {#each deployments as deployment (deployment.id)}
        <DeploymentRow
          sessionId={session.id}
          {deployment}
          modelName={modelName(deployment)}
          typicalAttachSeconds={null}
          removing={removeMutation.isPending && removalTarget?.id === deployment.id}
          onRemove={(target) => (removalTarget = target)}
        />
      {/each}
    </div>
  {:else}
    <p class="loading">{m.session_detail_loading()}</p>
  {/if}

  <div class="card-actions">
    {#if session.status === 'active'}
      <button
        disabled={actionDisabled}
        onclick={() => pauseMutation.mutate(session.id, { onError: operationError })}
      >
        <Pause size={14} />{pauseMutation.isPending ? m.session_pausing() : m.session_pause()}
      </button>
      {#if detail}<button disabled={attachMutation.isPending} onclick={() => (attachOpen = true)}
          ><Plus size={14} />{m.session_add_model()}</button
        >{/if}
    {:else if session.status === 'paused'}
      <button
        disabled={actionDisabled}
        onclick={() => resumeMutation.mutate(session.id, { onError: operationError })}
      >
        <Play size={14} />{resumeMutation.isPending ? m.session_resuming() : m.session_resume()}
      </button>
    {/if}
    {#if !terminal && session.status !== 'stopping'}
      <button class="stop" disabled={lifecyclePending} onclick={() => onStop(session.id)}
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
</article>

{#if attachOpen}
  <AttachDeploymentSheet
    models={attachableModels}
    pending={attachMutation.isPending}
    onAttach={handleAttach}
    onClose={() => (attachOpen = false)}
  />
{/if}
{#if removalTarget}
  <RemoveDeploymentModal
    modelName={modelName(removalTarget)}
    finalLive={selectedRemovalIsLastLive}
    pending={removeMutation.isPending}
    onConfirm={handleRemove}
    onClose={() => (removalTarget = null)}
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
