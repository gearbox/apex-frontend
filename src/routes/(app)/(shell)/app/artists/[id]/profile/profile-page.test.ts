import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { QueryClient } from '@tanstack/svelte-query';
import { http, HttpResponse } from 'msw';
import { server } from '../../../../../../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../../../../../../mocks/config';
import { makeArtist } from '../../../../../../../mocks/factories/studio';
import { clearAuth, setAuth } from '$lib/stores/auth';
import { makeUserProfile } from '../../../../../../../mocks/factories/user';
import QueryHarness from '../../../../../../../tests/QueryHarness.svelte';
import type { Component } from 'svelte';

const state = vi.hoisted(() => ({
  page: {
    params: { id: 'artist-one' },
    url: new URL('http://localhost/app/artists/artist-one/profile'),
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

import { goto } from '$app/navigation';
import Page from './+page.svelte';

const artist = makeArtist({
  id: 'artist-one',
  name: 'Mira Vale',
  persona: 'A songwriter from the coast.',
  voice_notes: 'A low, warm voice.',
  default_language: 'en',
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

beforeEach(() => {
  clearAuth();
  setAuth(
    {
      accessToken: 'artist-profile-access',
      refreshToken: 'artist-profile-refresh',
      expiresAt: '2030-01-01T00:15:00.000Z',
      contentCookieExpiresAt: '2030-01-02T00:00:00.000Z',
    },
    makeUserProfile(),
  );
  vi.clearAllMocks();
  server.use(http.get(`${BASE}/v1/studio/artists/artist-one`, () => HttpResponse.json(artist)));
});

afterEach(() => {
  cleanup();
  clearAuth();
});

describe('artist profile page', () => {
  it('sends only the changed field and clears persona with null', async () => {
    let patchBody: unknown;
    server.use(
      http.patch(`${BASE}/v1/studio/artists/artist-one`, async ({ request }) => {
        patchBody = await request.json();
        return HttpResponse.json({ ...artist, persona: null });
      }),
    );
    renderPage();

    await waitFor(() => expect(screen.getByLabelText('Persona')).toBeTruthy());
    await fireEvent.input(screen.getByLabelText('Persona'), { target: { value: '' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(patchBody).toEqual({ persona: null }));
  });

  it('flags tempo-looking style tags and explains the export field', async () => {
    renderPage();
    await screen.findByRole('heading', { name: 'Artist details' });
    const tagInput = screen.getByLabelText('Style tags');
    await fireEvent.input(tagInput, { target: { value: '120 BPM' } });
    await fireEvent.keyDown(tagInput, { key: 'Enter' });

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Tempo belongs in the track plan',
    );
    expect(screen.getAllByText("Exported to Suno's Style.").length).toBeGreaterThan(0);
  });

  it('shows the project count when artist deletion is blocked', async () => {
    server.use(
      http.delete(`${BASE}/v1/studio/artists/artist-one`, () =>
        HttpResponse.json(
          {
            error: 'artist_in_use',
            message: 'In use',
            status_code: 409,
            detail: { project_count: 3 },
          },
          { status: 409 },
        ),
      ),
    );
    renderPage();
    await screen.findByRole('heading', { name: 'Artist details' });
    await fireEvent.click(screen.getByRole('button', { name: 'Delete artist' }));
    await fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }),
    );

    expect((await screen.findByRole('alert')).textContent).toContain('used by 3 project(s)');
    expect(goto).not.toHaveBeenCalled();
  });
});
