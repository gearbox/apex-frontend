import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import type { components } from '$lib/api/types';
import { generationStore } from '$lib/stores/generation';

type ProvidersResponse = components['schemas']['ProvidersResponse'];
type PricingRuleResponse = components['schemas']['PricingRuleResponse'];

// Real model_key/aspect_ratios shape: grok-imagine-image does NOT support the
// store's default '3:4' aspect ratio — mirrors src/mocks/factories/providers.ts.
const GROK_PROVIDERS: ProvidersResponse = {
  providers: [
    {
      provider: 'grok',
      name: 'xAI Grok',
      available: true,
      provisioning_mode: 'always_on',
      models: [
        {
          model_key: 'grok-imagine-image',
          name: 'Grok Imagine',
          description: 'Fast image generation model',
          capabilities: ['t2i', 'i2i'],
          is_enabled: true,
          max_images: 10,
          max_prompt_length: 4096,
          supports_negative_prompt: false,
          aspect_ratios: ['1:1', '16:9', '9:16'],
          requires_age_verification: false,
          image: { edit_aspect_ratios: [] },
          video: null,
        },
      ],
    },
  ],
  user_context: null,
} as unknown as ProvidersResponse;

let providersData: ProvidersResponse | undefined;
let pricingData: PricingRuleResponse[] | undefined;
let pricingPending: boolean;

vi.mock('@tanstack/svelte-query', () => ({
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
  createQuery: vi.fn((optionsFn: () => { queryKey: readonly unknown[] }) => {
    const { queryKey } = optionsFn();
    const key = queryKey[0];
    if (key === 'providers') {
      return {
        get data() {
          return providersData;
        },
        isPending: providersData === undefined,
      };
    }
    if (key === 'pricing') {
      return {
        get data() {
          return pricingData;
        },
        get isPending() {
          return pricingPending;
        },
      };
    }
    if (key === 'balance' || (key === 'billing' && queryKey[1] === 'balance')) {
      return { data: { balance: 100 }, isLoading: false };
    }
    // pricing / sessions default to an empty resolved list
    return { data: [], isLoading: false, isPending: false };
  }),
  createMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

import Page from './+page.svelte';

beforeEach(() => {
  generationStore.reset();
  generationStore.setPrompt('a cat in a hat');
  pricingData = [];
  pricingPending = false;
});

function generateButtons(): HTMLButtonElement[] {
  return screen
    .getAllByRole('button')
    .filter((btn): btn is HTMLButtonElement => /generate/i.test(btn.textContent ?? ''));
}

describe('/app/create page — generate gating during providers load', () => {
  it('disables Generate while the providers query is still loading', () => {
    providersData = undefined;

    render(Page);

    for (const btn of generateButtons()) {
      expect(btn.disabled).toBe(true);
    }
  });

  it('enables Generate once providers resolve and the selected model is known', () => {
    providersData = GROK_PROVIDERS;

    render(Page);

    for (const btn of generateButtons()) {
      expect(btn.disabled).toBe(false);
    }
  });

  it('shows the selected model summary and marks missing pricing as unavailable', () => {
    providersData = GROK_PROVIDERS;

    render(Page);

    expect(screen.getByRole('button', { name: 'Learn more about this model' })).toBeTruthy();
    expect(screen.getByText('Cost unavailable')).toBeTruthy();
  });

  it('shows a loading price while pricing is pending', () => {
    providersData = GROK_PROVIDERS;
    pricingData = undefined;
    pricingPending = true;

    render(Page);

    expect(screen.getByText('Loading price…')).toBeTruthy();
    expect(screen.queryByText('Cost unavailable')).toBeNull();
  });

  it('shows a resolved live price when a pricing rule is available', () => {
    providersData = GROK_PROVIDERS;
    pricingData = [
      {
        id: '00000000-0000-0000-0000-000000000001',
        provider: 'grok',
        generation_type: 't2i',
        model: 'grok-imagine-image',
        token_cost: 7,
        input_token_cost: 0,
        is_active: true,
        effective_from: '2026-01-01T00:00:00Z',
        effective_until: null,
        notes: null,
      },
    ];

    render(Page);

    expect(screen.getByText('◈ 7 tokens')).toBeTruthy();
  });

  it('prefills the typed guide example and closes the guide', async () => {
    providersData = GROK_PROVIDERS;
    render(Page);

    await fireEvent.click(screen.getByRole('button', { name: 'Learn more about this model' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    await fireEvent.click(screen.getAllByRole('button', { name: 'Use this prompt' })[0]);

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(get(generationStore)).toMatchObject({
      model: 'grok-imagine-image',
      mode: 't2i',
      prompt:
        'A ceramic coffee mug on a wooden windowsill, soft morning light, shallow depth of field',
      aspectRatio: '1:1',
    });
  });
});
