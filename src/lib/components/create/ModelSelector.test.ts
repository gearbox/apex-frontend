import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ModelSelector from './ModelSelector.svelte';
import { makeGrokImageModelInfo } from '../../../mocks/factories/providers';

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
});
