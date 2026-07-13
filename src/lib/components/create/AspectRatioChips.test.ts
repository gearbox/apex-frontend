import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { generationStore } from '$lib/stores/generation';
import {
  makeGrokImageModelInfo,
  makeAishaImageModelInfo,
} from '../../../mocks/factories/providers';
import AspectRatioChips from './AspectRatioChips.svelte';

vi.mock('$paraglide/messages', () => ({
  create_aspect_auto: () => 'Auto (match source)',
  create_aspect_no_reshape: () => 'This model does not support aspect reshape (match source)',
}));

vi.mock('$paraglide/runtime', () => ({
  setLanguageTag: vi.fn(),
  languageTag: vi.fn(() => 'en'),
}));

beforeEach(() => {
  generationStore.reset();
});

describe('AspectRatioChips — t2i mode', () => {
  it('shows all 7 ratio chips regardless of modelInfo', () => {
    render(AspectRatioChips, { modelInfo: null });
    expect(screen.getAllByRole('button')).toHaveLength(7);
    expect(screen.queryByText(/does not support/)).toBeNull();
  });
});

describe('AspectRatioChips — i2i mode, modelInfo loading (null)', () => {
  it('shows only the Auto chip — never the notice', () => {
    generationStore.setMode('i2i');
    render(AspectRatioChips, { modelInfo: null });
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByText('Auto (match source)')).not.toBeNull();
    expect(screen.queryByText(/does not support/)).toBeNull();
  });
});

describe('AspectRatioChips — i2i mode, confirmed empty capability', () => {
  it('shows the no-reshape notice and no chips', () => {
    generationStore.setMode('i2i');
    const modelInfo = makeGrokImageModelInfo();
    render(AspectRatioChips, { modelInfo });
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(
      screen.getByText('This model does not support aspect reshape (match source)'),
    ).not.toBeNull();
  });
});

describe('AspectRatioChips — i2i mode, confirmed capability list', () => {
  it('shows Auto plus the model’s supported ratio chips', () => {
    generationStore.setMode('i2i');
    const modelInfo = makeAishaImageModelInfo();
    render(AspectRatioChips, { modelInfo });
    expect(screen.getAllByRole('button')).toHaveLength(8);
    expect(screen.getByText('Auto (match source)')).not.toBeNull();
    expect(screen.queryByText(/does not support/)).toBeNull();
  });
});
