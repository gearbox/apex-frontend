import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { generationStore } from '$lib/stores/generation';
import { makeModelInfo } from '../../../mocks/factories/providers';
import TypeSelector from './TypeSelector.svelte';

vi.mock('$paraglide/messages', () => ({
  create_type_label: () => 'Type',
  model_guide_mode_t2i: () => 'Text to image',
  model_guide_mode_i2i: () => 'Image to image',
  model_guide_mode_t2v: () => 'Text to video',
  model_guide_mode_i2v: () => 'Image to video',
  model_guide_mode_v2v: () => 'Video to video',
  model_guide_mode_flf2v: () => 'First and last frame to video',
}));

describe('TypeSelector', () => {
  beforeEach(() => generationStore.reset());

  it('does not offer V2V or FLF2V without matching Create input workflows', () => {
    render(TypeSelector, {
      modelInfo: makeModelInfo({ capabilities: ['t2v', 'i2v', 'v2v', 'flf2v'] }),
    });

    expect(screen.getByRole('button', { name: 'Text to video' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Image to video' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Video to video' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'First and last frame to video' })).toBeNull();
  });
});
