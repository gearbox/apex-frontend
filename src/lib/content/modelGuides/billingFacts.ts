import type { components } from '$lib/api/types';
import type { GenerationMode } from '$lib/stores/generation';
import { findPricingRule } from '$lib/utils/pricing';
import { GENERATION_MODES, isGenerationMode, isModelType } from '$lib/utils/generationModes';
import type { ProvisioningMode } from '$lib/utils/sessionState';

type ModelInfo = components['schemas']['ModelInfo'];
type PricingRuleResponse = components['schemas']['PricingRuleResponse'];

export interface ModelModeCost {
  readonly mode: GenerationMode;
  /** null means no active matching pricing rule was found. */
  readonly tokens: number | null;
}

export interface ModelBillingFacts {
  readonly costs: readonly ModelModeCost[];
  readonly billedBySession: boolean;
}

export function deriveModelBillingFacts(params: {
  modelInfo: ModelInfo | null;
  provider: string | null;
  provisioningMode: ProvisioningMode | null;
  pricing: PricingRuleResponse[];
}): ModelBillingFacts {
  const { modelInfo, provider, provisioningMode, pricing } = params;
  const modelKey = modelInfo?.model_key;
  if (!modelInfo || !provider || !modelKey || !isModelType(modelKey)) {
    return { costs: [], billedBySession: false };
  }

  const supportedModes = new Set(
    modelInfo.capabilities.filter((capability): capability is GenerationMode =>
      isGenerationMode(capability),
    ),
  );

  return {
    costs: GENERATION_MODES.filter((mode) => supportedModes.has(mode)).map((mode) => ({
      mode,
      tokens: findPricingRule(pricing, provider, modelKey, mode)?.token_cost ?? null,
    })),
    billedBySession: provisioningMode === 'on_demand',
  };
}
