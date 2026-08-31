import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import { generationStore } from '$lib/stores/generation';
import { makeJobOutputItem, makeUnifiedJobResponse } from '../../../mocks/factories/job';
import ResultsPanel from './ResultsPanel.svelte';

beforeEach(() => {
  generationStore.reset();
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe('ResultsPanel replay controls', () => {
  it('does not offer exact Re-Generate for historical v2v jobs', () => {
    generationStore.setComplete(
      makeUnifiedJobResponse({
        generation_type: 'v2v',
        outputs: [makeJobOutputItem()],
      }),
    );
    const loadGroup = vi.fn();

    render(ResultsPanel, { props: { loadGroup } });

    expect(screen.queryByLabelText('Re-generate with same prompt')).toBeNull();
    expect(loadGroup).not.toHaveBeenCalled();
  });
});
