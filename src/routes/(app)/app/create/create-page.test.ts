import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import type { components } from '$lib/api/types';
import { generationStore } from '$lib/stores/generation';
import { setEventStreamStatus } from '$lib/stores/eventStream';
import {
  makeAishaVideoModelInfo,
  makeGrokVideoModelInfo,
} from '../../../../mocks/factories/providers';

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
          generation_modes: {
            t2i: { source_media: null },
            i2i: {
              source_media: { min: 1, max: 4, media_types: ['image'], roles: null },
            },
          },
          is_enabled: true,
          max_images: 10,
          max_prompt_length: 4096,
          supports_negative_prompt: false,
          unsupported_parameters: ['negative_prompt'],
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

const GROK_VIDEO_PROVIDERS: ProvidersResponse = {
  providers: [
    {
      provider: 'grok',
      name: 'xAI Grok',
      available: true,
      provisioning_mode: 'always_on',
      models: [
        {
          model_key: 'grok-imagine-video',
          name: 'Grok Video',
          description: 'Fast video generation model',
          generation_modes: { t2v: { source_media: null } },
          is_enabled: true,
          max_images: 1,
          max_prompt_length: 4096,
          supports_negative_prompt: false,
          unsupported_parameters: ['negative_prompt'],
          aspect_ratios: ['1:1', '16:9', '9:16'],
          requires_age_verification: false,
          image: null,
          video: null,
        },
      ],
    },
  ],
  user_context: null,
} as unknown as ProvidersResponse;

// A fuller video contract (t2v/i2v/v2v) than GROK_VIDEO_PROVIDERS, for source-driven assertions.
const GROK_VIDEO_FULL_PROVIDERS: ProvidersResponse = {
  providers: [
    {
      provider: 'grok',
      name: 'xAI Grok',
      available: true,
      provisioning_mode: 'always_on',
      models: [makeGrokVideoModelInfo()],
    },
  ],
  user_context: null,
} as unknown as ProvidersResponse;

let providersData: ProvidersResponse | undefined;
let pricingData: PricingRuleResponse[] | undefined;
let pricingPending: boolean;
let queryKeys: unknown[][];
let pricingQueryIntervals: Array<number | false | undefined>;
let providerQueryIntervals: Array<number | false | undefined>;

