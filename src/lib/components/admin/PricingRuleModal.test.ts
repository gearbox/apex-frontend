import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';

let queryDataMock: unknown = { items: [] };
let isPendingMock = false;

vi.mock('@tanstack/svelte-query', () => ({
  createQuery: vi.fn((optionsFn: () => object) => {
    optionsFn();
    return {
      get data() {
        return queryDataMock;
      },
      isPending: false,
    };
  }),
  createMutation: vi.fn((optionsFn: () => object) => {
    optionsFn();
    return {
      mutateAsync: vi.fn(),
      get isPending() {
        return isPendingMock;
      },
    };
  }),
}));

import PricingRuleModal from './PricingRuleModal.svelte';

const fakeQueryClient = {} as import('@tanstack/svelte-query').QueryClient;

beforeEach(() => {
  isPendingMock = false;
  queryDataMock = {
    items: [
      { model_key: 'flux-1', provider: 'bfl', name: 'Flux 1' },
      { model_key: 'sdxl-1', provider: 'stability', name: 'SDXL 1' },
      { model_key: 'flux-2', provider: 'bfl', name: 'Flux 2' },
    ],
  };
});

describe('PricingRuleModal', () => {
  it('defaults flat cost to 1 for image modes and 0 for video modes', async () => {
    render(PricingRuleModal, {
      props: { queryClient: fakeQueryClient, onclose: vi.fn() },
    });

    const flatCost = screen.getByLabelText('Flat cost per job') as HTMLInputElement;
    expect(flatCost.value).toBe('1');

    await fireEvent.change(screen.getByLabelText('Generation Type'), {
      target: { value: 'r2v' },
    });

    expect(flatCost.value).toBe('0');
  });

  it('preserves an edited flat cost when switching generation modes', async () => {
    render(PricingRuleModal, {
      props: { queryClient: fakeQueryClient, onclose: vi.fn() },
    });

    const flatCost = screen.getByLabelText('Flat cost per job') as HTMLInputElement;
    await fireEvent.change(screen.getByLabelText('Generation Type'), {
      target: { value: 'r2v' },
    });
    await fireEvent.input(flatCost, { target: { value: '5' } });
    await fireEvent.change(screen.getByLabelText('Generation Type'), {
      target: { value: 'i2i' },
    });

    expect(flatCost.value).toBe('5');
  });

  it('populates provider options from mocked models, deduplicated and sorted', () => {
    render(PricingRuleModal, {
      props: { queryClient: fakeQueryClient, onclose: vi.fn() },
    });

    const select = screen.getByLabelText('Provider') as HTMLSelectElement;
    const optionValues = Array.from(select.options).map((o) => o.value);

    // Placeholder + deduplicated, sorted providers
    expect(optionValues).toEqual(['', 'bfl', 'stability']);
  });

  it('filters models by selected provider in the Model dropdown', async () => {
    render(PricingRuleModal, {
      props: { queryClient: fakeQueryClient, onclose: vi.fn() },
    });

    const providerSelect = screen.getByLabelText('Provider') as HTMLSelectElement;
    await fireEvent.change(providerSelect, { target: { value: 'bfl' } });

    const modelSelect = screen.getByLabelText('Model') as HTMLSelectElement;
    const modelLabels = Array.from(modelSelect.options).map((o) => o.textContent);

    expect(modelLabels).toEqual(['All models', 'Flux 1', 'Flux 2']);
  });
});
