import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import type { ModelGuideExample } from '$lib/content/modelGuides/types';
import ModelGuideExamples from './ModelGuideExamples.svelte';

vi.mock('$paraglide/messages', () => ({
  model_guide_use_this_prompt: () => 'Use this prompt',
}));

const promptOnly: ModelGuideExample = {
  prompt: 'A bright orange kite above a quiet beach',
  mode: 't2i',
  aspectRatio: '16:9',
};

describe('ModelGuideExamples', () => {
  it('renders nothing for an empty list', () => {
    render(ModelGuideExamples, { examples: [], onuse: vi.fn() });

    expect(screen.queryByRole('article')).toBeNull();
  });

  it('renders prompt-only examples without an image and returns the exact example', async () => {
    const onuse = vi.fn();
    render(ModelGuideExamples, { examples: [promptOnly], onuse });

    expect(screen.getByText(promptOnly.prompt)).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
    await fireEvent.click(screen.getByRole('button'));
    expect(onuse).toHaveBeenCalledWith(promptOnly);
  });

  it('renders a supplied sample path', () => {
    const example = { ...promptOnly, image: '/model-guides/grok-imagine-image/gi-mug.webp' };
    render(ModelGuideExamples, { examples: [example], onuse: vi.fn() });

    expect(screen.getByRole('img').getAttribute('src')).toBe(example.image);
  });
});
