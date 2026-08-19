import type { components } from '$lib/api/types';
import type { GenerationMode } from '$lib/stores/generation';

type ModelType = components['schemas']['ModelType'];
type PricingRuleResponse = components['schemas']['PricingRuleResponse'];

/**
 * Find the active price rule for a provider/model/mode combination.
 *
 * The fallback order is intentionally shared with the legacy cost lookup so a
 * known zero-cost rule remains distinguishable from a missing rule.
 */
export function findPricingRule(
  pricing: PricingRuleResponse[],
  provider: string,
  model: ModelType,
  mode: GenerationMode,
): PricingRuleResponse | null {
  // Most specific match first: provider + model + generation_type
  const specific = pricing.find(
    (r) =>
      r.is_active && r.provider === provider && r.model === model && r.generation_type === mode,
  );
  if (specific) return specific;

  // Provider + generation_type (no model constraint)
  const byType = pricing.find(
    (r) => r.is_active && r.provider === provider && !r.model && r.generation_type === mode,
  );
  if (byType) return byType;

  // Provider + model (any type)
  const byModel = pricing.find(
    (r) => r.is_active && r.provider === provider && r.model === model && !r.generation_type,
  );
  if (byModel) return byModel;

  return null;
}

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
  return findPricingRule(pricing, provider, model, mode)?.token_cost ?? 0;
}
