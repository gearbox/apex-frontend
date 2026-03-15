import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { http, HttpResponse } from 'msw';
import { server } from '../../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../../mocks/config';

// Mock $paraglide/messages
vi.mock('$paraglide/messages', () => ({
  profile_language_label: () => 'Display Language',
  profile_language_en: () => 'English',
  profile_language_ru: () => 'Русский',
  profile_language_sr: () => 'Srpski',
}));

// Mock $paraglide/runtime
vi.mock('$paraglide/runtime', () => ({
  setLanguageTag: vi.fn(),
  languageTag: vi.fn(() => 'en'),
}));

// Mock $app/environment
vi.mock('$app/environment', () => ({ browser: true }));

// Track what the mutation function was called with
let lastMutateArg: unknown = null;
let isPendingMock = false;
const mutateFn = vi.fn((arg: unknown) => {
  lastMutateArg = arg;
});

vi.mock('@tanstack/svelte-query', () => {
  const { writable, readable } = require('svelte/store');
  return {
    useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
    createMutation: vi.fn((optionsFn: () => object) => {
      // Call optionsFn to register the mutation but we control the result
      optionsFn();
      return {
        mutate: mutateFn,
        get isPending() {
          return isPendingMock;
        },
      };
    }),
    QueryClient: vi.fn(() => ({})),
  };
});

import LanguageSelector from './LanguageSelector.svelte';

beforeEach(() => {
  localStorage.clear();
  lastMutateArg = null;
  isPendingMock = false;
  mutateFn.mockClear();
});

describe('LanguageSelector', () => {
  it('renders select with all locale options', () => {
    render(LanguageSelector);

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select).toBeTruthy();

    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toContain('en');
    expect(options).toContain('ru');
    expect(options).toContain('sr');
  });

  it('renders the language label', () => {
    render(LanguageSelector);
    expect(screen.getByText('Display Language')).toBeTruthy();
  });

  it('calls PATCH /v1/users/me on change via mutate', async () => {
    let patchedBody: unknown;
    server.use(
      http.patch(`${BASE}/v1/users/me`, async ({ request }) => {
        patchedBody = await request.json();
        return HttpResponse.json({
          id: 'usr_1',
          email: 'test@example.com',
          display_name: 'Test',
          subscription_tier: 'free',
          locale: 'sr',
          role: 'user',
          is_active: true,
          email_verified: true,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        });
      }),
    );

    render(LanguageSelector);
    const select = screen.getByRole('combobox') as HTMLSelectElement;

    await fireEvent.change(select, { target: { value: 'sr' } });

    expect(mutateFn).toHaveBeenCalledWith('sr');
  });

  it('disables select when isPending is true', async () => {
    isPendingMock = true;

    render(LanguageSelector);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.disabled).toBe(true);
  });
});
