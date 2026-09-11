import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { generationStore } from '$lib/stores/generation';
import ParamsPanel from './ParamsPanel.svelte';
import { makeGrokImageModelInfo } from '../../../mocks/factories/providers';

beforeEach(() => generationStore.reset());

describe('ParamsPanel', () => {
  it('hides the batch selector when discovery marks batch_size unsupported', () => {
    render(ParamsPanel, {
      modelInfo: makeGrokImageModelInfo({ unsupported_parameters: ['batch_size'] }),
      mode: 't2i',
    });
    expect(screen.queryByText('Images Count')).toBeNull();
  });

  it('shows writable advanced controls even when quality tiers are absent', () => {
    const model = makeGrokImageModelInfo({
      image: { edit_aspect_ratios: [], supported_tiers: null },
      unsupported_parameters: ['image_resolution', 'width', 'height'],
    });
    render(ParamsPanel, { modelInfo: model, mode: 't2i' });
    expect(screen.getByText('Advanced')).toBeTruthy();
  });
});
