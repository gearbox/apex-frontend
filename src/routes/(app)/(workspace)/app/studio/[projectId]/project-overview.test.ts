import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { QueryClient } from '@tanstack/svelte-query';
import { http, HttpResponse } from 'msw';
import type { Component } from 'svelte';
import type { Writable } from 'svelte/store';
import QueryHarness from '../../../../../../tests/QueryHarness.svelte';
import { server } from '../../../../../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../../../../../mocks/config';
import { makeArtist, makeProjectProfile } from '../../../../../../mocks/factories/studio';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/stores', () => ({
  page: {
    subscribe: (fn: (value: unknown) => void) => {
      fn({
        params: { projectId: 'p' },
        url: new URL('http://localhost/app/studio/p'),
        route: { id: '/(app)/(workspace)/app/studio/[projectId]' },
      });
      return () => {};
    },
  },
}));
vi.mock('$lib/utils/breakpoints', async () => {
  const { writable } = await import('svelte/store');
  return { isDesktop: writable(false) };
});

import { isDesktop } from '$lib/utils/breakpoints';
import Harness from './ProjectOverviewHarness.svelte';

afterEach(() => {
  cleanup();
  (isDesktop as Writable<boolean>).set(false);
});

it('mobile shows one h1 and the project details', async () => {
  server.use(
    http.get(`${BASE}/v1/studio/projects/p`, () =>
      HttpResponse.json(
        makeProjectProfile({
          library_project_id: 'p',
          name: 'Summer album',
          release_kind: 'album',
          artist_id: 'iris',
          concept: 'A long idea about finding home.',
        }),
      ),
    ),
    http.get(`${BASE}/v1/studio/artists`, () =>
      HttpResponse.json({
        items: [makeArtist({ id: 'iris', name: 'Iris' })],
        limit: 50,
        has_more: false,
        next_cursor: null,
      }),
    ),
    http.get(`${BASE}/v1/studio/projects/p/tracks`, () => HttpResponse.json([])),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(QueryHarness, {
    props: { component: Harness as Component<object>, componentProps: {}, client },
  });
  expect(await screen.findByRole('heading', { name: 'Summer album' })).toBeTruthy();
  expect(screen.getByText('Album · Iris')).toBeTruthy();
  expect(screen.getByText('A long idea about finding home.')).toBeTruthy();
  expect(container.querySelectorAll('h1')).toHaveLength(1);
  expect(container.querySelector('.workspace-scroll')).toBeTruthy();
  await fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
  expect(screen.getByRole('button', { name: 'Show less' }).getAttribute('aria-expanded')).toBe(
    'true',
  );
  client.clear();
});
