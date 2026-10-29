import { videoResolutionValues } from '$lib/api/types';
import { isVideoMode } from '$lib/utils/generationModes';
import type { components } from '$lib/api/types';
import type { GenerationMode } from '$lib/stores/generation';
import { findPricingRule } from '$lib/utils/pricing';
import { createSupportedModes } from '$lib/utils/generationModes';
import type { ProvisioningMode } from '$lib/utils/sessionState';

type ModelInfo = components['schemas']['ModelInfo'];
type PricingRuleResponse = components['schemas']['PricingRuleResponse'];
type VideoResolution = components['schemas']['VideoResolution'];

export type ModelModePricing =
  | {
      readonly kind: 'flat';
      readonly mode: GenerationMode;
      /** null means no active matching pricing rule was found. */
      readonly tokenCost: number | null;
      /** null means no active matching pricing rule was found. */
      readonly inputTokenCost: number | null;
    }
  | {
      readonly kind: 'video';
      readonly mode: GenerationMode;
      readonly groups: readonly {
        readonly resolutions: readonly VideoResolution[];
        readonly rule: PricingRuleResponse | null;
      }[];
    };

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
      const model = modelKey as components['schemas']['ModelType'];
      const video = isVideoMode(mode) ? modelInfo.video : null;
      if (video) {
        const groupsByRule = new Map<
          string | null,
          { resolutions: VideoResolution[]; rule: PricingRuleResponse | null }
        >();

        for (const resolution of videoResolutionValues) {
          if (!video.resolutions.includes(resolution)) continue;
          const rule = findPricingRule(pricing, provider, model, mode, resolution, nowMs);
          const key = rule?.id ?? null;
          const group = groupsByRule.get(key);
          if (group) {
            group.resolutions.push(resolution);
          } else {
            groupsByRule.set(key, { resolutions: [resolution], rule });
          }
        }

        const groups = [...groupsByRule.values()];
        const unpricedIndex = groups.findIndex((group) => group.rule === null);
        if (unpricedIndex !== -1) groups.push(groups.splice(unpricedIndex, 1)[0]);

        return { kind: 'video', mode, groups };
      }

      const rule = findPricingRule(pricing, provider, model, mode, null, nowMs);
      return {
        kind: 'flat',
        mode,
        tokenCost: rule?.token_cost ?? null,
        inputTokenCost: rule?.input_token_cost ?? null,
      };
    }),
    billedBySession: provisioningMode === 'on_demand',
  };
}
