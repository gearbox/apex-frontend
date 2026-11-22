import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { QueryClient } from '@tanstack/svelte-query';
import { http, HttpResponse } from 'msw';
import { server } from '../../../../../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../../../../../mocks/config';
import { makeMemory } from '../../../../../../mocks/factories/studio';
import { clearAuth, setAuth } from '$lib/stores/auth';
import { makeUserProfile } from '../../../../../../mocks/factories/user';
import QueryHarness from '../../../../../../tests/QueryHarness.svelte';
import type { Component } from 'svelte';

const state = vi.hoisted(() => ({
  page: {
    params: { id: 'artist-one' },
    url: new URL('http://localhost/app/artists/artist-one'),
  },
}));
vi.mock('$app/stores', () => ({
  page: {
    subscribe: (callback: (value: typeof state.page) => void) => {
      callback(state.page);
      return () => {};
    },
  },
}));
vi.mock('$app/navigation', () => ({ goto: vi.fn().mockResolvedValue(undefined) }));

import Page from './+page.svelte';

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

function menuFor(title: string) {
  return screen.getByRole('button', { name: `Actions for ${title}` });
}

function mockBrowserObservers() {
  vi.stubGlobal(
    'matchMedia',
    vi
      .fn()
      .mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
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
    await fireEvent.click(
      within(article).getByRole('button', { name: 'Actions for The first show' }),
    );
    await fireEvent.click(within(article).getByRole('menuitem', { name: 'Delete' }));
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
});
