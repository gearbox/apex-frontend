import type { components } from '$lib/api/types';
import type { GenerationMode } from '$lib/stores/generation';

type ModelType = components['schemas']['ModelType'];
type PricingRuleResponse = components['schemas']['PricingRuleResponse'];

/** Mirrors the backend's active-window predicate for cached pricing data. */
export function isPricingRuleEffective(rule: PricingRuleResponse, nowMs = Date.now()): boolean {
  const from = Date.parse(rule.effective_from);
  const until = rule.effective_until ? Date.parse(rule.effective_until) : null;

  return rule.is_active && from <= nowMs && (until === null || until > nowMs);
}

function newestEffectiveRule(rules: readonly PricingRuleResponse[]): PricingRuleResponse | null {
  return rules.reduce<PricingRuleResponse | null>((newest, rule) => {
    if (newest === null) return rule;
    return Date.parse(rule.effective_from) > Date.parse(newest.effective_from) ? rule : newest;
  }, null);
}

/**
 * Find the active price rule for a provider/model/mode combination.
 *
 * This mirrors the backend quote lookup: exact model rules take precedence,
 * then model-null rules are used as a wildcard. Within either tier, the most
 * recently effective rule wins.
 */
export function findPricingRule(
  pricing: readonly PricingRuleResponse[],
  provider: string,
  model: ModelType,
  mode: GenerationMode,
  nowMs = Date.now(),
): PricingRuleResponse | null {
  const candidates = pricing.filter(
    (rule) =>
      isPricingRuleEffective(rule, nowMs) &&
      rule.provider === provider &&
      rule.generation_type === mode,
  );
  const exact = newestEffectiveRule(candidates.filter((rule) => rule.model === model));
  if (exact) return exact;

  return newestEffectiveRule(candidates.filter((rule) => rule.model === null));
}

/**
 * Look up the token cost for a given provider/model/mode combination.
 * Returns 0 if no matching rule is found.
 */
export function lookupCost(
  pricing: readonly PricingRuleResponse[],
  provider: string,
  model: ModelType,
  mode: GenerationMode,
): number {
  return findPricingRule(pricing, provider, model, mode)?.token_cost ?? 0;
}

/** Mirrors the backend generation quote formula. */
export function estimatePricingRuleCost(
  rule: PricingRuleResponse,
  params: {
    outputCount: number;
    inputImageCount: number;
  },
): number {
  if (params.outputCount < 1) {
    throw new RangeError('outputCount must be at least 1');
  }
  if (params.inputImageCount < 0) {
    throw new RangeError('inputImageCount must not be negative');
  }

  return (rule.token_cost + rule.input_token_cost * params.inputImageCount) * params.outputCount;
}
