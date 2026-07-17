import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { components } from '$lib/api/types';
import { generationStore } from '$lib/stores/generation';

type ProvidersResponse = components['schemas']['ProvidersResponse'];

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
    if (key === 'balance' || (key === 'billing' && queryKey[1] === 'balance')) {
      return { data: { balance: 100 }, isLoading: false };
    }
    // pricing / sessions default to an empty resolved list
    return { data: [], isLoading: false };
  }),
  createMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

import Page from './+page.svelte';

beforeEach(() => {
  generationStore.reset();
  generationStore.setPrompt('a cat in a hat');
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
});
