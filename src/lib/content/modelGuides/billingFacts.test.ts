import { makeWanModelInfo } from '../../../mocks/fixtures/wan';
import { describe, expect, it } from 'vitest';
import type { components } from '$lib/api/types';
import { makeModelInfo, generationModes } from '../../../mocks/factories/providers';
import { isProvisioningMode } from '$lib/utils/sessionState';
import { deriveModelBillingFacts } from './billingFacts';

type PricingRuleResponse = components['schemas']['PricingRuleResponse'];

function rule(overrides: Partial<PricingRuleResponse> = {}): PricingRuleResponse {
  return {
    per_second_token_cost: 0,
    video_resolution: null,
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
        nowMs: Date.parse('2026-02-15T00:00:00Z'),
      }),
    ).toEqual({ costs: [], billedBySession: false });
  });

  it('uses provider capability order and keeps pricing for every advertised mode', () => {
    const modelInfo = makeModelInfo({
      generation_modes: generationModes(['t2v', 'not-a-mode', 'i2i', 't2i']),
      model_key: 'grok-imagine-image',
    });
    const facts = deriveModelBillingFacts({
      modelInfo,
      provider: 'grok',
      provisioningMode: 'always_on',
      pricing: [
        rule({ generation_type: 't2i', token_cost: 4, input_token_cost: 1 }),
        rule({ model: 'grok-imagine-image', generation_type: 't2v', token_cost: 6 }),
      ],
      nowMs: Date.parse('2026-02-15T00:00:00Z'),
    });

    expect(facts.costs).toEqual([
      { kind: 'flat', mode: 't2v', tokenCost: 6, inputTokenCost: 0 },
      { kind: 'flat', mode: 'not-a-mode', tokenCost: null, inputTokenCost: null },
      { kind: 'flat', mode: 'i2i', tokenCost: null, inputTokenCost: null },
      { kind: 'flat', mode: 't2i', tokenCost: 4, inputTokenCost: 1 },
    ]);
    expect(facts.billedBySession).toBe(false);
  });

  it('distinguishes missing pricing from a real zero cost and records session billing', () => {
    const modelInfo = makeModelInfo({ generation_modes: generationModes(['t2i', 'i2i']) });
    const facts = deriveModelBillingFacts({
      modelInfo,
      provider: 'grok',
      provisioningMode: 'on_demand',
      pricing: [rule({ token_cost: 0 })],
      nowMs: Date.parse('2026-02-15T00:00:00Z'),
    });

    expect(facts.costs).toEqual([
      { kind: 'flat', mode: 't2i', tokenCost: 0, inputTokenCost: 0 },
      { kind: 'flat', mode: 'i2i', tokenCost: null, inputTokenCost: null },
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
      nowMs: Date.parse('2026-02-15T00:00:00Z'),
    });

    expect(isProvisioningMode(rawProvisioningMode)).toBe(false);
    expect(facts.billedBySession).toBe(false);
  });

  it('does not expose a model-guide price after its supplied clock passes the expiry', () => {
    const facts = deriveModelBillingFacts({
      modelInfo: makeModelInfo({ generation_modes: generationModes(['t2i']) }),
      provider: 'grok',
      provisioningMode: 'always_on',
      pricing: [rule({ effective_until: '2026-02-15T00:00:00Z' })],
      nowMs: Date.parse('2026-02-15T00:00:00Z'),
    });

    expect(facts.costs).toEqual([
      { kind: 'flat', mode: 't2i', tokenCost: null, inputTokenCost: null },
    ]);
  });
});

const wanRule = (
  id: string,
  resolution: PricingRuleResponse['video_resolution'],
  tokenCost: number,
  perSecondTokenCost = 0,
) =>
  rule({
    id,
    provider: 'alibaba',
    model: 'wan3.0-video',
    generation_type: 't2v',
    token_cost: tokenCost,
    per_second_token_cost: perSecondTokenCost,
    video_resolution: resolution,
  });

