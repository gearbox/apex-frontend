import type { components } from '$lib/api/types';

type Provider = components['schemas']['schemas_providers_ProviderInfo'];
type Deployment = components['schemas']['DeploymentResponse'];
type SessionStatus = components['schemas']['GpuSessionStatus'];
type DeploymentStatus = components['schemas']['DeploymentStatus'];

export interface AttachModelOption {
  model: components['schemas']['ModelType'];
  name: string;
}

export interface ModelProvisioningHints {
  typicalBootstrapSeconds: number | null;
  typicalAttachSeconds: number | null;
}

/**
 * Mirrors the backend's removal transition guard. A deployment can only begin removal while its
 * parent session and the deployment itself are both active.
 */
export function canRemoveDeployment(
  sessionStatus: SessionStatus,
  deploymentStatus: DeploymentStatus,
): boolean {
  return sessionStatus === 'active' && deploymentStatus === 'active';
}

/**
 * Mirrors the backend's atomic `last_deployment_requires_force` guard. Only another *active*
 * deployment avoids force; deploying, removing, removed, and failed siblings do not.
 *
 * Callers must separately check `canRemoveDeployment()` before offering or executing removal.
 * Returning false for a missing/ineligible target keeps this helper safe for stale modal state.
 */
export function requiresForceToRemoveDeployment(
  deployments: Deployment[],
  targetId: string,
): boolean {
  const target = deployments.find((deployment) => deployment.id === targetId);
  if (!target || target.status !== 'active') return false;

  return !deployments.some(
    (deployment) => deployment.id !== targetId && deployment.status === 'active',
  );
}

/**
 * Filters only against metadata the API exposes: provider availability/mode, model enablement,
 * and runtime occupancy. Compatibility across providers (e.g. bundle/model resolution) remains
 * entirely backend-authoritative — the attach service enforces no same-provider-family rule, so
 * this must not invent one either. See R2 review item 8.
 */
export function eligibleAttachModels(
  providers: Provider[],
  deployments: Deployment[],
): AttachModelOption[] {
  const modelInSession = new Set(
    deployments
      .filter((deployment) => deployment.status !== 'removed' && deployment.status !== 'failed')
      .map((deployment) => deployment.model_type),
  );

  return providers.flatMap((provider) => {
    if (!provider.available || provider.provisioning_mode !== 'on_demand') {
      return [];
    }
    return provider.models.flatMap((model) =>
      model.is_enabled &&
      model.runtime?.state === 'none' &&
      !modelInSession.has(model.model_key as components['schemas']['ModelType'])
        ? [{ model: model.model_key as components['schemas']['ModelType'], name: model.name }]
        : [],
    );
  });
}

export function modelNameByType(providers: Provider[]): Map<string, string> {
  return new Map(
    providers.flatMap((provider) => provider.models.map((model) => [model.model_key, model.name])),
  );
}

/** Provider metadata remains independent from session snapshots; it only supplies display hints. */
export function provisioningHintsByModelType(
  providers: Provider[],
): Map<string, ModelProvisioningHints> {
  return new Map(
    providers.flatMap((provider) =>
      provider.models.map((model) => [
        model.model_key,
        {
          typicalBootstrapSeconds: model.provisioning?.typical_bootstrap_seconds ?? null,
          typicalAttachSeconds: model.provisioning?.typical_attach_seconds ?? null,
        },
      ]),
    ),
  );
}
