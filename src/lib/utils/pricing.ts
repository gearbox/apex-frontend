import type { components } from '$lib/api/types';
import type { GenerationMode } from '$lib/stores/generation';

type ModelType = components['schemas']['ModelType'];
type PricingRuleResponse = components['schemas']['PricingRuleResponse'];

/**
 * Look up the token cost for a given provider/model/mode combination.
 * Returns 0 if no matching rule is found.
 */
export function lookupCost(
  pricing: PricingRuleResponse[],
  provider: string,
  model: ModelType,
  mode: GenerationMode,
): number {
  // Most specific match first: provider + model + generation_type
  const specific = pricing.find(
    (r) => r.is_active && r.provider === provider && r.model === model && r.generation_type === mode,
  );
  if (specific) return specific.token_cost;

  // Provider + generation_type (no model constraint)
  const byType = pricing.find(
    (r) => r.is_active && r.provider === provider && !r.model && r.generation_type === mode,
  );
  if (byType) return byType.token_cost;

  // Provider + model (any type)
  const byModel = pricing.find(
    (r) => r.is_active && r.provider === provider && r.model === model && !r.generation_type,
  );
  if (byModel) return byModel.token_cost;

  return 0;
}