function wanVideoPricing(pricing: PricingRuleResponse[]) {
  const facts = deriveModelBillingFacts({
    modelInfo: makeWanModelInfo({ generation_modes: generationModes(['t2v']) }),
    provider: 'alibaba',
    provisioningMode: 'always_on',
    nowMs: Date.parse('2026-02-15T00:00:00Z'),
    pricing,
  });
  return facts.costs[0];
}

describe('Wan video resolution pricing groups', () => {
  it('keeps all flat-only per-resolution rules in generated resolution order', () => {
    const rules = [
      wanRule('flat-480', '480p', 20),
      wanRule('flat-720', '720p', 40),
      wanRule('flat-1080', '1080p', 80),
    ];

    expect(wanVideoPricing(rules)).toEqual({
      kind: 'video',
      mode: 't2v',
      groups: [
        { resolutions: ['480p'], rule: rules[0] },
        { resolutions: ['720p'], rule: rules[1] },
        { resolutions: ['1080p'], rule: rules[2] },
      ],
    });
  });

  it('keeps flat and per-second resolutions together in a mixed catalog', () => {
    const rules = [
      wanRule('flat-480', '480p', 20),
      wanRule('second-720', '720p', 0, 3),
      wanRule('second-1080', '1080p', 0, 6),
    ];

    expect(wanVideoPricing(rules)).toMatchObject({
      kind: 'video',
      groups: [
        { resolutions: ['480p'], rule: rules[0] },
        { resolutions: ['720p'], rule: rules[1] },
        { resolutions: ['1080p'], rule: rules[2] },
      ],
    });
  });

  it('groups resolutions that resolve to the same any-resolution rule', () => {
    const anyResolution = wanRule('any-resolution', null, 0, 3);

    expect(wanVideoPricing([anyResolution])).toEqual({
      kind: 'video',
      mode: 't2v',
      groups: [{ resolutions: ['480p', '720p', '1080p'], rule: anyResolution }],
    });
  });

  it('groups shared rules by id and keeps a more specific rule separate', () => {
    const sharedRule = wanRule('shared', null, 2, 3);
    const specificRule = wanRule('specific-1080', '1080p', 4, 6);

    expect(wanVideoPricing([sharedRule, specificRule])).toEqual({
      kind: 'video',
      mode: 't2v',
      groups: [
        { resolutions: ['480p', '720p'], rule: sharedRule },
        { resolutions: ['1080p'], rule: specificRule },
      ],
    });
  });

  it('puts advertised resolutions without prices in one final group', () => {
    const rules = [wanRule('priced-480', '480p', 20), wanRule('priced-720', '720p', 40)];

    expect(wanVideoPricing(rules)).toMatchObject({
      kind: 'video',
      groups: [
        { resolutions: ['480p'], rule: rules[0] },
        { resolutions: ['720p'], rule: rules[1] },
        { resolutions: ['1080p'], rule: null },
      ],
    });
  });

  it('retains every resolution as unpriced when the catalog has no matching rules', () => {
    expect(wanVideoPricing([])).toEqual({
      kind: 'video',
      mode: 't2v',
      groups: [{ resolutions: ['480p', '720p', '1080p'], rule: null }],
    });
  });

  it('keeps image-mode flat pricing unchanged', () => {
    const imageModel = makeModelInfo({
      generation_modes: generationModes(['t2i']),
      model_key: 'grok-imagine-image',
    });
    const imageRule = rule({
      provider: 'grok',
      generation_type: 't2i',
      model: 'grok-imagine-image',
      token_cost: 4,
      input_token_cost: 1,
    });
    const facts = deriveModelBillingFacts({
      modelInfo: imageModel,
      provider: 'grok',
      provisioningMode: 'always_on',
      pricing: [imageRule],
      nowMs: Date.parse('2026-02-15T00:00:00Z'),
    });

    expect(facts.costs).toEqual([{ kind: 'flat', mode: 't2i', tokenCost: 4, inputTokenCost: 1 }]);
  });
});
