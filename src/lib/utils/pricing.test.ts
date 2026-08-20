import { describe, expect, it } from 'vitest';
import type { components } from '$lib/api/types';
import { estimatePricingRuleCost, findPricingRule, lookupCost } from './pricing';

type PricingRuleResponse = components['schemas']['PricingRuleResponse'];

function rule(overrides: Partial<PricingRuleResponse> = {}): PricingRuleResponse {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    provider: 'grok',
    generation_type: 't2i',
    model: null,
    token_cost: 12,
    input_token_cost: 0,
    is_active: true,
    effective_from: '2026-01-01T00:00:00Z',
    effective_until: null,
    notes: null,
    ...overrides,
  };
}

describe('findPricingRule', () => {
  it('prefers an exact provider, model, and mode match over a wildcard', () => {
    const generic = rule();
    const specific = rule({ model: 'grok-imagine-image', token_cost: 24 });

    expect(findPricingRule([generic, specific], 'grok', 'grok-imagine-image', 't2i')).toBe(
      specific,
    );
  });

  it('falls back to a provider and mode wildcard rule', () => {
    const byType = rule({ token_cost: 18 });

    expect(findPricingRule([byType], 'grok', 'grok-imagine-image', 't2i')).toBe(byType);
  });

  it('does not match a provider and model rule with a different generation type', () => {
    const byModel = rule({ model: 'grok-imagine-image', generation_type: '', token_cost: 16 });

    expect(findPricingRule([byModel], 'grok', 'grok-imagine-image', 't2i')).toBeNull();
  });

  it('selects the newest exact rule regardless of catalog order', () => {
    const older = rule({ model: 'grok-imagine-image', token_cost: 11 });
    const newer = rule({
      id: '00000000-0000-0000-0000-000000000002',
      model: 'grok-imagine-image',
      token_cost: 24,
      effective_from: '2026-02-01T00:00:00Z',
    });

    expect(findPricingRule([newer, older], 'grok', 'grok-imagine-image', 't2i')).toBe(newer);
    expect(findPricingRule([older, newer], 'grok', 'grok-imagine-image', 't2i')).toBe(newer);
  });

  it('selects the newest wildcard rule regardless of catalog order', () => {
    const older = rule({ token_cost: 11 });
    const newer = rule({
      id: '00000000-0000-0000-0000-000000000002',
      token_cost: 24,
      effective_from: '2026-02-01T00:00:00Z',
    });

    expect(findPricingRule([newer, older], 'grok', 'grok-imagine-image', 't2i')).toBe(newer);
    expect(findPricingRule([older, newer], 'grok', 'grok-imagine-image', 't2i')).toBe(newer);
  });

  it('ignores inactive rules and returns null when no active rule matches', () => {
    const inactive = rule({ model: 'grok-imagine-image', is_active: false });

    expect(findPricingRule([inactive], 'grok', 'grok-imagine-image', 't2i')).toBeNull();
  });

  it('keeps a real zero-cost rule distinct from no rule', () => {
    const freeRule = rule({ model: 'grok-imagine-image', token_cost: 0 });

    expect(findPricingRule([freeRule], 'grok', 'grok-imagine-image', 't2i')?.token_cost).toBe(0);
    expect(findPricingRule([], 'grok', 'grok-imagine-image', 't2i')).toBeNull();
  });

  it('keeps lookupCost as a zero fallback only for callers that need a scalar', () => {
    expect(lookupCost([], 'grok', 'grok-imagine-image', 't2i')).toBe(0);
    expect(lookupCost([rule({ token_cost: 0 })], 'grok', 'grok-imagine-image', 't2i')).toBe(0);
  });
});

describe('estimatePricingRuleCost', () => {
  const pricedRule = rule({ token_cost: 7, input_token_cost: 2 });

  it('estimates one output without an input image', () => {
    expect(estimatePricingRuleCost(pricedRule, { outputCount: 1, inputImageCount: 0 })).toBe(7);
  });

  it('multiplies the base cost for multiple outputs', () => {
    expect(estimatePricingRuleCost(pricedRule, { outputCount: 4, inputImageCount: 0 })).toBe(28);
  });

  it('adds one input image surcharge per output', () => {
    expect(estimatePricingRuleCost(pricedRule, { outputCount: 1, inputImageCount: 1 })).toBe(9);
  });

  it('adds multiple input image surcharges per output', () => {
    expect(estimatePricingRuleCost(pricedRule, { outputCount: 1, inputImageCount: 3 })).toBe(13);
  });

  it('combines input surcharges with multiple outputs', () => {
    expect(estimatePricingRuleCost(pricedRule, { outputCount: 4, inputImageCount: 1 })).toBe(36);
  });
});
