import { beforeEach, describe, expect, it } from 'vitest';
import { render, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { generationStore } from '$lib/stores/generation';
import WorkflowImageParams from './WorkflowImageParams.svelte';
import { makeGrokImageModelInfo } from '../../../mocks/factories/providers';

beforeEach(() => generationStore.reset());

describe('WorkflowImageParams sizing mode reconciliation', () => {
  it('automatically chooses custom when custom sizing is the sole writable mechanism', async () => {
    generationStore.setSizingMode('tier');
    render(WorkflowImageParams, {
      modelInfo: makeGrokImageModelInfo({ unsupported_parameters: ['image_resolution'] }),
    });
    await waitFor(() => expect(get(generationStore).sizingMode).toBe('custom'));
  });

  it('automatically chooses tier when it is the sole writable mechanism', async () => {
    generationStore.setSizingMode('custom');
    render(WorkflowImageParams, {
      modelInfo: makeGrokImageModelInfo({ unsupported_parameters: ['width', 'height'] }),
    });
    await waitFor(() => expect(get(generationStore).sizingMode).toBe('tier'));
  });

  it('reconciles an active sizing mode when discovery refreshes from tier to custom and back', async () => {
    const tierOnly = makeGrokImageModelInfo({ unsupported_parameters: ['width', 'height'] });
    const customOnly = makeGrokImageModelInfo({ unsupported_parameters: ['image_resolution'] });
    const view = render(WorkflowImageParams, { modelInfo: tierOnly });

    generationStore.setSizingMode('tier');
    await view.rerender({ modelInfo: customOnly });
    await waitFor(() => expect(get(generationStore).sizingMode).toBe('custom'));

    await view.rerender({ modelInfo: tierOnly });
    await waitFor(() => expect(get(generationStore).sizingMode).toBe('tier'));
  });
});