vi.mock('@tanstack/svelte-query', () => ({
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
  createQuery: vi.fn(
    (optionsFn: () => { queryKey: readonly unknown[]; refetchInterval?: number | false }) => {
      const { queryKey, refetchInterval } = optionsFn();
      queryKeys.push([...queryKey]);
      const key = queryKey[0];
      if (key === 'providers') {
        providerQueryIntervals.push(refetchInterval);
        return {
          get data() {
            return providersData;
          },
          isPending: providersData === undefined,
        };
      }
      if (key === 'billing' && queryKey[1] === 'pricing') {
        pricingQueryIntervals.push(refetchInterval);
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
    },
  ),
  createMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

import Page from './+page.svelte';

beforeEach(() => {
  generationStore.reset();
  generationStore.setPrompt('a cat in a hat');
  pricingData = [];
  pricingPending = false;
  queryKeys = [];
  pricingQueryIntervals = [];
  providerQueryIntervals = [];
  setEventStreamStatus('disconnected');
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function generateButtons(): HTMLButtonElement[] {
  return screen
    .getAllByRole('button')
    .filter((btn): btn is HTMLButtonElement => /generate/i.test(btn.textContent ?? ''));
}

function pricingRule(overrides: Partial<PricingRuleResponse> = {}): PricingRuleResponse {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    provider: 'grok',
    generation_type: 't2i',
    model: 'grok-imagine-image',
    token_cost: 7,
    input_token_cost: 0,
    is_active: true,
    effective_from: '2026-05-01T00:00:00Z',
    effective_until: null,
    notes: null,
    ...overrides,
  };
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

  it('keeps a selected disabled model visible but makes the Create card unavailable', () => {
    providersData = {
      ...GROK_PROVIDERS,
      providers: [
        {
          ...GROK_PROVIDERS.providers[0],
          provisioning_mode: 'on_demand',
          models: [
            {
              ...GROK_PROVIDERS.providers[0].models[0],
              is_enabled: false,
              runtime: {
                state: 'none',
                session_id: null,
                deployment_id: null,
                operation_id: null,
              },
            },
          ],
        },
      ],
    };

    render(Page);

    expect(screen.getByText('Grok Imagine (Unavailable)')).toBeTruthy();
    expect(screen.getByText('Temporarily unavailable')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /start session/i })).toBeNull();
    for (const btn of generateButtons()) expect(btn.disabled).toBe(true);
  });

  it('shows the selected model summary and marks missing pricing as unavailable', () => {
    providersData = GROK_PROVIDERS;

    render(Page);

    expect(screen.getByRole('button', { name: 'Open model guide' })).toBeTruthy();
    expect(screen.getByText('Cost unavailable')).toBeTruthy();
  });

  it('uses the canonical billing pricing query key', () => {
    providersData = GROK_PROVIDERS;

    render(Page);

    expect(queryKeys).toContainEqual(['billing', 'pricing']);
    expect(queryKeys).not.toContainEqual(['pricing']);
    expect(pricingQueryIntervals).toEqual([60_000]);
  });

  it('polls authoritative provider runtime only while SSE is in fallback mode', () => {
    providersData = GROK_PROVIDERS;
    setEventStreamStatus('fallback');

    render(Page);

    expect(providerQueryIntervals).toEqual([8000]);
  });

  it('does not poll provider runtime while SSE is healthy', () => {
    providersData = GROK_PROVIDERS;
    setEventStreamStatus('connected');

    render(Page);

    expect(providerQueryIntervals).toEqual([false]);
  });

  it('shows a loading price while pricing is pending', () => {
    providersData = GROK_PROVIDERS;
    pricingData = undefined;
    pricingPending = true;

    render(Page);

    expect(screen.getByText('Loading price…')).toBeTruthy();
    expect(screen.queryByText('Cost unavailable')).toBeNull();
  });

  it('shows the current request estimate when a pricing rule is available', () => {
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

    expect(screen.getByText('Est. ◈ 7 tokens')).toBeTruthy();
    expect(screen.getAllByText('◈ 7')).toHaveLength(2);
  });

  it('keeps the summary and Generate buttons on the same multi-output estimate', () => {
    providersData = GROK_PROVIDERS;
    generationStore.setImageCount(4);
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

    expect(screen.getByText('Est. ◈ 28 tokens')).toBeTruthy();
    expect(screen.getAllByText('◈ 28')).toHaveLength(2);
  });

  it('includes the current input-image surcharge in the estimate', () => {
    providersData = GROK_PROVIDERS;
    generationStore.setMode('i2i');
    generationStore.setSourceMedia([
      {
        assetRef: 'upload:image_001',
        mediaType: 'image',
        previewUrl: null,
        label: null,
        available: true,
        role: null,
      },
    ]);
    pricingData = [
      {
        id: '00000000-0000-0000-0000-000000000001',
        provider: 'grok',
        generation_type: 'i2i',
        model: 'grok-imagine-image',
        token_cost: 7,
        input_token_cost: 2,
        is_active: true,
        effective_from: '2026-01-01T00:00:00Z',
        effective_until: null,
        notes: null,
      },
    ];

    render(Page);

    expect(screen.getByText('Est. ◈ 9 tokens')).toBeTruthy();
    expect(screen.getAllByText('◈ 9')).toHaveLength(2);
  });

  it('a source compatible with more than one advertised mode is ambiguous, not priced by a stale explicit mode', () => {
    providersData = {
      ...GROK_PROVIDERS,
      providers: [
        {
          ...GROK_PROVIDERS.providers[0],
          models: [
            {
              ...GROK_PROVIDERS.providers[0].models[0],
              generation_modes: {
                ...GROK_PROVIDERS.providers[0].models[0].generation_modes,
                // This model's t2i mode explicitly accepts an optional source
                // (min: 0), which — for the same single image — is also a
                // complete i2i candidate. Source-driven Create must not guess
                // between them via a stale `generationStore.mode`; it must
                // resolve ambiguous and refuse to price/submit.
                t2i: { source_media: { min: 0, max: 4, media_types: ['image'], roles: null } },
              },
            },
          ],
        },
      ],
    };
    generationStore.setSourceMedia([
      {
        assetRef: 'upload:image_001',
        mediaType: 'image',
        previewUrl: null,
        label: null,
        available: true,
        role: null,
      },
    ]);
    pricingData = [
      {
        id: '00000000-0000-0000-0000-000000000001',
        provider: 'grok',
        generation_type: 't2i',
        model: 'grok-imagine-image',
        token_cost: 7,
        input_token_cost: 2,
        is_active: true,
        effective_from: '2026-01-01T00:00:00Z',
        effective_until: null,
        notes: null,
      },
    ];

    render(Page);

    expect(screen.queryByText(/Est\. ◈/)).toBeNull();
    expect(screen.getAllByText('Cost unavailable').length).toBeGreaterThan(0);
    for (const btn of generateButtons()) expect(btn.disabled).toBe(true);
  });

  it('uses one output in the estimate after switching from four images to video', () => {
    providersData = GROK_VIDEO_PROVIDERS;
    generationStore.setImageCount(4);
    generationStore.setModel('grok-imagine-video');
    generationStore.setMode('t2v');
    pricingData = [
      {
        id: '00000000-0000-0000-0000-000000000001',
        provider: 'grok',
        generation_type: 't2v',
        model: 'grok-imagine-video',
        token_cost: 7,
        input_token_cost: 0,
        is_active: true,
        effective_from: '2026-01-01T00:00:00Z',
        effective_until: null,
        notes: null,
      },
    ];

    render(Page);

    expect(screen.getByText('Est. ◈ 7 tokens')).toBeTruthy();
    expect(screen.getAllByText('◈ 7')).toHaveLength(2);
  });

  it('prefills the typed guide example and closes the guide', async () => {
    providersData = GROK_PROVIDERS;
    render(Page);

    await fireEvent.click(screen.getByRole('button', { name: 'Open model guide' }));
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

  it('expires the mounted estimate and model-guide facts on the minute pricing clock', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
    providersData = GROK_PROVIDERS;
    pricingData = [pricingRule({ effective_until: '2026-06-01T00:01:00Z' })];

    render(Page);
    expect(screen.getByText('Est. ◈ 7 tokens')).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: 'Open model guide' }));
    expect(screen.getAllByText('Cost unavailable')).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(60_000);

    expect(screen.queryAllByText('Est. ◈ 7 tokens')).toHaveLength(0);
    // One compact estimate plus the T2I and I2I model-guide rows are unavailable.
    expect(screen.getAllByText('Cost unavailable')).toHaveLength(3);
  });

  it('uses a newly fetched pricing rule on the next pricing clock update', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
    providersData = GROK_PROVIDERS;
    pricingData = [pricingRule({ effective_until: '2026-06-01T00:01:00Z' })];

    render(Page);
    expect(screen.getByText('Est. ◈ 7 tokens')).toBeTruthy();

    // Simulate the Create-only query's minute refetch returning the rule that
    // was not effective when the previous response was fetched.
    pricingData = [
      pricingRule({
        id: '00000000-0000-0000-0000-000000000002',
        token_cost: 11,
        effective_from: '2026-06-01T00:01:00Z',
      }),
    ];
    await vi.advanceTimersByTimeAsync(60_000);

    expect(screen.getByText('Est. ◈ 11 tokens')).toBeTruthy();
    expect(screen.getAllByText('◈ 11')).toHaveLength(2);
  });
});

