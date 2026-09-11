import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
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
  it('offers Re-Generate for v2v jobs, same as every other mode', async () => {
    generationStore.setComplete(
      makeUnifiedJobResponse({
        generation_type: 'v2v',
        outputs: [makeJobOutputItem()],
      }),
    );
    const loadGroup = vi.fn();

    render(ResultsPanel, { props: { loadGroup } });

    const button = screen.getByLabelText('Re-generate with same prompt');
    await fireEvent.click(button);
    expect(loadGroup).toHaveBeenCalled();
  });
});
