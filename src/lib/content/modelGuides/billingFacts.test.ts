import { describe, expect, it } from 'vitest';
import type { components } from '$lib/api/types';
import { makeModelInfo } from '../../../mocks/factories/providers';
import { isProvisioningMode } from '$lib/utils/sessionState';
import { deriveModelBillingFacts } from './billingFacts';

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

describe('deriveModelBillingFacts', () => {
  it('returns no facts without a model', () => {
    expect(
      deriveModelBillingFacts({
        modelInfo: null,
        provider: null,
        provisioningMode: null,
        pricing: [],
      }),
    ).toEqual({ costs: [], billedBySession: false });
  });

  it('uses generation-mode order, ignores unknown capabilities, and applies all pricing fallbacks', () => {
    const modelInfo = makeModelInfo({
      capabilities: ['t2v', 'not-a-mode', 'i2i', 't2i'],
      model_key: 'grok-imagine-image',
    });
    const facts = deriveModelBillingFacts({
      modelInfo,
      provider: 'grok',
      provisioningMode: 'always_on',
      pricing: [
        rule({ generation_type: 't2i', token_cost: 4 }),
        rule({ model: 'grok-imagine-image', generation_type: '', token_cost: 5 }),
        rule({ model: 'grok-imagine-image', generation_type: 't2v', token_cost: 6 }),
      ],
    });

    expect(facts.costs).toEqual([
      { mode: 't2i', tokens: 4 },
      { mode: 'i2i', tokens: 5 },
      { mode: 't2v', tokens: 6 },
    ]);
    expect(facts.billedBySession).toBe(false);
  });

  it('distinguishes missing pricing from a real zero cost and records session billing', () => {
    const modelInfo = makeModelInfo({ capabilities: ['t2i', 'i2i'] });
    const facts = deriveModelBillingFacts({
      modelInfo,
      provider: 'grok',
      provisioningMode: 'on_demand',
      pricing: [rule({ token_cost: 0 })],
    });

    expect(facts.costs).toEqual([
      { mode: 't2i', tokens: 0 },
      { mode: 'i2i', tokens: null },
    ]);
    expect(facts.billedBySession).toBe(true);
  });

  it('safely degrades an unexpected raw provisioning mode to no session billing', () => {
    const rawProvisioningMode = 'eventually_on';
    const facts = deriveModelBillingFacts({
      modelInfo: makeModelInfo(),
      provider: 'grok',
      provisioningMode: isProvisioningMode(rawProvisioningMode) ? rawProvisioningMode : null,
      pricing: [],
    });

    expect(isProvisioningMode(rawProvisioningMode)).toBe(false);
    expect(facts.billedBySession).toBe(false);
  });
});