describe('/app/create page — source-driven generation mode (Phase 3)', () => {
  it('has no user-facing Type selector', () => {
    providersData = GROK_PROVIDERS;

    render(Page);

    expect(document.querySelector('[data-generation-mode]')).toBeNull();
    expect(screen.queryByText('Type')).toBeNull();
  });

  it('shows the source affordance for an image model while the draft is source-free', () => {
    providersData = GROK_PROVIDERS; // t2i (no source) + i2i (1..4 images)

    render(Page);

    expect(screen.getByText('Source Media')).toBeTruthy();
  });

  it('hides the source affordance for a t2i-only model with no retained source', () => {
    providersData = {
      ...GROK_PROVIDERS,
      providers: [
        {
          ...GROK_PROVIDERS.providers[0],
          models: [
            {
              ...GROK_PROVIDERS.providers[0].models[0],
              generation_modes: { t2i: { source_media: null } },
            },
          ],
        },
      ],
    };

    render(Page);

    expect(screen.queryByText('Source Media')).toBeNull();
    expect(screen.queryByText('Source Image')).toBeNull();
  });

  it('does not stay stuck in a stale i2i preference once the last source is removed (store.mode alone must not drive resolution)', async () => {
    providersData = GROK_PROVIDERS;
    pricingData = [
      {
        id: '00000000-0000-0000-0000-000000000001',
        provider: 'grok',
        generation_type: 'i2i',
        model: 'grok-imagine-image',
        token_cost: 7,
        input_token_cost: 2,
        is_active: true,
        effective_from: '2026-01-01T00:00:00Z',
        effective_until: null,
        notes: null,
      },
      {
        id: '00000000-0000-0000-0000-000000000002',
        provider: 'grok',
        generation_type: 't2i',
        model: 'grok-imagine-image',
        token_cost: 5,
        input_token_cost: 0,
        is_active: true,
        effective_from: '2026-01-01T00:00:00Z',
        effective_until: null,
        notes: null,
      },
    ];
    // A historical explicit selection is retained on the store, exactly as it
    // would be after a (now-removed) TypeSelector, or an in-progress replay.
    generationStore.setMode('i2i');
    generationStore.setSourceMedia([
      {
        assetRef: 'upload:image_001',
        mediaType: 'image',
        previewUrl: null,
        label: null,
        available: true,
        role: null,
      },
    ]);

    render(Page);
    expect(screen.getByText('Est. ◈ 9 tokens')).toBeTruthy();

    generationStore.setSourceMedia([]);

    // `store.mode` is untouched (still 'i2i') — Create must resolve the
    // no-source mode from the model + source shape anyway, not stay stuck on
    // an incomplete i2i because the stale field says so.
    expect(get(generationStore).mode).toBe('i2i');
    await waitFor(() => expect(screen.getByText('Est. ◈ 5 tokens')).toBeTruthy());
    for (const btn of generateButtons()) expect(btn.disabled).toBe(false);
  });

  it('Grok Video with no source accepts both image and video as the first source', () => {
    providersData = GROK_VIDEO_FULL_PROVIDERS;

    render(Page);

    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).toBeTruthy();
    const accept = fileInput?.getAttribute('accept') ?? '';
    expect(accept).toContain('image/');
    expect(accept).toContain('video/');
  });
});

