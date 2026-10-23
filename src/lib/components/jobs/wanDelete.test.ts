import type { ComponentProps } from 'svelte';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/svelte';
import { QueryClient } from '@tanstack/svelte-query';
import { get } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import { server } from '../../../mocks/server';
import { makeUnifiedJobResponse } from '../../../mocks/factories/job';
import { jobStatusValues } from '$lib/api/types';
import { clearToasts, toasts } from '$lib/stores/toasts';
import QueryHarness from '../../../tests/QueryHarness.svelte';
import JobsPage from '../../../routes/(app)/app/jobs/+page.svelte';
import JobCard from './JobCard.svelte';
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
const base = 'http://localhost:8000';
let client: QueryClient;
beforeEach(() => {
  clearToasts();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.restoreAllMocks();
});
it.each(jobStatusValues)('only offers Delete for terminal jobs: %s', (status) => {
  render(JobCard, { job: makeUnifiedJobResponse({ status }), menuOpen: true, onDelete: vi.fn() });
  expect(screen.queryByRole('button', { name: 'Delete' }) !== null).toBe(
    !['pending', 'queued', 'running'].includes(status),
  );
});
it.each([204, 409, 500])('handles DELETE %s without losing a failed row', async (status) => {
  const job = makeUnifiedJobResponse({
    id: 'wan-delete',
    name: 'Deletion regression',
    status: 'completed',
  });
  let deleted = false;
  server.use(
    http.get(`${base}/v1/jobs`, () =>
      HttpResponse.json({
        items: deleted ? [] : [job],
        limit: 20,
        has_more: false,
        next_cursor: null,
      }),
    ),
    http.delete(`${base}/v1/jobs/:id`, () => {
      if (status === 204) {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }
      return HttpResponse.json(
        {
          error: status === 409 ? 'job_in_progress' : 'internal_error',
          message: 'Backend deletion message',
          status_code: status,
        },
        { status },
      );
    }),
  );
  render(QueryHarness<ComponentProps<typeof JobsPage>>, {
    client,
    component: JobsPage,
    componentProps: {},
  });
  await screen.findByText('Deletion regression');
  await fireEvent.click(screen.getByRole('button', { name: 'Job actions' }));
  await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  if (status === 204)
    await waitFor(() => expect(screen.queryByText('Deletion regression')).toBeNull());
  else {
    await waitFor(() =>
      expect(get(toasts).some((toast) => toast.message === 'Backend deletion message')).toBe(true),
    );
    expect(screen.getByText('Deletion regression')).toBeTruthy();
    expect(get(toasts).at(-1)?.type).toBe(status === 409 ? 'warning' : 'error');
  }
});
