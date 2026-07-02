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
