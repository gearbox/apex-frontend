import type { components } from '../../../src/lib/api/types';
import {
  makeAishaImageModelInfo,
  makeGrokImageModelInfo,
} from '../../../src/mocks/factories/providers';

type ModelInfo = components['schemas']['ModelInfo'];
type ModelRuntimeResponse = components['schemas']['ModelRuntimeResponse'];
type ModelProvisioningHintResponse = components['schemas']['ModelProvisioningHintResponse'];
type ProviderInfo = components['schemas']['schemas_providers_ProviderInfo'];
type ProvidersResponse = components['schemas']['ProvidersResponse'];
type RuntimeState = components['schemas']['RuntimeState'];

export function makeModelRuntime(
  state: RuntimeState = 'none',
  overrides: Partial<ModelRuntimeResponse> = {},
): ModelRuntimeResponse {
  const hasSession = state !== 'none';
  return {
    state,
    session_id: hasSession ? 'sess_mock' : null,
    deployment_id: hasSession ? 'deploy_mock' : null,
    operation_id: state === 'provisioning' ? 'op_mock' : null,
    ...overrides,
  };
}

export function makeProvidersResponse(providers: ProviderInfo[]): ProvidersResponse {
  return { providers, user_context: null };
}

interface AishaProviderOptions {
  available?: boolean;
  model?: Partial<ModelInfo>;
  models?: ModelInfo[];
  provisioning?: Partial<ModelProvisioningHintResponse> | null;
  runtime?: ModelRuntimeResponse;
}

/**
 * Contract-shaped on-demand Aisha response for focused E2E tests. Model defaults come from the
 * repository's typed factories, so its open-ended `generation_modes` map and source constraints
 * cannot drift into the obsolete capabilities-array fixture shape.
 */
export function makeAishaProviderResponse({
  available = true,
  model = {},
  models,
  provisioning,
  runtime = makeModelRuntime(),
}: AishaProviderOptions = {}): ProvidersResponse {
  const primaryModel = makeAishaImageModelInfo({
    runtime,
    provisioning:
      provisioning === null
        ? null
        : {
            typical_bootstrap_seconds: 600,
            typical_attach_seconds: 360,
            ...provisioning,
          },
    ...model,
  });
  return makeProvidersResponse([
    {
      provider: 'aisha',
      name: 'Aisha',
      available,
      provisioning_mode: 'on_demand',
      models: models ?? [primaryModel],
    },
  ]);
}

interface GrokProviderOptions {
  available?: boolean;
  models?: ModelInfo[];
}

export function makeGrokProviderResponse({
  available = true,
  models = [makeGrokImageModelInfo()],
}: GrokProviderOptions = {}): ProvidersResponse {
  return makeProvidersResponse([
    {
      provider: 'grok',
      name: 'xAI Grok',
      available,
      provisioning_mode: 'always_on',
      models,
    },
  ]);
}
