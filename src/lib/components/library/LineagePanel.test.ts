import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { makeMediaObject } from '../../../mocks/factories/media';

const state = vi.hoisted(() => ({
  data: undefined as unknown,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
}));

vi.mock('@tanstack/svelte-query', () => ({
  createQuery: vi.fn(() => ({
    get data() {
      return state.data;
    },
    get isLoading() {
      return state.isLoading;
    },
    get isError() {
      return state.isError;
    },
    refetch: state.refetch,
  })),
}));

import LineagePanel from './LineagePanel.svelte';

const createdAt = '2025-06-01T12:00:00Z';
const node = (asset_ref: string, source: 'upload' | 'output' = 'output') => ({
  asset_ref,
  source,
  media: makeMediaObject(),
  created_at: createdAt,
  model: source === 'output' ? 'grok-imagine-image' : null,
  generation_type: source === 'output' ? 't2i' : null,
});

describe('LineagePanel', () => {
  beforeEach(() => {
    state.isLoading = false;
    state.isError = false;
    state.refetch.mockReset();
    state.data = {
      focus: node('output:focus'),
      // API returns nearest ancestor first. The panel must reverse this visually.
      ancestors: [
        { relation: 'generated_from_output', node: node('output:parent') },
        { relation: 'generated_from_upload', node: node('upload:origin', 'upload') },
      ],
      descendants: [
        {
          relation: 'frame_of_output',
          node: node('output:child'),
          source_timestamp_ms: 1_234,
        },
      ],
      descendant_totals: { job_count: 1, frame_count: 2 },
      ancestors_truncated: true,
      descendants_truncated: true,
    };
  });

  it('renders origin → focus → descendants with relation labels and truncation notices', () => {
    const { container } = render(LineagePanel, {
      props: { assetRef: 'output:focus', onNavigate: vi.fn() },
    });
    const text = container.textContent ?? '';

    expect(text.indexOf('upload:origin')).toBeLessThan(text.indexOf('output:parent'));
    expect(text.indexOf('output:parent')).toBeLessThan(text.indexOf('output:focus'));
    expect(text.indexOf('output:focus')).toBeLessThan(text.indexOf('output:child'));
    expect(screen.getByText('History continues…')).toBeTruthy();
    expect(screen.getByText('Showing first 50 descendants')).toBeTruthy();
    expect(text).toContain('Frame of output · 00:01.234');
  });

  it('navigates when a non-focus node is selected and ignores the focus node', async () => {
    const onNavigate = vi.fn();
    render(LineagePanel, { props: { assetRef: 'output:focus', onNavigate } });

    await fireEvent.click(screen.getByRole('button', { name: /output:child/ }));
    await fireEvent.click(screen.getByRole('button', { name: /output:focus/ }));

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith('output:child');
  });

  it('offers a retry after a lineage error', async () => {
    state.isError = true;
    render(LineagePanel, { props: { assetRef: 'output:focus', onNavigate: vi.fn() } });

    await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(state.refetch).toHaveBeenCalledTimes(1);
  });
});
