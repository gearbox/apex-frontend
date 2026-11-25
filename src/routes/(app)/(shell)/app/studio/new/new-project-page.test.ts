import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { QueryClient } from '@tanstack/svelte-query';
import { http, HttpResponse } from 'msw';
import type { Component } from 'svelte';
import { get } from 'svelte/store';
import { clearToasts, toasts } from '$lib/stores/toasts';
import { makeArtist } from '../../../../../../mocks/factories/studio';
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
  clearToasts();
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

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(QueryHarness, {
    props: { component: Page as Component<object>, componentProps: {}, client },
  });
  return client;
}
it('creates the library project before enabling Studio and opens the workspace', async () => {
  const calls: string[] = [];
  server.use(
    http.post(`${BASE}/v1/library/projects`, () => {
      calls.push('post');
      return HttpResponse.json({ id: 'p1', name: 'Release' }, { status: 201 });
    }),
    http.put(`${BASE}/v1/studio/projects/:id`, () => {
      calls.push('put');
      return HttpResponse.json({ library_project_id: 'p1' });
    }),
  );
  const client = renderPage();
  await fireEvent.input(screen.getByLabelText(/Project name/), { target: { value: 'Release' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
  await waitFor(() => expect(state.goto).toHaveBeenCalledWith('/app/studio/p1'));
  expect(calls).toEqual(['post', 'put']);
  client.clear();
});
it('places a name conflict on the name field', async () => {
  server.use(
    http.post(`${BASE}/v1/library/projects`, () =>
      HttpResponse.json(
        { error: 'project_name_conflict', message: 'conflict', status_code: 409 },
        { status: 409 },
      ),
    ),
  );
  const client = renderPage();
  await fireEvent.input(screen.getByLabelText(/Project name/), { target: { value: 'Release' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
  expect(await screen.findByText('A project with this name already exists.')).toBeTruthy();
  expect(screen.getByLabelText(/Project name/).getAttribute('aria-invalid')).toBe('true');
  client.clear();
});
it('preselects an existing artist from the URL', async () => {
  state.url = new URL('http://localhost/app/studio/new?artist=artist-one');
  server.use(
    http.get(`${BASE}/v1/studio/artists`, () =>
      HttpResponse.json({
        items: [makeArtist({ id: 'artist-one', name: 'Mira' })],
        limit: 50,
        has_more: false,
        next_cursor: null,
      }),
    ),
  );
  const client = renderPage();
  await screen.findByRole('option', { name: 'Mira' });
  await waitFor(() =>
    expect((screen.getByLabelText('Artists') as HTMLSelectElement).value).toBe('artist-one'),
  );
  client.clear();
});
it('creating an artist in place keeps the typed project and selects the artist', async () => {
  let createdArtist = false;
  let submittedProfile: Record<string, unknown> | undefined;
  server.use(
    http.get(`${BASE}/v1/studio/artists`, () =>
      HttpResponse.json({
        items: createdArtist ? [makeArtist({ id: 'iris', name: 'Iris' })] : [],
        limit: 50,
        has_more: false,
        next_cursor: null,
      }),
    ),
    http.post(`${BASE}/v1/studio/artists`, () => {
      createdArtist = true;
      return HttpResponse.json(makeArtist({ id: 'iris', name: 'Iris' }), { status: 201 });
    }),
    http.post(`${BASE}/v1/library/projects`, () =>
      HttpResponse.json({ id: 'p1', name: 'Untitled release' }, { status: 201 }),
    ),
    http.put(`${BASE}/v1/studio/projects/p1`, async ({ request }) => {
      submittedProfile = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ library_project_id: 'p1' });
    }),
  );
  const client = renderPage();
  const name = screen.getByLabelText(/Project name/) as HTMLInputElement;
  const concept = screen.getByLabelText(/Concept/) as HTMLTextAreaElement;
  await fireEvent.input(name, { target: { value: 'My album' } });
  await fireEvent.input(concept, { target: { value: 'A story about returning home' } });
  await fireEvent.click(screen.getByRole('button', { name: 'New artist…' }));
  await fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Iris' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Create artist' }));
  await waitFor(() =>
    expect((screen.getByLabelText('Artists') as HTMLSelectElement).value).toBe('iris'),
  );
  expect(name.value).toBe('My album');
  expect(concept.value).toBe('A story about returning home');
  await fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
  await waitFor(() => expect(submittedProfile).toBeDefined());
  expect(submittedProfile).toEqual({
    release_kind: 'single',
    artist_id: 'iris',
    concept: 'A story about returning home',
  });
  expect(state.goto).toHaveBeenCalledWith('/app/studio/p1');
  client.clear();
});
it('a late artist creation does not close the reopened sheet or override a chosen artist', async () => {
  let releaseCreate!: () => void;
  let createStarted!: () => void;
  const createGate = new Promise<void>((resolve) => (releaseCreate = resolve));
  const requested = new Promise<void>((resolve) => (createStarted = resolve));
  server.use(
    http.get(`${BASE}/v1/studio/artists`, () =>
      HttpResponse.json({
        items: [makeArtist({ id: 'mira', name: 'Mira' })],
        limit: 50,
        has_more: false,
        next_cursor: null,
      }),
    ),
    http.post(`${BASE}/v1/studio/artists`, async () => {
      createStarted();
      await createGate;
      return HttpResponse.json(makeArtist({ id: 'iris', name: 'Iris' }), { status: 201 });
    }),
  );
  const client = renderPage();
  const artistSelect = (await screen.findByLabelText('Artists')) as HTMLSelectElement;
  await screen.findByRole('option', { name: 'Mira' });
  await fireEvent.change(artistSelect, { target: { value: 'mira' } });
  await fireEvent.click(screen.getByRole('button', { name: 'New artist…' }));
  await fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Iris' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Create artist' }));
  await requested;

  await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await fireEvent.click(screen.getByRole('button', { name: 'New artist…' }));
  const name = screen.getByLabelText('Name') as HTMLInputElement;
  await fireEvent.input(name, { target: { value: 'Nova' } });
  releaseCreate();

  await waitFor(() => expect(get(toasts).at(-1)?.message).toContain('Iris'));
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(name.value).toBe('Nova');
  expect(artistSelect.value).toBe('mira');
  expect(get(toasts).at(-1)?.type).toBe('success');
  client.clear();
});
it('a late artist creation failure toasts without changing the reopened sheet', async () => {
  let releaseCreate!: () => void;
  let createStarted!: () => void;
  const createGate = new Promise<void>((resolve) => (releaseCreate = resolve));
  const requested = new Promise<void>((resolve) => (createStarted = resolve));
  server.use(
    http.get(`${BASE}/v1/studio/artists`, () =>
      HttpResponse.json({ items: [], limit: 50, has_more: false, next_cursor: null }),
    ),
    http.post(`${BASE}/v1/studio/artists`, async () => {
      createStarted();
      await createGate;
      return HttpResponse.json(
        { error: 'server_error', message: 'failed', status_code: 500 },
        { status: 500 },
      );
    }),
  );
  const client = renderPage();
  await fireEvent.click(await screen.findByRole('button', { name: 'New artist…' }));
  await fireEvent.input(screen.getByLabelText('Name'), { target: { value: 'Iris' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Create artist' }));
  await requested;

  await fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await fireEvent.click(screen.getByRole('button', { name: 'New artist…' }));
  const name = screen.getByLabelText('Name') as HTMLInputElement;
  await fireEvent.input(name, { target: { value: 'Nova' } });
  releaseCreate();

  await waitFor(() => expect(get(toasts).at(-1)?.type).toBe('error'));
  expect(screen.getByRole('dialog')).toBeTruthy();
  expect(name.value).toBe('Nova');
  expect(get(toasts).at(-1)?.message).toContain('We could not create this artist.');
  expect(screen.queryByRole('alert')).toBeNull();
  client.clear();
});
it('the new-artist sheet explains an over-long name', async () => {
  server.use(
    http.get(`${BASE}/v1/studio/artists`, () =>
      HttpResponse.json({ items: [], limit: 50, has_more: false, next_cursor: null }),
    ),
  );
  const client = renderPage();
  await fireEvent.click(await screen.findByRole('button', { name: 'New artist…' }));
  const name = screen.getByLabelText('Name') as HTMLInputElement;
  await fireEvent.input(name, { target: { value: '😀'.repeat(101) } });
  const issue = await screen.findByText('This value is longer than allowed.');
  expect(name.getAttribute('aria-invalid')).toBe('true');
  expect(name.getAttribute('aria-describedby')).toContain(issue.id);
  expect(screen.getByText('101/100')).toBeTruthy();
  expect(
    (screen.getByRole('button', { name: 'Create artist' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  client.clear();
});
it('places a concept validation issue on the concept field', async () => {
  server.use(
    http.post(`${BASE}/v1/library/projects`, () =>
      HttpResponse.json({ id: 'p1', name: 'Release' }, { status: 201 }),
    ),
    http.put(`${BASE}/v1/studio/projects/:id`, () =>
      HttpResponse.json(
        {
          error: 'document_invalid',
          message: 'invalid',
          status_code: 422,
          detail: { issues: [{ path: 'concept', code: 'too_long_after_normalization' }] },
        },
        { status: 422 },
      ),
    ),
  );
  const client = renderPage();
  await fireEvent.input(screen.getByLabelText(/Project name/), { target: { value: 'Release' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
  const issue = await screen.findByText('This value is longer than allowed.');
  const field = screen.getByLabelText(/Concept/);
  expect(field.getAttribute('aria-invalid')).toBe('true');
  expect(field.getAttribute('aria-describedby')).toContain(issue.id);
  client.clear();
});
it('leaving during creation shows an Open toast without navigating', async () => {
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requested = new Promise<void>((resolve) => {
    started = resolve;
  });
  server.use(
    http.post(`${BASE}/v1/library/projects`, async () => {
      started();
      await gate;
      return HttpResponse.json({ id: 'p1', name: 'Release' }, { status: 201 });
    }),
    http.put(`${BASE}/v1/studio/projects/:id`, () =>
      HttpResponse.json({ library_project_id: 'p1' }),
    ),
  );
  const client = renderPage();
  await fireEvent.input(screen.getByLabelText(/Project name/), { target: { value: 'Release' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
  await requested;
  cleanup();
  release();
  await waitFor(() => expect(get(toasts).at(-1)?.action?.href).toBe('/app/studio/p1'));
  expect(get(toasts).at(-1)?.durationMs).toBe(8000);
  expect(state.goto).not.toHaveBeenCalled();
  client.clear();
});
it('a stale setup failure reports that the project is in Library', async () => {
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requested = new Promise<void>((resolve) => {
    started = resolve;
  });
  server.use(
    http.post(`${BASE}/v1/library/projects`, () =>
      HttpResponse.json({ id: 'p1', name: 'Release' }, { status: 201 }),
    ),
    http.put(`${BASE}/v1/studio/projects/p1`, async () => {
      started();
      await gate;
      return HttpResponse.json(
        { error: 'server_error', message: 'failed', status_code: 500 },
        { status: 500 },
      );
    }),
  );
  const client = renderPage();
  await fireEvent.input(screen.getByLabelText(/Project name/), { target: { value: 'Release' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
  await requested;
  cleanup();
  release();
  await waitFor(() => expect(get(toasts).at(-1)?.message).toContain("couldn't be set up"));
  expect(get(toasts).at(-1)?.message).toContain('The project is in your Library.');
  expect(state.goto).not.toHaveBeenCalled();
  client.clear();
});
