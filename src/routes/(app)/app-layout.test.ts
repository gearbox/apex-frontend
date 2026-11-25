import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { QueryClient } from '@tanstack/svelte-query';
import type { Component } from 'svelte';
import QueryHarness from '../../tests/QueryHarness.svelte';
import { setAuthStatus } from '$lib/stores/auth';

vi.hoisted(() => {
  if (typeof window !== 'undefined' && !window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: false,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
        dispatchEvent: () => false,
      }),
    });
  }
});

vi.mock('$app/stores', () => ({
  page: {
    subscribe: (fn: (value: unknown) => void) => {
      fn({ url: new URL('http://localhost/app/studio') });
      return () => {};
    },
  },
}));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/api/auth', () => ({ initAuth: vi.fn().mockResolvedValue(undefined) }));
vi.mock('$lib/queries/legal', () => ({
  currentLegalQueryOptions: () => ({ queryKey: ['test-legal'], queryFn: async () => null }),
}));

import { initAuth } from '$lib/api/auth';
import Harness from './AppLayoutHarness.svelte';

afterEach(() => {
  cleanup();
  setAuthStatus('unknown');
  vi.clearAllMocks();
});

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(QueryHarness, {
    props: { component: Harness as Component<object>, componentProps: {}, client },
  });
  return client;
}

it('does not re-initialise auth that is already known', async () => {
  setAuthStatus('unauthenticated');
  const client = show();
  expect(await screen.findByText('Authenticated route content')).toBeTruthy();
  await waitFor(() => expect(initAuth).not.toHaveBeenCalled());
  client.clear();
});

it('initializes auth on a direct deep link when status is unknown', async () => {
  setAuthStatus('unknown');
  const client = show();
  await waitFor(() => expect(initAuth).toHaveBeenCalledTimes(1));
  client.clear();
});
