import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { makeModelInfo } from '../../../mocks/factories/providers';
import type { ModelGuide } from '$lib/content/modelGuides/types';
import ModelSummaryCard from './ModelSummaryCard.svelte';

vi.mock('$paraglide/messages', () => ({
  model_guide_learn_more: () => 'Learn more about this model',
  model_guide_close: () => 'Close model guide',
  model_guide_section_good_at: () => 'What this model is good at',
  model_guide_section_choose_when: () => 'When to choose it',
  model_guide_section_capabilities: () => 'Capabilities',
  model_guide_section_restrictions: () => 'Important restrictions',
  model_guide_section_billing: () => "When you're charged or refunded",
  model_guide_section_tips: () => 'Prompt tips and best practices',
  model_guide_section_examples: () => 'Examples & prompts',
  model_guide_cap_modes: () => 'Available in Create',
  model_guide_cap_max_outputs: () => 'Maximum outputs',
  model_guide_cap_max_prompt: () => 'Prompt length',
  model_guide_cap_negative_prompt: () => 'Negative prompt',
  model_guide_cap_t2i_aspect_ratios: () => 'Text to image aspect ratios',
  model_guide_cap_i2i_aspect: () => 'Image to image aspect',
  model_guide_cap_i2i_preserve_source: () => 'Keeps source aspect',
  model_guide_cap_i2i_auto_with_ratios: ({ ratios }: { ratios: string }) =>
    `Auto (source) · ${ratios}`,
  model_guide_cap_age_gate: () => 'Age verification',
  model_guide_supported: () => 'Supported',
  model_guide_not_supported: () => 'Not supported',
  model_guide_age_required: () => 'Required',
  model_guide_age_not_required: () => 'Not required',
  model_guide_cost_current_estimate: ({ tokens }: { tokens: string }) => `Est. ◈ ${tokens} tokens`,
  model_guide_cost_per_output: ({ tokens }: { tokens: string }) => `◈ ${tokens} per output`,
  model_guide_cost_with_input_per_output: ({
    baseTokens,
    inputTokens,
  }: {
    baseTokens: string;
    inputTokens: string;
  }) => `◈ ${baseTokens} + ◈ ${inputTokens} per input image, per output`,
  model_guide_cost_unknown: () => 'Cost unavailable',
  model_guide_cost_loading: () => 'Loading price…',
  model_guide_billed_by_session: () =>
    'GPU-session uptime is billed separately from generation prices.',
  model_guide_session_billing_hint: () => 'GPU session billed separately',
  model_guide_use_this_prompt: () => 'Use this prompt',
  model_guide_start_creating: () => 'Start creating',
  model_guide_mode_t2i: () => 'Text to image',
  model_guide_mode_i2i: () => 'Image to image',
  model_guide_mode_t2v: () => 'Text to video',
  model_guide_mode_i2v: () => 'Image to video',
  model_guide_mode_v2v: () => 'Video to video',
  model_guide_mode_flf2v: () => 'First and last frame to video',
}));

vi.mock('$lib/utils/format', () => ({
  formatNumber: (value: number) => String(value),
}));

const guide: ModelGuide = {
  modelKey: 'grok-imagine-image',
  tagline: () => 'An authored tagline',
  goodAt: [],
  chooseWhen: [],
  restrictions: [],
  billingRules: [],
  promptTips: [],
  examples: [],
};

const baseProps = {
  guide,
  billingFacts: {
    costs: [{ mode: 't2i' as const, tokenCost: 0, inputTokenCost: 0 }],
    billedBySession: false,
  },
  pricingPending: false,
  currentEstimatedCost: 0,
  onuseexample: vi.fn(),
};

describe('ModelSummaryCard', () => {
  it('hides for a missing model', () => {
    render(ModelSummaryCard, { ...baseProps, modelInfo: null });
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows authored content, live capability chips, and a real zero-cost price', () => {
    render(ModelSummaryCard, { ...baseProps, modelInfo: makeModelInfo() });

    expect(screen.getByText('An authored tagline')).toBeTruthy();
    expect(screen.getByText(/Maximum outputs: 10/)).toBeTruthy();
    expect(screen.getByText(/Est\. ◈ 0 tokens/)).toBeTruthy();
  });

  it('falls back to a live description and does not turn unknown pricing into zero', () => {
    render(ModelSummaryCard, {
      ...baseProps,
      guide: null,
      modelInfo: makeModelInfo({ description: 'Live description' }),
      billingFacts: { costs: [], billedBySession: false },
      currentEstimatedCost: null,
    });

    expect(screen.getByText('Live description')).toBeTruthy();
    expect(screen.getByText('Cost unavailable')).toBeTruthy();
    expect(screen.queryByText(/Est\. ◈ 0 tokens/)).toBeNull();
  });

  it('shows a loading price while pricing is pending', () => {
    render(ModelSummaryCard, {
      ...baseProps,
      modelInfo: makeModelInfo(),
      billingFacts: { costs: [], billedBySession: false },
      pricingPending: true,
      currentEstimatedCost: null,
    });

    expect(screen.getByText('Loading price…')).toBeTruthy();
    expect(screen.queryByText('Cost unavailable')).toBeNull();
  });

  it('clarifies that an on-demand model has a separate GPU-session charge', () => {
    render(ModelSummaryCard, {
      ...baseProps,
      modelInfo: makeModelInfo(),
      billingFacts: { costs: [], billedBySession: true },
    });

    expect(screen.getByText('GPU session billed separately')).toBeTruthy();
  });

  it('opens the guide and restores focus to its trigger after close', async () => {
    render(ModelSummaryCard, { ...baseProps, modelInfo: makeModelInfo() });
    const trigger = screen.getByRole('button', { name: 'Learn more about this model' });

    await fireEvent.click(trigger);
    expect(screen.getByRole('dialog')).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Close model guide' }));
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
