import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { makeAishaImageModelInfo, makeModelInfo } from '../../../mocks/factories/providers';
import type { components } from '$lib/api/types';
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
  model_guide_cap_modes: () => 'Available in Create',
  model_guide_cap_max_outputs: () => 'Maximum outputs',
  model_guide_cap_max_prompt: () => 'Prompt length',
  model_guide_cap_max_duration: () => 'Maximum duration',
  model_guide_cap_resolutions: () => 'Resolutions',
  model_guide_seconds: () => 'seconds',
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
  costs: [{ mode: 't2i' as const, tokenCost: 0, inputTokenCost: 0 }],
  billedBySession: false,
};

type ModelInfo = components['schemas']['ModelInfo'];

function renderSheet(
  overrides: Partial<{
    modelInfo: ModelInfo;
    guide: ModelGuide | null;
    billingFacts: ModelBillingFacts;
    pricingPending: boolean;
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
    pricingPending: false,
    onclose: vi.fn(),
    onuseexample: vi.fn(),
    ...overrides,
  });
}

describe('ModelGuideSheet', () => {
  it('renders every guide section and pricing per output', () => {
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
    expect(screen.getByText(/◈ 0 per output/)).toBeTruthy();
  });

  it('keeps live capabilities and billing when the guide is unknown', () => {
    renderSheet({
      guide: null,
      billingFacts: {
        costs: [{ mode: 't2i', tokenCost: null, inputTokenCost: null }],
        billedBySession: true,
      },
    });

    expect(screen.getByText('Maximum outputs')).toBeTruthy();
    expect(screen.getByText('Cost unavailable')).toBeTruthy();
    expect(screen.getByText(/GPU-session uptime/)).toBeTruthy();
    expect(screen.queryByText('Example prompt')).toBeNull();
  });

  it('shows a loading price only while pricing is pending', () => {
    renderSheet({
      billingFacts: {
        costs: [{ mode: 't2i', tokenCost: null, inputTokenCost: null }],
        billedBySession: false,
      },
      pricingPending: true,
    });

    expect(screen.getByText('Loading price…')).toBeTruthy();
    expect(screen.queryByText('Cost unavailable')).toBeNull();
  });

  it('uses distinct live aspect-ratio capabilities for Grok image modes', () => {
    renderSheet({
      modelInfo: makeModelInfo({
        capabilities: ['t2i', 'i2i'],
        aspect_ratios: ['1:1', '16:9', '9:16'],
        image: { edit_aspect_ratios: [] },
      }),
    });

    expect(screen.getByText('Text to image aspect ratios')).toBeTruthy();
    expect(screen.getByText('1:1, 16:9, 9:16')).toBeTruthy();
    expect(screen.getByText('Image to image aspect')).toBeTruthy();
    expect(screen.getByText('Keeps source aspect')).toBeTruthy();
  });

  it('shows supported image-edit ratios without borrowing text-to-image ratios', () => {
    renderSheet({
      modelInfo: makeAishaImageModelInfo({ capabilities: ['i2i'] }),
    });

    expect(screen.queryByText('Text to image aspect ratios')).toBeNull();
    expect(screen.getByText('Auto (source) · 2:3, 3:2, 1:1, 9:16, 16:9, 3:4, 4:3')).toBeTruthy();
  });

  it('does not show a text-to-image aspect row for a video-only model', () => {
    renderSheet({
      modelInfo: makeModelInfo({ capabilities: ['t2v'], aspect_ratios: ['1:1', '16:9'] }),
    });

    expect(screen.queryByText('Text to image aspect ratios')).toBeNull();
    expect(screen.queryByText('Image to image aspect')).toBeNull();
  });

  it('shows live video constraints and excludes unavailable Create modes', () => {
    renderSheet({
      modelInfo: makeModelInfo({
        capabilities: ['t2v', 'i2v', 'v2v', 'flf2v'],
        image: null,
        video: { max_duration: 4, resolutions: ['480p'] },
      }),
    });

    expect(screen.getByText('Maximum duration')).toBeTruthy();
    expect(screen.getByText('4 seconds')).toBeTruthy();
    expect(screen.getByText('Resolutions')).toBeTruthy();
    expect(screen.getByText('480p')).toBeTruthy();
    expect(screen.getByText(/Text to video/)).toBeTruthy();
    expect(screen.queryByText('Video to video')).toBeNull();
    expect(screen.queryByText('First and last frame to video')).toBeNull();
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

  it('keeps keyboard focus inside the dialog and closes once for Escape', async () => {
    const onclose = vi.fn();
    renderSheet({ onclose });

    const close = screen.getByRole('button', { name: 'Close model guide' });
    const startCreating = screen.getByRole('button', { name: 'Start creating' });
    expect(document.activeElement).toBe(close);

    startCreating.focus();
    await fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(close);

    await fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(startCreating);

    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(onclose).toHaveBeenCalledTimes(1);
  });

  it('recovers focus outside the dialog in the direction of Tab navigation', async () => {
    renderSheet();
    const close = screen.getByRole('button', { name: 'Close model guide' });
    const startCreating = screen.getByRole('button', { name: 'Start creating' });
    const outside = document.createElement('button');
    document.body.append(outside);

    try {
      outside.focus();
      await fireEvent.keyDown(window, { key: 'Tab' });
      expect(document.activeElement).toBe(close);

      outside.focus();
      await fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(startCreating);
    } finally {
      outside.remove();
    }
  });

  it('keeps long capability and billing values complete in semantic stacked rows', () => {
    renderSheet({
      modelInfo: makeAishaImageModelInfo({ capabilities: ['i2i'] }),
      billingFacts: {
        costs: [{ mode: 'i2i', tokenCost: 7, inputTokenCost: 2 }],
        billedBySession: false,
      },
    });

    const capability = screen.getByText('Auto (source) · 2:3, 3:2, 1:1, 9:16, 16:9, 3:4, 4:3');
    expect(capability.tagName).toBe('DD');
    expect(capability.previousElementSibling?.tagName).toBe('DT');
    expect(capability.parentElement?.classList.contains('flex-col')).toBe(true);

    const price = screen.getByText('◈ 7 + ◈ 2 per input image, per output');
    expect(price.tagName).toBe('DD');
    expect(price.previousElementSibling?.tagName).toBe('DT');
    expect(price.parentElement?.classList.contains('flex-col')).toBe(true);
    expect(price.classList.contains('text-right')).toBe(false);
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
