import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { QueryClient } from '@tanstack/svelte-query';
import { http, HttpResponse } from 'msw';
import { server } from '../../../../../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../../../../../mocks/config';
import { makeArtist, makeMemory } from '../../../../../../mocks/factories/studio';
import { clearAuth, setAuth } from '$lib/stores/auth';
import { makeUserProfile } from '../../../../../../mocks/factories/user';
import QueryHarness from '../../../../../../tests/QueryHarness.svelte';
import type { Component } from 'svelte';
import { studioKeys } from '$lib/queries/studio';

const state = vi.hoisted(() => ({
  page: {
    params: { id: 'artist-one' },
    url: new URL('http://localhost/app/artists/artist-one'),
  },
  subscribers: [] as Array<(value: { params: { id: string }; url: URL }) => void>,
}));
vi.mock('$app/stores', () => ({
  page: {
    subscribe: (callback: (value: typeof state.page) => void) => {
      state.subscribers.push(callback);
      callback(state.page);
      return () => {
        state.subscribers = state.subscribers.filter((subscriber) => subscriber !== callback);
      };
    },
  },
}));
vi.mock('$app/navigation', () => ({ goto: vi.fn().mockResolvedValue(undefined) }));

import Page from './+page.svelte';
import DiaryLayoutHarness from './DiaryLayoutHarness.svelte';

