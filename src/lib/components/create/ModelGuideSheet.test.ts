import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { makeModelInfo } from '../../../mocks/factories/providers';
import type { ModelBillingFacts } from '$lib/content/modelGuides/billingFacts';
import type { ModelGuide } from '$lib/content/modelGuides/types';
import ModelGuideSheet from './ModelGuideSheet.svelte';

vi.mock('$paraglide/messages', () => ({
  model_guide_close: () => 'Close model guide',
  model_guide_section_good_at: () => 'What this model is good at',
  model_guide_section_choose_when: () => 'When to choose it',
  model_guide_section_capabilities: () => 'Capabilities',
  model_guide_section_restrictions: () => 'Important restrictions',
  model_guide_section_billing: () => "When you're charged or refunded",
  model_guide_section_tips: () => 'Prompt tips and best practices',
  model_guide_section_examples: () => 'Examples & prompts',
  model_guide_cap_modes: () => 'Modes',
  model_guide_cap_max_outputs: () => 'Outputs per request',
  model_guide_cap_max_prompt: () => 'Prompt length',
  model_guide_cap_negative_prompt: () => 'Negative prompt',
  model_guide_cap_aspect_ratios: () => 'Aspect ratios',
  model_guide_cap_age_gate: () => 'Age verification',
  model_guide_supported: () => 'Supported',
  model_guide_not_supported: () => 'Not supported',
  model_guide_age_required: () => 'Required',
  model_guide_age_not_required: () => 'Not required',
  model_guide_cost_per_mode: ({ tokens }: { tokens: string }) => `◈ ${tokens} tokens`,
  model_guide_cost_unknown: () => 'Cost unavailable',
  model_guide_billed_by_session: () =>
    'GPU-session uptime is billed separately from generation prices.',
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

const text = (value: string) => () => value;
const guide: ModelGuide = {
  modelKey: 'grok-imagine-image',
  tagline: text('Guide tagline'),
  goodAt: [text('Good at')],
  chooseWhen: [text('Choose when')],
  restrictions: [text('Restriction')],
  billingRules: [text('Billing rule')],
  promptTips: [text('Tip')],
  examples: [{ prompt: 'Example prompt', mode: 't2i', aspectRatio: '1:1' }],
};

const billingFacts = {
  costs: [{ mode: 't2i' as const, tokens: 0 }],
  billedBySession: false,
};

function renderSheet(
  overrides: Partial<{
    guide: ModelGuide | null;
    billingFacts: ModelBillingFacts;
    onclose: () => void;
    onuseexample: (
      modelKey: ModelGuide['modelKey'],
      example: ModelGuide['examples'][number],
    ) => void;
  }> = {},
) {
  return render(ModelGuideSheet, {
    modelInfo: makeModelInfo(),
    guide,
    billingFacts,
    onclose: vi.fn(),
    onuseexample: vi.fn(),
    ...overrides,
  });
}

describe('ModelGuideSheet', () => {
  it('renders every guide section and a real zero cost', () => {
    renderSheet();

    for (const content of [
      'Good at',
      'Choose when',
      'Restriction',
      'Billing rule',
      'Tip',
      'Example prompt',
    ]) {
      expect(screen.getByText(content)).toBeTruthy();
    }
    expect(screen.getByText(/◈ 0 tokens/)).toBeTruthy();
  });

  it('keeps live capabilities and billing when the guide is unknown', () => {
    renderSheet({
      guide: null,
      billingFacts: { costs: [{ mode: 't2i', tokens: null }], billedBySession: true },
    });

    expect(screen.getByText('Outputs per request')).toBeTruthy();
    expect(screen.getByText('Cost unavailable')).toBeTruthy();
    expect(screen.getByText(/GPU-session uptime/)).toBeTruthy();
    expect(screen.queryByText('Example prompt')).toBeNull();
  });

  it('closes on Escape and backdrop clicks, but not a panel click', async () => {
    const onclose = vi.fn();
    renderSheet({ onclose });

    await fireEvent.click(screen.getByRole('dialog'));
    expect(onclose).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByRole('presentation'));
    expect(onclose).toHaveBeenCalledTimes(1);
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(onclose).toHaveBeenCalledTimes(2);
  });

  it('passes the typed model key, then closes, when an example is used', async () => {
    const onclose = vi.fn();
    const onuseexample = vi.fn();
    renderSheet({ onclose, onuseexample });

    await fireEvent.click(screen.getByRole('button', { name: 'Use this prompt' }));
    expect(onuseexample).toHaveBeenCalledWith('grok-imagine-image', guide.examples[0]);
    expect(onclose).toHaveBeenCalledTimes(1);
  });

  it('uses a dvh-constrained panel and never mutates body scroll', () => {
    const { container } = renderSheet();
    expect(container.innerHTML).toContain('max-h-[88dvh]');
    expect(ModelGuideSheet.toString()).not.toContain('document.body.style.overflow');
  });
});
