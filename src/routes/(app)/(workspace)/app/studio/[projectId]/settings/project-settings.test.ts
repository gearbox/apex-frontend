import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { QueryClient } from '@tanstack/svelte-query';
import { http, HttpResponse } from 'msw';
import type { Component } from 'svelte';
import QueryHarness from '../../../../../../../tests/QueryHarness.svelte';
import { server } from '../../../../../../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../../../../../../mocks/config';
import { makeProjectProfile, makeTrack } from '../../../../../../../mocks/factories/studio';
const state = vi.hoisted(() => ({ goto: vi.fn().mockResolvedValue(undefined) }));
vi.mock('$app/navigation', () => ({ goto: state.goto }));
vi.mock('$app/stores', () => ({
  page: {
    subscribe: (fn: (value: unknown) => void) => {
      fn({ params: { projectId: 'p' }, url: new URL('http://localhost/app/studio/p/settings') });
      return () => {};
    },
  },
}));
import Page from './+page.svelte';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(QueryHarness, {
    props: { component: Page as Component<object>, componentProps: {}, client },
  });
  return client;
}
it('saves the profile without renaming when the name is unchanged', async () => {
  const profile = makeProjectProfile({ library_project_id: 'p', name: 'Release' });
  let patchCount = 0;
  let putCount = 0;
  server.use(
    http.get(`${BASE}/v1/studio/projects/p`, () => HttpResponse.json(profile)),
    http.get(`${BASE}/v1/studio/projects/p/tracks`, () => HttpResponse.json([])),
    http.patch(`${BASE}/v1/library/projects/p`, () => {
      patchCount++;
      return HttpResponse.json({});
    }),
    http.put(`${BASE}/v1/studio/projects/p`, () => {
      putCount++;
      return HttpResponse.json(profile);
    }),
  );
  const client = show();
  await screen.findByDisplayValue('Release');
  await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(putCount).toBe(1));
  expect(patchCount).toBe(0);
  client.clear();
});
it('disables removal while tracks exist', async () => {
  server.use(
    http.get(`${BASE}/v1/studio/projects/p`, () =>
      HttpResponse.json(
        makeProjectProfile({ library_project_id: 'p', name: 'Release', track_count: 1 }),
      ),
    ),
    http.get(`${BASE}/v1/studio/projects/p/tracks`, () =>
      HttpResponse.json([makeTrack({ library_project_id: 'p' })]),
    ),
  );
  const client = show();
  await screen.findByText('Remove all tracks before removing this project from Studio.');
  expect(
    (screen.getByRole('button', { name: 'Remove from Studio' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  client.clear();
});
