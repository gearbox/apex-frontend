import { describe, expect, it } from 'vitest';
import type { components } from '$lib/api/types';
import { findPricingRule, lookupCost } from './pricing';

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
  it('prefers a provider, model, and mode match', () => {
    const generic = rule();
    const specific = rule({ model: 'grok-imagine-image', token_cost: 24 });

    expect(findPricingRule([generic, specific], 'grok', 'grok-imagine-image', 't2i')).toBe(
      specific,
    );
  });

  it('falls back to a provider and mode rule', () => {
    const byType = rule({ token_cost: 18 });

    expect(findPricingRule([byType], 'grok', 'grok-imagine-image', 't2i')).toBe(byType);
  });

  it('falls back to a provider and model rule', () => {
    const byModel = rule({ model: 'grok-imagine-image', generation_type: '', token_cost: 16 });

    expect(findPricingRule([byModel], 'grok', 'grok-imagine-image', 't2i')).toBe(byModel);
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

  it('preserves lookupCost fallback semantics', () => {
    expect(lookupCost([], 'grok', 'grok-imagine-image', 't2i')).toBe(0);
    expect(lookupCost([rule({ token_cost: 0 })], 'grok', 'grok-imagine-image', 't2i')).toBe(0);
  });
});
