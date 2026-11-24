import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import { QueryClient } from '@tanstack/svelte-query';
import { http, HttpResponse } from 'msw';
import type { Component } from 'svelte';
import QueryHarness from '../../../../../../tests/QueryHarness.svelte';
import { server } from '../../../../../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../../../../../mocks/config';
import { makeProjectProfile } from '../../../../../../mocks/factories/studio';
import { studioKeys } from '$lib/queries/studio';
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/stores', () => ({
  page: {
    subscribe: (fn: (value: unknown) => void) => {
      fn({ params: { projectId: 'p' }, url: new URL('http://localhost/app/studio/p') });
      return () => {};
    },
  },
}));
import Harness from './ProjectLayoutHarness.svelte';
afterEach(cleanup);
function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(QueryHarness, {
    props: { component: Harness as Component<object>, componentProps: {}, client },
  });
  return client;
}
it('shows the Studio not-found state on a first 404', async () => {
  server.use(
    http.get(`${BASE}/v1/studio/projects/p`, () =>
      HttpResponse.json(
        { error: 'not_found', message: 'missing', status_code: 404 },
        { status: 404 },
      ),
    ),
  );
  const client = show();
  expect(await screen.findByText("This project isn't in Studio")).toBeTruthy();
  client.clear();
});
it('keeps the workspace mounted when a background refresh fails', async () => {
  server.use(
    http.get(`${BASE}/v1/studio/projects/p`, () =>
      HttpResponse.json(makeProjectProfile({ library_project_id: 'p' })),
    ),
  );
  const client = show();
  expect(await screen.findByText('Workspace content')).toBeTruthy();
  server.use(
    http.get(`${BASE}/v1/studio/projects/p`, () =>
      HttpResponse.json(
        { error: 'server_error', message: 'failed', status_code: 500 },
        { status: 500 },
      ),
    ),
  );
  await client.refetchQueries({ queryKey: studioKeys.project('p'), exact: true });
  expect(await screen.findByText('Workspace content')).toBeTruthy();
  expect(
    screen.getByText('Could not refresh. Your existing content is still available.'),
  ).toBeTruthy();
  client.clear();
});
