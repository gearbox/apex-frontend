import type { components } from '$lib/api/types';
import { formatNumber } from './format';
import { isVideoMode } from './generationModes';
import { normalizeVideoParams, videoLimits } from './videoParams';
import type { GenerationState, GenerationMode } from '$lib/stores/generation';
import * as m from '$paraglide/messages';

type ModelType = components['schemas']['ModelType'];
type PricingRuleResponse = components['schemas']['PricingRuleResponse'];
type PricingRuleDisplay = Pick<
  PricingRuleResponse,
  'token_cost' | 'input_token_cost' | 'per_second_token_cost' | 'video_resolution'
>;

/** Formats every non-zero component of a pricing rule in a stable order. */
export function formatPricingRule(rule: PricingRuleDisplay): string {
  const parts: string[] = [];
  if (rule.token_cost > 0) {
    parts.push(m.pricing_part_flat({ tokens: formatNumber(rule.token_cost) }));
  }
  if (rule.input_token_cost > 0) {
    parts.push(m.pricing_part_per_source({ tokens: formatNumber(rule.input_token_cost) }));
  }
  if (rule.per_second_token_cost > 0) {
    parts.push(m.pricing_part_per_second({ tokens: formatNumber(rule.per_second_token_cost) }));
  }
  if (parts.length === 0)
    parts.push(m.pricing_part_flat({ tokens: formatNumber(rule.token_cost) }));

  const resolution =
    rule.video_resolution ?? (rule.per_second_token_cost > 0 ? m.pricing_any_resolution() : null);
  return `${parts.map((part, index) => (index > 0 ? `+ ${part}` : part)).join(' ')}${resolution ? ` · ${resolution}` : ''}`;
}

/** Mirrors the backend's active-window predicate for cached pricing data. */
function isPricingRuleEffective(rule: PricingRuleResponse, nowMs = Date.now()): boolean {
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
 * Rank model+resolution, model only, resolution only, then wildcard.
 * Within each tier the newest effective rule wins. Image requests only
 * consider resolution-less rules.
 */
export function findPricingRule(
  pricing: readonly PricingRuleResponse[],
  provider: string,
  model: ModelType,
  mode: GenerationMode,
  videoResolution: components['schemas']['VideoResolution'] | null = null,
  nowMs = Date.now(),
): PricingRuleResponse | null {
  const candidates = pricing.filter(
    (rule) =>
      isPricingRuleEffective(rule, nowMs) &&
      rule.provider === provider &&
      rule.generation_type === mode &&
      (rule.model === model || rule.model === null) &&
      (rule.video_resolution == null ||
        (videoResolution !== null && rule.video_resolution === videoResolution)),
  );
  for (const [exactModel, exactResolution] of [
    [true, true],
    [true, false],
    [false, true],
    [false, false],
  ]) {
    const match = newestEffectiveRule(
      candidates.filter(
        (rule) =>
          (rule.model !== null) === exactModel &&
          (rule.video_resolution != null) === exactResolution,
      ),
    );
    if (match) return match;
  }
  return null;
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
    billedSeconds?: number | null;
  },
): number | null {
  if ((rule.per_second_token_cost ?? 0) > 0 && params.billedSeconds == null) return null;
  if (params.outputCount < 1) {
    throw new RangeError('outputCount must be at least 1');
  }
  if (params.inputImageCount < 0) {
    throw new RangeError('inputImageCount must not be negative');
  }

  return (
    (rule.token_cost +
      rule.input_token_cost * params.inputImageCount +
      (rule.per_second_token_cost ?? 0) * (params.billedSeconds ?? 0)) *
    params.outputCount
  );
}

export function billedSecondsForRequest(
  state: GenerationState,
  modelInfo: components['schemas']['ModelInfo'] | null,
  mode: GenerationMode,
): number | null {
  if (!isVideoMode(mode)) return 0;
  const limits = videoLimits(modelInfo, mode, state.sourceMedia);
  if (!limits || limits.sourceTooLongToExtend) return null;
  const { duration } = normalizeVideoParams(limits, state.videoDuration, state.videoResolution);
  if (!modelInfo?.video?.bills_input_video_seconds) return duration;
  const clips = state.sourceMedia.filter((source) => source.mediaType === 'video');
  if (clips.some((source) => source.media?.duration_ms == null)) return null;
  return (
    duration + clips.reduce((sum, source) => sum + Math.ceil(source.media!.duration_ms! / 1000), 0)
  );
}
