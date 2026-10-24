import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { generationStore } from '$lib/stores/generation';
import {
  makeGrokImageModelInfo,
  makeAishaImageModelInfo,
} from '../../../mocks/factories/providers';
import { makeWanModelInfo } from '../../../mocks/fixtures/wan';
import AspectRatioChips from './AspectRatioChips.svelte';

vi.mock('$paraglide/messages', () => ({
  create_aspect_auto: () => 'Auto (match source)',
  create_aspect_no_reshape: () => 'This model does not support aspect reshape (match source)',
  library_meta_aspect_ratio: () => 'Aspect ratio',
  video_aspect_auto: () => 'Auto',
}));

vi.mock('$paraglide/runtime', () => ({
  getLocale: vi.fn(() => 'en'),
  setLocale: vi.fn(),
  languageTag: vi.fn(() => 'en'),
}));

beforeEach(() => {
  generationStore.reset();
});

describe('AspectRatioChips — t2i mode', () => {
  it('shows all 7 ratio chips regardless of modelInfo', () => {
    render(AspectRatioChips, { modelInfo: null, mode: 't2i' });
    expect(screen.getAllByRole('button')).toHaveLength(7);
    expect(screen.queryByText(/does not support/)).toBeNull();
  });

  it('only shows chips the selected model advertises via aspect_ratios', () => {
    const modelInfo = makeGrokImageModelInfo();
    render(AspectRatioChips, { modelInfo, mode: 't2i' });
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(screen.getByText('1:1')).not.toBeNull();
    expect(screen.getByText('16:9')).not.toBeNull();
    expect(screen.getByText('9:16')).not.toBeNull();
    expect(screen.queryByText('3:4')).toBeNull();
  });

  it('resets a stale stored aspect ratio to one the model supports', () => {
    // Store default is '3:4', which Grok does not advertise.
    expect(get(generationStore).aspectRatio).toBe('3:4');
    const modelInfo = makeGrokImageModelInfo();
    render(AspectRatioChips, { modelInfo, mode: 't2i' });
    expect(['1:1', '16:9', '9:16']).toContain(get(generationStore).aspectRatio);
  });
});

describe('AspectRatioChips — i2i mode, modelInfo loading (null)', () => {
  it('shows only the Auto chip — never the notice', () => {
    generationStore.setMode('i2i');
    render(AspectRatioChips, { modelInfo: null, mode: 'i2i' });
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByText('Auto (match source)')).not.toBeNull();
    expect(screen.queryByText(/does not support/)).toBeNull();
  });
});

describe('AspectRatioChips — i2i mode, confirmed empty capability', () => {
  it('shows the no-reshape notice and no chips', () => {
    generationStore.setMode('i2i');
    const modelInfo = makeGrokImageModelInfo();
    render(AspectRatioChips, { modelInfo, mode: 'i2i' });
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
    render(AspectRatioChips, { modelInfo, mode: 'i2i' });
    expect(screen.getAllByRole('button')).toHaveLength(8);
    expect(screen.getByText('Auto (match source)')).not.toBeNull();
    expect(screen.queryByText(/does not support/)).toBeNull();
  });
});

describe('AspectRatioChips — video variant', () => {
  it('shares the accessible chips and binds Auto/model ratios to videoAspectRatio', async () => {
    render(AspectRatioChips, { modelInfo: makeWanModelInfo(), mode: 't2v', variant: 'video' });

    const auto = screen.getByRole('button', { name: 'Auto' });
    const ratio = screen.getByRole('button', { name: '16:9' });
    expect(auto.getAttribute('aria-pressed')).toBe('true');
    expect(ratio.getAttribute('aria-pressed')).toBe('false');
    expect(ratio.className).toContain('focus-visible:outline-2');

    await fireEvent.click(ratio);

    expect(get(generationStore).videoAspectRatio).toBe('16:9');
    expect(ratio.getAttribute('aria-pressed')).toBe('true');
  });
});
