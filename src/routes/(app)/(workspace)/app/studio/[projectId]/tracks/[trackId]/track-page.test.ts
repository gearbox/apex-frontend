import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { QueryClient } from '@tanstack/svelte-query';
import { get } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import QueryHarness from '../../../../../../../../tests/QueryHarness.svelte';
import { server } from '../../../../../../../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../../../../../../../mocks/config';
import {
  makeTrack,
  makeTrackDetail,
  makePlanVersion,
  makeLyricsVersion,
} from '../../../../../../../../mocks/factories/studio';
import type { Component } from 'svelte';
import { studioKeys } from '$lib/queries/studio';
import { clearToasts, toasts } from '$lib/stores/toasts';
const state = vi.hoisted(() => ({
  goto: vi.fn().mockResolvedValue(undefined),
  setPage: undefined as ((value: unknown) => void) | undefined,
}));
vi.mock('$app/navigation', () => ({ goto: state.goto }));
vi.mock('$app/stores', async () => {
  const { writable } = await import('svelte/store');
  const initial = pageValue('t');
  const page = writable(initial);
  state.setPage = (value) => page.set(value as typeof initial);
  return { page };
});
import { goto } from '$app/navigation';
import TrackPage from './+page.svelte';
import TrackPageLayoutHarness from './TrackPageLayoutHarness.svelte';
import { makeProjectProfile } from '../../../../../../../../mocks/factories/studio';
function pageValue(trackId: string) {
  return {
    params: { projectId: 'p', trackId },
    url: new URL(`http://localhost/app/studio/p/tracks/${trackId}`),
    route: { id: '/(app)/(workspace)/app/studio/[projectId]/tracks/[trackId]' },
  };
}
function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(QueryHarness, {
    props: { component: TrackPage as Component<object>, componentProps: {}, client },
  });
  return client;
}
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  state.setPage?.(pageValue('t'));
  clearToasts();
});
describe('read-only track', () => {
  it('matches lyrics by section id, hides instrumental lines and renders text safely', async () => {
    const plan = makePlanVersion({
      content: {
        title: 'Song',
        instrumental: false,
        references: [],
        sections: [
          { id: 'one', kind: 'verse', label: 'First' },
          { id: 'two', kind: 'chorus', label: 'Second' },
          { id: 'three', kind: 'instrumental', label: 'Solo', instrumental: true },
        ],
      },
    });
    const lyrics = makeLyricsVersion({
      content: {
        language: 'en',
        sections: [
          { section_id: 'two', lines: [{ text: 'second line' }] },
          { section_id: 'three', lines: [{ text: 'hidden line' }] },
          { section_id: 'one', lines: [{ text: '<img src=x onerror=alert(1)>' }] },
        ],
      },
    });
    server.use(
      http.get(`${BASE}/v1/studio/tracks/t`, () =>
        HttpResponse.json(
          makeTrackDetail({
            id: 't',
            library_project_id: 'p',
            current_plan: plan,
            current_lyrics: lyrics,
          }),
        ),
      ),
    );
    const client = show();
    await screen.findByRole('heading', { name: 'Plan' });
    const planSection = screen.getByRole('heading', { name: 'Plan' }).closest('section')!;
    const lyricsSection = screen.getByRole('heading', { name: 'Lyrics' }).closest('section')!;
    expect(within(planSection).getByText('First')).toBeTruthy();
    expect(within(lyricsSection).getByText('First')).toBeTruthy();
    expect(within(lyricsSection).getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
    expect(within(planSection).queryByText('second line')).toBeNull();
    expect(within(lyricsSection).getByText('second line')).toBeTruthy();
    expect(within(lyricsSection).queryByText('hidden line')).toBeNull();
    expect(screen.queryByText('hidden line')).toBeNull();
    expect(document.querySelector('img')).toBeNull();
    client.clear();
  });
  it('links the empty plan state to Suno import', async () => {
    server.use(
      http.get(`${BASE}/v1/studio/tracks/t`, () =>
        HttpResponse.json(makeTrackDetail({ id: 't', library_project_id: 'p' })),
      ),
    );
    const client = show();
    const emptyPlan = await screen.findByText(/No plan yet/);
    expect(
      within(emptyPlan.closest('p')!).getByRole('link', { name: 'Import from Suno' }),
    ).toBeTruthy();
    expect(screen.queryByText('No lyrics yet')).toBeNull();
    client.clear();
  });
  it('keeps the loaded track visible when a refetch fails', async () => {
    server.use(
      http.get(`${BASE}/v1/studio/tracks/t`, () =>
        HttpResponse.json(
          makeTrackDetail({ id: 't', library_project_id: 'p', title: 'Still here' }),
        ),
      ),
    );
    const client = show();
    expect(await screen.findByText('Still here')).toBeTruthy();
    server.use(
      http.get(`${BASE}/v1/studio/tracks/t`, () =>
        HttpResponse.json(
          { error: 'server_error', message: 'failed', status_code: 500 },
          { status: 500 },
        ),
      ),
    );
    await client.refetchQueries({ queryKey: studioKeys.track('t') });
    expect(screen.getByText('Still here')).toBeTruthy();
    expect(await screen.findByRole('status')).toBeTruthy();
    client.clear();
  });
});

it('a missing track explains and links back to its project', async () => {
  server.use(
    http.get(`${BASE}/v1/studio/tracks/t`, () =>
      HttpResponse.json(
        { error: 'track_not_found', message: 'missing', status_code: 404 },
        { status: 404 },
      ),
    ),
  );
  const client = show();
  expect(
    await screen.findByRole('heading', { name: "This track isn't here any more." }),
  ).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Back to project' }).getAttribute('href')).toBe(
    '/app/studio/p',
  );
  expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  client.clear();
});

