import type { components } from '$lib/api/types';

type Provider = components['schemas']['schemas_providers_ProviderInfo'];
type Deployment = components['schemas']['DeploymentResponse'];

export interface AttachModelOption {
  model: components['schemas']['ModelType'];
  name: string;
}

/**
 * Filters only against metadata the API exposes. Compatibility remains backend-authoritative.
 * When a deployment's provider cannot be discovered, keeping all otherwise eligible providers is
 * safer than inventing a family rule.
 */
export function eligibleAttachModels(
  providers: Provider[],
  deployments: Deployment[],
): AttachModelOption[] {
  const providerByModel = new Map(
    providers.flatMap((provider) =>
      provider.models.map((model) => [model.model_key, provider.provider]),
    ),
  );
  const knownFamilies = new Set(
    deployments
      .map((deployment) => providerByModel.get(deployment.model_type))
      .filter((provider): provider is string => Boolean(provider)),
  );
  const modelInSession = new Set(
    deployments
      .filter((deployment) => deployment.status !== 'removed' && deployment.status !== 'failed')
      .map((deployment) => deployment.model_type),
  );

  return providers.flatMap((provider) => {
    if (
      !provider.available ||
      provider.provisioning_mode !== 'on_demand' ||
      (knownFamilies.size > 0 && !knownFamilies.has(provider.provider))
    ) {
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