// `always_on` sidesteps GPU-session gating entirely (deriveCardState returns
// READY unconditionally for it) so these tests can isolate role/pricing
// resolution without standing up session/runtime fixtures.
const AISHA_VIDEO_PROVIDERS: ProvidersResponse = {
  providers: [
    {
      provider: 'aisha',
      name: 'Aisha',
      available: true,
      provisioning_mode: 'always_on',
      models: [makeAishaVideoModelInfo()],
    },
  ],
  user_context: null,
} as unknown as ProvidersResponse;

const AISHA_VIDEO_PRICING: PricingRuleResponse[] = (['t2v', 'i2v', 'flf2v'] as const).map(
  (generation_type, index) => ({
    id: `00000000-0000-0000-0000-00000000000${index + 1}`,
    provider: 'aisha',
    generation_type,
    model: 'aisha-video',
    token_cost: 10 + index,
    input_token_cost: 0,
    is_active: true,
    effective_from: '2026-01-01T00:00:00Z',
    effective_until: null,
    notes: null,
  }),
);

describe('/app/create page — positional role source resolution (Phase 4, Aisha Video)', () => {
  beforeEach(() => {
    providersData = AISHA_VIDEO_PROVIDERS;
    pricingData = AISHA_VIDEO_PRICING;
    generationStore.setModel('aisha-video');
  });

  it('no source resolves T2V', () => {
    render(Page);
    expect(screen.getByText('Est. ◈ 10 tokens')).toBeTruthy();
    for (const btn of generateButtons()) expect(btn.disabled).toBe(false);
  });

  it('a first_frame role source resolves I2V', () => {
    generationStore.setSourceMedia([
      {
        assetRef: 'upload:first',
        mediaType: 'image',
        previewUrl: null,
        label: null,
        available: true,
        role: 'first_frame',
      },
    ]);

    render(Page);
    expect(screen.getByText('Est. ◈ 11 tokens')).toBeTruthy();
    for (const btn of generateButtons()) expect(btn.disabled).toBe(false);
  });

  it('first_frame + last_frame resolves FLF2V', () => {
    generationStore.setSourceMedia([
      {
        assetRef: 'upload:first',
        mediaType: 'image',
        previewUrl: null,
        label: null,
        available: true,
        role: 'first_frame',
      },
      {
        assetRef: 'upload:last',
        mediaType: 'image',
        previewUrl: null,
        label: null,
        available: true,
        role: 'last_frame',
      },
    ]);

    render(Page);
    expect(screen.getByText('Est. ◈ 12 tokens')).toBeTruthy();
    for (const btn of generateButtons()) expect(btn.disabled).toBe(false);
  });

  it('removing last_frame from a complete FLF2V draft falls back to I2V', async () => {
    generationStore.setSourceMedia([
      {
        assetRef: 'upload:first',
        mediaType: 'image',
        previewUrl: null,
        label: null,
        available: true,
        role: 'first_frame',
      },
      {
        assetRef: 'upload:last',
        mediaType: 'image',
        previewUrl: null,
        label: null,
        available: true,
        role: 'last_frame',
      },
    ]);

    render(Page);
    expect(screen.getByText('Est. ◈ 12 tokens')).toBeTruthy();

    generationStore.removeSourceMedia(1);

    await waitFor(() => expect(screen.getByText('Est. ◈ 11 tokens')).toBeTruthy());
    for (const btn of generateButtons()) expect(btn.disabled).toBe(false);
  });

  it('removing first_frame while last_frame remains leaves an incomplete positional draft — Generate disabled', async () => {
    generationStore.setSourceMedia([
      {
        assetRef: 'upload:first',
        mediaType: 'image',
        previewUrl: null,
        label: null,
        available: true,
        role: 'first_frame',
      },
      {
        assetRef: 'upload:last',
        mediaType: 'image',
        previewUrl: null,
        label: null,
        available: true,
        role: 'last_frame',
      },
    ]);

    render(Page);
    generationStore.removeSourceMedia(0);

    await waitFor(() => expect(screen.getAllByText('Cost unavailable').length).toBeGreaterThan(0));
    for (const btn of generateButtons()) expect(btn.disabled).toBe(true);
    // stale `generationStore.mode` (still whatever it defaulted to) must never
    // resurrect a resolved price for an incomplete positional draft.
    expect(screen.queryByText(/Est\. ◈/)).toBeNull();
  });

  it('removing the final positional source returns to T2V', async () => {
    generationStore.setSourceMedia([
      {
        assetRef: 'upload:last',
        mediaType: 'image',
        previewUrl: null,
        label: null,
        available: true,
        role: 'last_frame',
      },
    ]);

    render(Page);
    generationStore.removeSourceMedia(0);

    await waitFor(() => expect(screen.getByText('Est. ◈ 10 tokens')).toBeTruthy());
    for (const btn of generateButtons()) expect(btn.disabled).toBe(false);
  });
});