it('a track from another project redirects to its own URL', async () => {
  server.use(
    http.get(`${BASE}/v1/studio/tracks/t`, () =>
      HttpResponse.json(makeTrackDetail({ id: 't', library_project_id: 'other-project' })),
    ),
  );
  const client = show();
  await waitFor(() =>
    expect(goto).toHaveBeenCalledWith('/app/studio/other-project/tracks/t', {
      replaceState: true,
    }),
  );
  client.clear();
});

it('title rename can be cancelled and returns focus to Rename', async () => {
  server.use(
    http.get(`${BASE}/v1/studio/tracks/t`, () =>
      HttpResponse.json(makeTrackDetail({ id: 't', library_project_id: 'p', title: 'First' })),
    ),
  );
  const client = show();
  await screen.findByRole('heading', { name: 'First' });
  expect(document.querySelectorAll('h1')).toHaveLength(1);
  const trigger = screen.getByRole('button', { name: 'Rename' });
  await fireEvent.click(trigger);
  const input = (await screen.findByRole('textbox', { name: 'Rename' })) as HTMLInputElement;
  await waitFor(() => expect(document.activeElement).toBe(input));
  expect(input.selectionStart).toBe(0);
  expect(input.selectionEnd).toBe('First'.length);
  expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
  await fireEvent.keyDown(input, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Rename' })).toBeNull());
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Rename' }));
  client.clear();
});

it('Save stays disabled while a rename is pending, even after typing', async () => {
  let releaseRename!: () => void;
  let renameStarted!: () => void;
  const renameGate = new Promise<void>((resolve) => (releaseRename = resolve));
  const renameRequested = new Promise<void>((resolve) => (renameStarted = resolve));
  let patches = 0;
  server.use(
    http.get(`${BASE}/v1/studio/tracks/t`, () =>
      HttpResponse.json(makeTrackDetail({ id: 't', library_project_id: 'p', title: 'First' })),
    ),
    http.patch(`${BASE}/v1/studio/tracks/t`, async ({ request }) => {
      patches++;
      const body = (await request.json()) as { title: string };
      renameStarted();
      await renameGate;
      return HttpResponse.json(makeTrack({ id: 't', library_project_id: 'p', title: body.title }));
    }),
  );
  const client = show();
  await screen.findByRole('heading', { name: 'First' });
  await fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
  const input = (await screen.findByRole('textbox', { name: 'Rename' })) as HTMLInputElement;
  await fireEvent.input(input, { target: { value: 'Second' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await renameRequested;
  await fireEvent.input(input, { target: { value: 'Later edit' } });
  const save = screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;
  expect(save.disabled).toBe(true);
  await fireEvent.click(save);
  expect(patches).toBe(1);
  releaseRename();
  await waitFor(() => expect(save.disabled).toBe(false));
  expect(input.value).toBe('Later edit');
  expect(patches).toBe(1);
  client.clear();
});

it('switching tracks discards the rename draft', async () => {
  const trackA = makeTrackDetail({ id: 'a', library_project_id: 'p', title: 'Track A' });
  const trackB = makeTrackDetail({ id: 'b', library_project_id: 'p', title: 'Track B' });
  let patches = 0;
  server.use(
    http.get(`${BASE}/v1/studio/projects/p`, () =>
      HttpResponse.json(makeProjectProfile({ library_project_id: 'p', name: 'Release' })),
    ),
    http.get(`${BASE}/v1/studio/projects/p/tracks`, () =>
      HttpResponse.json([
        makeTrack({ id: 'a', library_project_id: 'p', title: 'Track A' }),
        makeTrack({ id: 'b', library_project_id: 'p', title: 'Track B', position: 1 }),
      ]),
    ),
    http.get(`${BASE}/v1/studio/tracks/a`, () => HttpResponse.json(trackA)),
    http.get(`${BASE}/v1/studio/tracks/b`, () => HttpResponse.json(trackB)),
    http.patch(`${BASE}/v1/studio/tracks/:id`, () => {
      patches++;
      return HttpResponse.json({});
    }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  state.setPage?.(pageValue('a'));
  render(QueryHarness, {
    props: {
      component: TrackPageLayoutHarness as Component<object>,
      componentProps: {},
      client,
    },
  });
  await screen.findByRole('heading', { name: 'Track A' });
  await fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
  await fireEvent.input(await screen.findByRole('textbox', { name: 'Rename' }), {
    target: { value: 'Track A draft' },
  });

  state.setPage?.(pageValue('b'));
  await screen.findByRole('heading', { name: 'Track B' });
  expect(screen.queryByRole('textbox', { name: 'Rename' })).toBeNull();
  expect(screen.getByRole('heading', { name: 'Track B' })).toBeTruthy();
  expect(patches).toBe(0);
  client.clear();
});

it('a rename that finishes after a switch only toasts on failure', async () => {
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requested = new Promise<void>((resolve) => {
    started = resolve;
  });
  server.use(
    http.get(`${BASE}/v1/studio/projects/p`, () =>
      HttpResponse.json(makeProjectProfile({ library_project_id: 'p', name: 'Release' })),
    ),
    http.get(`${BASE}/v1/studio/projects/p/tracks`, () =>
      HttpResponse.json([
        makeTrack({ id: 'a', library_project_id: 'p', title: 'Track A' }),
        makeTrack({ id: 'b', library_project_id: 'p', title: 'Track B', position: 1 }),
      ]),
    ),
    http.get(`${BASE}/v1/studio/tracks/a`, () =>
      HttpResponse.json(makeTrackDetail({ id: 'a', library_project_id: 'p', title: 'Track A' })),
    ),
    http.get(`${BASE}/v1/studio/tracks/b`, () =>
      HttpResponse.json(makeTrackDetail({ id: 'b', library_project_id: 'p', title: 'Track B' })),
    ),
    http.patch(`${BASE}/v1/studio/tracks/a`, async () => {
      started();
      await gate;
      return HttpResponse.json(
        { error: 'server_error', message: 'failed', status_code: 500 },
        { status: 500 },
      );
    }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  state.setPage?.(pageValue('a'));
  render(QueryHarness, {
    props: {
      component: TrackPageLayoutHarness as Component<object>,
      componentProps: {},
      client,
    },
  });
  await screen.findByRole('heading', { name: 'Track A' });
  await fireEvent.click(screen.getByRole('button', { name: 'Rename' }));
  await fireEvent.input(await screen.findByRole('textbox', { name: 'Rename' }), {
    target: { value: 'Track A draft' },
  });
  await fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await requested;

  state.setPage?.(pageValue('b'));
  await screen.findByRole('heading', { name: 'Track B' });
  release();
  await waitFor(() => expect(get(toasts).at(-1)?.type).toBe('error'));
  expect(screen.queryByRole('textbox', { name: 'Rename' })).toBeNull();
  expect(screen.queryByText('Could not save. Please try again.')).toBeNull();
  expect(get(toasts).at(-1)?.message).toContain('Could not save');
  client.clear();
});