const seedMemory = makeMemory({
  id: 'memory-one',
  artist_id: 'artist-one',
  title: 'The first show',
  body: 'A small room filled with warm light.\nThe crowd sang along.',
  occurred_on: '2026-05-03',
  status: 'active',
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

function renderLayoutPage(client: QueryClient) {
  render(QueryHarness, {
    props: {
      component: DiaryLayoutHarness as Component<object>,
      componentProps: {},
      client,
    },
  });
}

function switchArtist(id: string) {
  state.page = {
    params: { id },
    url: new URL('http://localhost/app/artists/' + id),
  };
  for (const subscriber of state.subscribers) subscriber(state.page);
}

function menuFor(title: string) {
  return screen.getByRole('button', { name: `Actions for ${title}` });
}

function mockBrowserObservers(desktop = false) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: desktop,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
}

beforeEach(() => {
  clearAuth();
  setAuth(
    {
      accessToken: 'artist-diary-access',
      refreshToken: 'artist-diary-refresh',
      expiresAt: '2030-01-01T00:15:00.000Z',
      contentCookieExpiresAt: '2030-01-02T00:00:00.000Z',
    },
    makeUserProfile(),
  );
  mockBrowserObservers();
});

afterEach(() => {
  cleanup();
  clearAuth();
  vi.unstubAllGlobals();
});

describe('artist diary page', () => {
  it.each([false, true])('renders the memory actions button at desktop=%s', async (desktop) => {
    mockBrowserObservers(desktop);
    server.use(
      http.get(BASE + '/v1/studio/artists/artist-one/memories', () =>
        HttpResponse.json({
          items: [seedMemory],
          limit: 30,
          has_more: false,
          next_cursor: null,
        }),
      ),
    );
    renderPage();
    await screen.findByRole('heading', { name: 'The first show' });
    expect(menuFor('The first show')).toBeTruthy();
  });

  it('archives, restores, and deletes memories across the Active and Archived lists', async () => {
    let memory = { ...seedMemory };
    const requestedStatuses: string[] = [];
    server.use(
      http.get(`${BASE}/v1/studio/artists/artist-one/memories`, ({ request }) => {
        const status = new URL(request.url).searchParams.get('status') ?? 'active';
        requestedStatuses.push(status);
        return HttpResponse.json({
          items: memory.status === status ? [memory] : [],
          limit: 30,
          has_more: false,
          next_cursor: null,
        });
      }),
      http.patch(`${BASE}/v1/studio/memories/memory-one`, async ({ request }) => {
        memory = { ...memory, ...((await request.json()) as Partial<typeof memory>) };
        return HttpResponse.json(memory);
      }),
      http.delete(`${BASE}/v1/studio/memories/memory-one`, () => {
        memory = { ...memory, status: 'archived' };
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderPage();
    await screen.findByRole('heading', { name: 'The first show' });

    await fireEvent.click(menuFor('The first show'));
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Archive' }));
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'The first show' })).toBeNull(),
    );

    await fireEvent.click(screen.getByRole('tab', { name: 'Archived' }));
    await screen.findByRole('heading', { name: 'The first show' });
    expect(requestedStatuses).toContain('archived');
    await fireEvent.click(menuFor('The first show'));
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Restore' }));
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'The first show' })).toBeNull(),
    );

    await fireEvent.click(screen.getByRole('tab', { name: 'Active' }));
    const memoryHeading = await screen.findByRole('heading', { name: 'The first show' });
    const article = memoryHeading.closest('article');
    if (!article) throw new Error('Expected the memory card article');
    await fireEvent.click(menuFor('The first show'));
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    const dialog = screen.getByRole('dialog');
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'The first show' })).toBeNull(),
    );
  });

  it('shows the restore-cap message and PATCHes only the changed edit field', async () => {
    let memory = { ...seedMemory, status: 'archived' as const };
    let patchBody: unknown;
    server.use(
      http.get(`${BASE}/v1/studio/artists/artist-one/memories`, ({ request }) => {
        const status = new URL(request.url).searchParams.get('status') ?? 'active';
        return HttpResponse.json({
          items: memory.status === status ? [memory] : [],
          limit: 30,
          has_more: false,
          next_cursor: null,
        });
      }),
      http.patch(`${BASE}/v1/studio/memories/memory-one`, async ({ request }) => {
        patchBody = await request.json();
        if ((patchBody as { status?: string }).status === 'active') {
          return HttpResponse.json(
            { error: 'memory_limit_reached', message: 'Memory cap', status_code: 409 },
            { status: 409 },
          );
        }
        memory = { ...memory, ...(patchBody as Partial<typeof memory>) };
        return HttpResponse.json(memory);
      }),
    );
    renderPage();
    await fireEvent.click(screen.getByRole('tab', { name: 'Archived' }));
    await screen.findByRole('heading', { name: 'The first show' });
    await fireEvent.click(menuFor('The first show'));
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Restore' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      '200 active memories is the limit',
    );

    await fireEvent.click(menuFor('The first show'));
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    const editDialog = screen.getByRole('dialog');
    await fireEvent.click(within(editDialog).getByText('More'));
    await fireEvent.input(within(editDialog).getByLabelText('Title'), {
      target: { value: 'A changed title' },
    });
    await fireEvent.click(within(editDialog).getByRole('button', { name: 'Save memory' }));
    await waitFor(() => expect(patchBody).toEqual({ title: 'A changed title' }));
  });

  it('keeps an edit validation error inside the edit dialog', async () => {
    server.use(
      http.get(BASE + '/v1/studio/artists/artist-one/memories', () =>
        HttpResponse.json({
          items: [seedMemory],
          limit: 30,
          has_more: false,
          next_cursor: null,
        }),
      ),
      http.patch(BASE + '/v1/studio/memories/memory-one', () =>
        HttpResponse.json(
          {
            error: 'document_invalid',
            message: 'Invalid memory',
            status_code: 422,
            detail: { issues: [{ path: 'title', code: 'too_long_after_normalization' }] },
          },
          { status: 422 },
        ),
      ),
    );
    renderPage();
    await screen.findByRole('heading', { name: 'The first show' });
    await fireEvent.click(menuFor('The first show'));
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog');
    await fireEvent.click(within(dialog).getByText('More'));
    await fireEvent.input(within(dialog).getByLabelText('Title'), {
      target: { value: 'A changed title' },
    });
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Save memory' }));

    expect(await within(dialog).findByText('This value is longer than allowed.')).toBeTruthy();
    expect(screen.getAllByText('This value is longer than allowed.')).toHaveLength(1);
    const alerts = screen.getAllByRole('alert');
    expect(within(dialog).getAllByRole('alert')).toHaveLength(1);
    expect(alerts.filter((alert) => !dialog.contains(alert))).toHaveLength(0);
  });

  it('closes the edit dialog on Escape and returns focus to its actions button', async () => {
    server.use(
      http.get(BASE + '/v1/studio/artists/artist-one/memories', () =>
        HttpResponse.json({
          items: [seedMemory],
          limit: 30,
          has_more: false,
          next_cursor: null,
        }),
      ),
    );
    renderPage();
    await screen.findByRole('heading', { name: 'The first show' });
    const trigger = menuFor('The first show');
    await fireEvent.click(trigger);
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(dialog).getByRole('textbox', { name: 'What happened?' }),
      ),
    );
    await fireEvent.keyDown(document.activeElement ?? dialog, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('switching artists resets the composer and pending dialogs', async () => {
    const artistOne = makeArtist({ id: 'artist-one', name: 'Artist One' });
    const artistTwo = makeArtist({ id: 'artist-two', name: 'Artist Two' });
    const posts: Array<{ artistId: string; body: Record<string, unknown> }> = [];
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity },
        mutations: { retry: false },
      },
    });
    const artistList = {
      items: [artistOne, artistTwo],
      limit: 50,
      has_more: false,
      next_cursor: null,
    };
    client.setQueryData(studioKeys.artists(), artistList);
    for (const artist of [artistOne, artistTwo]) {
      client.setQueryData(studioKeys.artist(artist.id), artist);
      const emptyPage = { items: [], limit: 30, has_more: false, next_cursor: null };
      client.setQueryData(studioKeys.memories(artist.id, 'active'), {
        pages: [
          {
            ...emptyPage,
            items: artist.id === 'artist-one' ? [seedMemory] : [],
          },
        ],
        pageParams: [null],
      });
      client.setQueryData(studioKeys.memories(artist.id, 'archived'), {
        pages: [emptyPage],
        pageParams: [null],
      });
    }
    server.use(
      http.post(BASE + '/v1/studio/artists/:artistId/memories', async ({ params, request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        posts.push({ artistId: String(params.artistId), body });
        return HttpResponse.json(
          makeMemory({
            id: 'memory-two',
            artist_id: String(params.artistId),
            title: String(body.title),
            body: String(body.body),
          }),
          { status: 201 },
        );
      }),
    );
    switchArtist('artist-one');
    renderLayoutPage(client);
    await screen.findByRole('heading', { name: 'Artist One' });

    await screen.findByRole('heading', { name: 'The first show' });
    const composer = screen.getByRole('textbox', { name: 'What happened?' }) as HTMLTextAreaElement;
    await fireEvent.input(composer, { target: { value: 'A draft for artist one only.' } });
    await fireEvent.click(menuFor('The first show'));
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    await screen.findByRole('dialog');
    switchArtist('artist-two');

    await screen.findByRole('heading', { name: 'Artist Two' });
    const secondComposer = screen.getByRole('textbox', {
      name: 'What happened?',
    }) as HTMLTextAreaElement;
    expect(secondComposer.value).toBe('');
    expect(screen.queryByRole('dialog')).toBeNull();

    await fireEvent.input(secondComposer, { target: { value: 'A memory for artist two.' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save memory' }));
    await waitFor(() =>
      expect(posts).toEqual([
        expect.objectContaining({
          artistId: 'artist-two',
          body: expect.objectContaining({ body: 'A memory for artist two.' }),
        }),
      ]),
    );
    expect(JSON.stringify(posts)).not.toContain('A draft for artist one only.');
  });
});
