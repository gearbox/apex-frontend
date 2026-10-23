import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ModelSelector from './ModelSelector.svelte';
import { makeGrokImageModelInfo, makeModelInfo } from '../../../mocks/factories/providers';

describe('ModelSelector', () => {
  it('renders disabled provider models as unavailable instead of removing them', () => {
    render(ModelSelector, {
      models: [
        makeGrokImageModelInfo({ is_enabled: true }),
        makeGrokImageModelInfo({
          model_key: 'grok-2-image-1212',
          name: 'Paused model',
          is_enabled: false,
        }),
      ],
      selectedModel: 'grok-imagine-image',
      onSelect: vi.fn(),
    });
    const unavailable = screen.getByRole('button', { name: /Grok 2.*Unavailable/i });
    expect((unavailable as HTMLButtonElement).disabled).toBe(true);
  });

  it('uses the discovery name for a model outside the presentation table', () => {
    render(ModelSelector, {
      models: [makeModelInfo({ model_key: 'future-model', name: 'Discovered Model' })],
      selectedModel: 'grok-imagine-image',
      onSelect: vi.fn(),
    });

    expect(screen.getByRole('button', { name: /Discovered Model/ })).toBeTruthy();
    expect(screen.queryByText('future-model')).toBeNull();
  });
});
