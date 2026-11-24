import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { QueryClient } from '@tanstack/svelte-query';
import { http, HttpResponse } from 'msw';
import type { Component } from 'svelte';
import QueryHarness from '../../../tests/QueryHarness.svelte';
import { server } from '../../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../../mocks/config';
import { makeTrack } from '../../../mocks/factories/studio';
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/stores', () => ({
  page: {
    subscribe: (fn: (value: unknown) => void) => {
      fn({ url: new URL('http://localhost/app/studio/p') });
      return () => {};
    },
  },
}));
import TrackColumn from './TrackColumn.svelte';
afterEach(cleanup);
it('rolls back a keyboard reorder on mismatch and keeps focus on the track', async () => {
  const tracks = [
    makeTrack({ id: 'a', title: 'First', library_project_id: 'p' }),
    makeTrack({ id: 'b', title: 'Second', library_project_id: 'p', position: 1 }),
  ];
  let submitted: unknown;
  let reads = 0;
  server.use(
    http.get(`${BASE}/v1/studio/projects/p/tracks`, () => {
      reads++;
      return HttpResponse.json(tracks);
    }),
    http.put(`${BASE}/v1/studio/projects/p/tracks/order`, async ({ request }) => {
      submitted = await request.json();
      return HttpResponse.json(
        { error: 'track_order_mismatch', message: 'changed', status_code: 422 },
        { status: 422 },
      );
    }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(QueryHarness<{ projectId: string }>, {
    props: {
      component: TrackColumn as Component<{ projectId: string }>,
      componentProps: { projectId: 'p' },
      client,
    },
  });
  const first = await screen.findByRole('link', { name: /First/ });
  first.focus();
  await fireEvent.keyDown(first, { key: 'ArrowDown', altKey: true });
  await waitFor(() => expect(submitted).toEqual({ track_ids: ['b', 'a'] }));
  expect(
    await screen.findByText('The track list changed. It has been refreshed; try again.'),
  ).toBeTruthy();
  await waitFor(() => expect(reads).toBeGreaterThan(1));
  await waitFor(() => expect(document.activeElement).toBe(first));
  expect(screen.getAllByRole('listitem')[0].textContent).toContain('First');
  client.clear();
});
