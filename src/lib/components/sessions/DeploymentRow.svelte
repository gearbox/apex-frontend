<script lang="ts">
  import type { DeploymentResponse } from '$lib/api/sessions';
  import type { components } from '$lib/api/types';
  import { canRemoveDeployment } from '$lib/utils/deploymentEligibility';
  import OperationProgress from './OperationProgress.svelte';
  import * as m from '$paraglide/messages';

  interface Props {
    sessionId: string;
    sessionStatus: components['schemas']['GpuSessionStatus'];
    deployment: DeploymentResponse;
    modelName: string;
    typicalAttachSeconds?: number | null;
    removePending?: boolean;
    removingTarget?: boolean;
    onRemove: (deployment: DeploymentResponse) => void;
  }
  let {
    sessionId,
    sessionStatus,
    deployment,
    modelName,
    typicalAttachSeconds = null,
    removePending = false,
    removingTarget = false,
    onRemove,
  }: Props = $props();
  const canRemove = $derived(canRemoveDeployment(sessionStatus, deployment.status));
</script>

<article class="deployment" class:failed={deployment.status === 'failed'}>
  <div class="topline">
    <div class="name"><strong>{modelName}</strong><small>{deployment.model_type}</small></div>
    <div class="badges">
      {#if deployment.is_primary}<span>{m.deployment_primary()}</span>{/if}
      <span
        >{deployment.status === 'deploying'
          ? m.deployment_status_deploying()
          : deployment.status === 'active'
            ? m.deployment_status_active()
            : deployment.status === 'removing'
              ? m.deployment_status_removing()
              : deployment.status === 'removed'
                ? m.deployment_status_removed()
                : m.deployment_status_failed()}</span
      >
    </div>
  </div>
  {#if deployment.bundle_version}<small class="bundle"
      >{m.deployment_bundle({ version: deployment.bundle_version })}</small
    >{/if}
  {#if deployment.pending_restart}<small class="restart">{m.deployment_pending_restart()}</small
    >{/if}
  {#if deployment.current_operation?.id}
    <OperationProgress
      {sessionId}
      operationId={deployment.current_operation.id}
      compact={deployment.status === 'active'}
      {typicalAttachSeconds}
    />
  {/if}
  {#if canRemove}
    <button class="remove" disabled={removePending} onclick={() => onRemove(deployment)}
      >{removingTarget ? m.common_loading() : m.deployment_remove()}</button
    >
  {/if}
</article>

<style>
  .deployment {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 13px;
    border: 1px solid var(--apex-border);
    border-radius: 10px;
    background: var(--apex-bg);
  }
  .deployment.failed {
    border-color: color-mix(in srgb, var(--apex-danger) 50%, var(--apex-border));
  }
  .topline,
  .badges,
  .name {
    display: flex;
    min-width: 0;
    gap: 8px;
    align-items: baseline;
    flex-wrap: wrap;
  }
  .name {
    flex: 1;
    flex-direction: column;
    gap: 2px;
  }
  .name strong {
    color: var(--apex-text);
    overflow-wrap: anywhere;
  }
  .name small,
  .bundle {
    color: var(--apex-text-muted);
    overflow-wrap: anywhere;
  }
  .badges span {
    color: var(--apex-text-muted);
    font-size: 11px;
  }
  .restart {
    color: var(--apex-warning);
  }
  .remove {
    align-self: flex-end;
    border: 1px solid var(--apex-border);
    border-radius: 7px;
    padding: 6px 10px;
    background: transparent;
    color: var(--apex-danger);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .remove:disabled {
    opacity: 0.55;
    cursor: wait;
  }
</style>
