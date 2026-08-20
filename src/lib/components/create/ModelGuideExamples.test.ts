import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import type { ModelGuideExample } from '$lib/content/modelGuides/types';
import { modelGuides } from '$lib/content/modelGuides/guides';
import ModelGuideExamples from './ModelGuideExamples.svelte';

vi.mock('$paraglide/messages', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$paraglide/messages')>()),
  model_guide_use_this_prompt: () => 'Use this prompt',
  model_guide_generated_sample: () => 'Generated sample',
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
    expect(screen.getByRole('img').getAttribute('alt')).toBe('Generated sample');
  });

  it('renders the three configured Grok Imagine samples and preserves prompt actions', async () => {
    const examples = modelGuides['grok-imagine-image'].examples;
    const onuse = vi.fn();
    expect(examples.map((example) => example.image)).toEqual([
      '/model-guides/grok-imagine-image/gi-mug.webp',
      '/model-guides/grok-imagine-image/gi-fisher.webp',
      '/model-guides/grok-imagine-image/gi-road.webp',
    ]);

    render(ModelGuideExamples, { examples, onuse });

    expect(screen.getAllByRole('img')).toHaveLength(3);
    await fireEvent.click(screen.getAllByRole('button', { name: 'Use this prompt' })[1]);
    expect(onuse).toHaveBeenCalledWith(examples[1]);
  });
});
