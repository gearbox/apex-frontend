import { videoResolutionValues } from '$lib/api/types';
import { isVideoMode } from '$lib/utils/generationModes';
import type { components } from '$lib/api/types';
import type { GenerationMode } from '$lib/stores/generation';
import { findPricingRule } from '$lib/utils/pricing';
import { createSupportedModes } from '$lib/utils/generationModes';
import type { ProvisioningMode } from '$lib/utils/sessionState';

type ModelInfo = components['schemas']['ModelInfo'];
type PricingRuleResponse = components['schemas']['PricingRuleResponse'];

export interface ModelModePricing {
  readonly mode: GenerationMode;
  readonly resolutionRows?: readonly { resolution: string | null; rule: PricingRuleResponse }[];
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
        null,
        nowMs,
      );
      return {
        mode,
        ...(isVideoMode(mode) && modelInfo.video
          ? (() => {
              const resolutionRows = videoResolutionValues
                .filter((resolution) => modelInfo.video?.resolutions.includes(resolution))
                .flatMap((resolution) => {
                  const match = findPricingRule(
                    pricing,
                    provider,
                    modelKey as components['schemas']['ModelType'],
                    mode,
                    resolution,
                    nowMs,
                  );
                  return match && match.per_second_token_cost > 0
                    ? [
                        {
                          resolution: match.video_resolution,
                          rule: match,
                        },
                      ]
                    : [];
                });
              return resolutionRows.length
                ? {
                    resolutionRows: resolutionRows.filter(
                      (row, index) =>
                        resolutionRows.findIndex((other) => other.resolution === row.resolution) ===
                        index,
                    ),
                  }
                : {};
            })()
          : {}),
        tokenCost: rule?.token_cost ?? null,
        inputTokenCost: rule?.input_token_cost ?? null,
      };
    }),
    billedBySession: provisioningMode === 'on_demand',
  };
}
