import type { components } from '$lib/api/types';
import type { GenerationMode } from '$lib/stores/generation';
import { findPricingRule } from '$lib/utils/pricing';
import { createSupportedModes } from '$lib/utils/generationModes';
import type { ProvisioningMode } from '$lib/utils/sessionState';

type ModelInfo = components['schemas']['ModelInfo'];
type PricingRuleResponse = components['schemas']['PricingRuleResponse'];

export interface ModelModePricing {
  readonly mode: GenerationMode;
  /** null means no active matching pricing rule was found. */
  readonly tokenCost: number | null;
  /** null means no active matching pricing rule was found. */
  readonly inputTokenCost: number | null;
}

export interface ModelBillingFacts {
  readonly costs: readonly ModelModePricing[];
  readonly billedBySession: boolean;
}

export function deriveModelBillingFacts(params: {
  modelInfo: ModelInfo | null;
  provider: string | null;
  provisioningMode: ProvisioningMode | null;
  pricing: PricingRuleResponse[];
  nowMs: number;
}): ModelBillingFacts {
  const { modelInfo, provider, provisioningMode, pricing, nowMs } = params;
  const modelKey = modelInfo?.model_key;
  if (!modelInfo || !provider || !modelKey) {
    return { costs: [], billedBySession: false };
  }

  return {
    costs: createSupportedModes(modelInfo).map((mode) => {
      // The generated API type currently has a closed model enum, while
      // discovery intentionally remains open-ended. This is only an external
      // typing boundary, not a frontend model registry.
      const rule = findPricingRule(
        pricing,
        provider,
        modelKey as components['schemas']['ModelType'],
        mode,
        nowMs,
      );
      return {
        mode,
        tokenCost: rule?.token_cost ?? null,
        inputTokenCost: rule?.input_token_cost ?? null,
      };
    }),
    billedBySession: provisioningMode === 'on_demand',
  };
}
