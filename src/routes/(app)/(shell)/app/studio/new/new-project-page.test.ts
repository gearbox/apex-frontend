import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { QueryClient } from '@tanstack/svelte-query';
import { http, HttpResponse } from 'msw';
import type { Component } from 'svelte';
import QueryHarness from '../../../../../../tests/QueryHarness.svelte';
import { server } from '../../../../../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../../../../../mocks/config';
const state = vi.hoisted(() => ({
  goto: vi.fn().mockResolvedValue(undefined),
  url: new URL('http://localhost/app/studio/new'),
}));
vi.mock('$app/navigation', () => ({ goto: state.goto }));
vi.mock('$app/stores', () => ({
  page: {
    subscribe: (fn: (value: unknown) => void) => {
      fn({ url: state.url });
      return () => {};
    },
  },
}));
import Page from './+page.svelte';
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  state.url = new URL('http://localhost/app/studio/new');
});
it('retries setup without creating a second library project', async () => {
  let posts = 0;
  let puts = 0;
  server.use(
    http.post(`${BASE}/v1/library/projects`, () => {
      posts++;
      return HttpResponse.json({ id: 'project-1', name: 'Release' }, { status: 201 });
    }),
    http.put(`${BASE}/v1/studio/projects/:id`, () => {
      puts++;
      return puts === 1
        ? HttpResponse.json(
            { error: 'server_error', message: 'failed', status_code: 500 },
            { status: 500 },
          )
        : HttpResponse.json({ library_project_id: 'project-1' });
    }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(QueryHarness, {
    props: { component: Page as Component<object>, componentProps: {}, client },
  });
  await fireEvent.input(screen.getByLabelText(/Project name/), { target: { value: 'Release' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
  await screen.findByText("The project was created but Studio couldn't be set up. Try again.");
  await fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
  await waitFor(() => expect(state.goto).toHaveBeenCalledWith('/app/studio/project-1'));
  expect(posts).toBe(1);
  expect(puts).toBe(2);
  client.clear();
});
