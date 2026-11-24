import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/svelte';
import { QueryClient } from '@tanstack/svelte-query';
import { http, HttpResponse } from 'msw';
import type { Component } from 'svelte';
import QueryHarness from '../../../../../tests/QueryHarness.svelte';
import { server } from '../../../../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../../../../mocks/config';
import { makeArtist, makeProjectProfile } from '../../../../../mocks/factories/studio';
import { studioKeys } from '$lib/queries/studio';
import Page from './+page.svelte';
let reveal: () => void = () => {};
beforeEach(() => {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        reveal = () =>
          callback(
            [{ isIntersecting: true } as IntersectionObserverEntry],
            {} as IntersectionObserver,
          );
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(QueryHarness, {
    props: { component: Page as Component<object>, componentProps: {}, client },
  });
  return client;
}
it('shows the empty state', async () => {
  const client = show();
  expect(await screen.findByText('Start a project. An album, an EP or a single.')).toBeTruthy();
  client.clear();
});
it('retains project cards on refetch error and caps the artist strip', async () => {
  const artists = Array.from({ length: 8 }, (_, i) =>
    makeArtist({ id: `a${i}`, name: `Artist ${i}` }),
  );
  const projects = [
    makeProjectProfile({ library_project_id: 'p1', name: 'With artist', artist_id: 'a0' }),
    makeProjectProfile({ library_project_id: 'p2', name: 'Solo' }),
  ];
  server.use(
    http.get(`${BASE}/v1/studio/projects`, () =>
      HttpResponse.json({ items: projects, limit: 30, has_more: false, next_cursor: null }),
    ),
    http.get(`${BASE}/v1/studio/artists`, () =>
      HttpResponse.json({ items: artists, limit: 50, has_more: false, next_cursor: null }),
    ),
  );
  const client = show();
  expect(await screen.findByText('With artist')).toBeTruthy();
  expect(await screen.findByText('Artist 0', { exact: true })).toBeTruthy();
  expect(screen.getByText(/No artist/)).toBeTruthy();
  expect(screen.queryByText('Artist 6')).toBeNull();
  server.use(
    http.get(`${BASE}/v1/studio/projects`, () =>
      HttpResponse.json(
        { error: 'server_error', message: 'failed', status_code: 500 },
        { status: 500 },
      ),
    ),
  );
  await client.refetchQueries({ queryKey: studioKeys.projects() });
  expect(await screen.findByText('With artist')).toBeTruthy();
  expect(await screen.findByRole('status')).toBeTruthy();
  client.clear();
});

it('loads the next project page when the sentinel appears', async () => {
  server.use(
    http.get(`${BASE}/v1/studio/projects`, ({ request }) => {
      const cursor = new URL(request.url).searchParams.get('cursor');
      return HttpResponse.json(
        cursor
          ? {
              items: [makeProjectProfile({ library_project_id: 'p2', name: 'Second page' })],
              limit: 30,
              has_more: false,
              next_cursor: null,
            }
          : {
              items: [makeProjectProfile({ library_project_id: 'p1', name: 'First page' })],
              limit: 30,
              has_more: true,
              next_cursor: 'next',
            },
      );
    }),
  );
  const client = show();
  await screen.findByText('First page');
  await act(async () => reveal());
  expect(await screen.findByText('Second page')).toBeTruthy();
  client.clear();
});
