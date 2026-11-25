import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { QueryClient } from '@tanstack/svelte-query';
import { get } from 'svelte/store';
import type { Writable } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import type { Component } from 'svelte';
import QueryHarness from '../../../tests/QueryHarness.svelte';
import { server } from '../../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../../mocks/config';
import { makeTrack } from '../../../mocks/factories/studio';
import { clearToasts, toasts } from '$lib/stores/toasts';
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/utils/breakpoints', async () => {
  const { writable } = await import('svelte/store');
  return { isDesktop: writable(false) };
});
vi.mock('$app/stores', () => ({
  page: {
    subscribe: (fn: (value: unknown) => void) => {
      fn({ url: new URL('http://localhost/app/studio/p') });
      return () => {};
    },
  },
}));
import TrackColumn from './TrackColumn.svelte';
import { isDesktop } from '$lib/utils/breakpoints';
const desktop = isDesktop as Writable<boolean>;
afterEach(() => {
  cleanup();
  desktop.set(false);
  clearToasts();
});
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

function showColumn() {
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
  return client;
}
it('creates a track and keeps focus in the input', async () => {
  server.use(
    http.get(`${BASE}/v1/studio/projects/p/tracks`, () => HttpResponse.json([])),
    http.post(`${BASE}/v1/studio/projects/p/tracks`, async ({ request }) => {
      const body = (await request.json()) as { title: string };
      return HttpResponse.json(
        makeTrack({ id: 'created', library_project_id: 'p', title: body.title }),
        { status: 201 },
      );
    }),
  );
  const client = showColumn();
  const input = await screen.findByLabelText('New track');
  input.focus();
  await fireEvent.input(input, { target: { value: 'New song' } });
  await fireEvent.submit(input.closest('form')!);
  expect(await screen.findByRole('link', { name: /New song/ })).toBeTruthy();
  expect(document.activeElement).toBe(input);
  await waitFor(() => expect((input as HTMLInputElement).value).toBe(''));
  client.clear();
});
it('renames a track using its menu', async () => {
  server.use(
    http.get(`${BASE}/v1/studio/projects/p/tracks`, () =>
      HttpResponse.json([makeTrack({ id: 'a', library_project_id: 'p', title: 'First' })]),
    ),
    http.patch(`${BASE}/v1/studio/tracks/a`, async ({ request }) => {
      const body = (await request.json()) as { title: string };
      return HttpResponse.json(makeTrack({ id: 'a', library_project_id: 'p', title: body.title }));
    }),
  );
  const client = showColumn();
  await screen.findByRole('link', { name: /First/ });
  await fireEvent.click(screen.getByRole('button', { name: 'Actions for First' }));
  await fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));
  const input = await screen.findByRole('textbox', { name: 'Rename' });
  await fireEvent.input(input, { target: { value: 'Changed' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  expect(await screen.findByRole('link', { name: /Changed/ })).toBeTruthy();
  client.clear();
});
it('confirms deletion and explains an active run', async () => {
  server.use(
    http.get(`${BASE}/v1/studio/projects/p/tracks`, () =>
      HttpResponse.json([makeTrack({ id: 'a', library_project_id: 'p', title: 'First' })]),
    ),
    http.delete(`${BASE}/v1/studio/tracks/a`, () =>
      HttpResponse.json(
        { error: 'run_in_progress', message: 'busy', status_code: 409 },
        { status: 409 },
      ),
    ),
  );
  const client = showColumn();
  await screen.findByRole('link', { name: /First/ });
  await fireEvent.click(screen.getByRole('button', { name: 'Actions for First' }));
  await fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
  expect(
    await screen.findByText('Delete “First” and all its plan and lyrics versions?'),
  ).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByText('Delete “First” and all its plan and lyrics versions?')).toBeNull();
  await fireEvent.click(screen.getByRole('button', { name: 'Actions for First' }));
  await fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
  await fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(await screen.findByText('This track has a run in progress.')).toBeTruthy();
  expect(screen.getByRole('link', { name: /First/ })).toBeTruthy();
  client.clear();
});
it('inline rename takes focus, Escape cancels and focus returns to the row menu', async () => {
  desktop.set(true);
  server.use(
    http.get(`${BASE}/v1/studio/projects/p/tracks`, () =>
      HttpResponse.json([makeTrack({ id: 'a', library_project_id: 'p', title: 'First' })]),
    ),
  );
  const client = showColumn();
  await screen.findByRole('link', { name: /First/ });
  await fireEvent.click(screen.getByRole('button', { name: 'Actions for First' }));
  await fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));
  const input = (await screen.findByRole('textbox', { name: 'Rename' })) as HTMLInputElement;
  await waitFor(() => expect(document.activeElement).toBe(input));
  expect(input.selectionStart).toBe(0);
  expect(input.selectionEnd).toBe('First'.length);
  await fireEvent.keyDown(input, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Rename' })).toBeNull());
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Actions for First' }));
  client.clear();
});
it.each(['success', 'failure'] as const)(
  'a late rename result for another row does not touch the open editor (%s)',
  async (outcome) => {
    desktop.set(true);
    let release!: () => void;
    let started!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const requested = new Promise<void>((resolve) => {
      started = resolve;
    });
    const tracks = [
      makeTrack({ id: 'a', title: 'Alpha', library_project_id: 'p' }),
      makeTrack({ id: 'b', title: 'Beta', library_project_id: 'p', position: 1 }),
    ];
    server.use(
      http.get(`${BASE}/v1/studio/projects/p/tracks`, () => HttpResponse.json(tracks)),
      http.patch(`${BASE}/v1/studio/tracks/a`, async () => {
        started();
        await gate;
        if (outcome === 'failure') {
          return HttpResponse.json(
            { error: 'server_error', message: 'failed', status_code: 500 },
            { status: 500 },
          );
        }
        return HttpResponse.json(makeTrack({ id: 'a', title: 'Shared', library_project_id: 'p' }));
      }),
    );
    const client = showColumn();
    await screen.findByRole('link', { name: /Alpha/ });
    await fireEvent.click(screen.getByRole('button', { name: 'Actions for Alpha' }));
    await fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));
    const alphaInput = await screen.findByRole('textbox', { name: 'Rename' });
    await fireEvent.input(alphaInput, { target: { value: 'Shared' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await requested;

    await fireEvent.keyDown(alphaInput, { key: 'Escape' });
    await fireEvent.click(screen.getByRole('button', { name: 'Actions for Beta' }));
    await fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));
    const betaInput = (await screen.findByRole('textbox', { name: 'Rename' })) as HTMLInputElement;
    await fireEvent.input(betaInput, { target: { value: 'Shared' } });

    release();
    await waitFor(() => expect(betaInput.value).toBe('Shared'));
    expect(screen.getByRole('textbox', { name: 'Rename' })).toBe(betaInput);
    if (outcome === 'failure') {
      await waitFor(() => expect(get(toasts).at(-1)?.type).toBe('error'));
      expect(get(toasts).at(-1)?.message).toContain('Alpha');
      expect(screen.queryByText('Could not save. Please try again.')).toBeNull();
    } else {
      expect(get(toasts)).toHaveLength(0);
    }
    client.clear();
  },
);
it('rename and delete sheets offer Cancel', async () => {
  server.use(
    http.get(`${BASE}/v1/studio/projects/p/tracks`, () =>
      HttpResponse.json([makeTrack({ id: 'a', library_project_id: 'p', title: 'First' })]),
    ),
  );
  const client = showColumn();
  await screen.findByRole('link', { name: /First/ });
  await fireEvent.click(screen.getByRole('button', { name: 'Actions for First' }));
  await fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));
  expect(await screen.findByRole('button', { name: 'Cancel' })).toBeTruthy();
  await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog')).toBeNull();

  await fireEvent.click(screen.getByRole('button', { name: 'Actions for First' }));
  await fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
  expect(await screen.findByRole('button', { name: 'Cancel' })).toBeTruthy();
  client.clear();
});
it('a title typed while the previous one is created is kept', async () => {
  let tracks = [] as ReturnType<typeof makeTrack>[];
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requested = new Promise<void>((resolve) => {
    started = resolve;
  });
  server.use(
    http.get(`${BASE}/v1/studio/projects/p/tracks`, () => HttpResponse.json(tracks)),
    http.post(`${BASE}/v1/studio/projects/p/tracks`, async ({ request }) => {
      const body = (await request.json()) as { title: string };
      started();
      await gate;
      const created = makeTrack({ id: 'created', library_project_id: 'p', title: body.title });
      tracks = [created];
      return HttpResponse.json(created, { status: 201 });
    }),
  );
  const client = showColumn();
  const input = (await screen.findByLabelText('New track')) as HTMLInputElement;
  await fireEvent.input(input, { target: { value: 'Track one' } });
  await fireEvent.submit(input.closest('form')!);
  await requested;
  await fireEvent.input(input, { target: { value: 'Track two, typed while saving' } });
  release();
  await screen.findByRole('link', { name: /Track one/ });
  await waitFor(() => expect(input.value).toBe('Track two, typed while saving'));
  client.clear();
});
it('an over-long title explains the limit', async () => {
  server.use(http.get(`${BASE}/v1/studio/projects/p/tracks`, () => HttpResponse.json([])));
  const client = showColumn();
  const input = (await screen.findByLabelText('New track')) as HTMLInputElement;
  await fireEvent.input(input, { target: { value: 'x'.repeat(201) } });
  const message = await screen.findByText('This value is longer than allowed.');
  expect(input.getAttribute('aria-invalid')).toBe('true');
  expect(input.getAttribute('aria-describedby')).toContain(message.id);
  expect(screen.getByText('201/200')).toBeTruthy();
  client.clear();
});
it('disables creation at the track limit', async () => {
  const tracks = Array.from({ length: 64 }, (_, i) =>
    makeTrack({ id: `t${i}`, library_project_id: 'p', title: `Song ${i}`, position: i }),
  );
  server.use(http.get(`${BASE}/v1/studio/projects/p/tracks`, () => HttpResponse.json(tracks)));
  const client = showColumn();
  await screen.findByText('A project can have up to 64 tracks.');
  expect((screen.getByLabelText('New track') as HTMLInputElement).disabled).toBe(true);
  client.clear();
});
