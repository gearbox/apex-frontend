import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { QueryClient } from '@tanstack/svelte-query';
import { http, HttpResponse } from 'msw';
import { server } from '../../../../../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../../../../../mocks/config';
import { makeArtist } from '../../../../../../mocks/factories/studio';
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

import LayoutHarness from './ArtistLayoutHarness.svelte';

function renderLayout() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(QueryHarness, {
    props: { component: LayoutHarness as Component<object>, componentProps: {}, client },
  });
  return client;
}

beforeEach(() => {
  clearAuth();
  setAuth(
    {
      accessToken: 'artist-layout-access',
      refreshToken: 'artist-layout-refresh',
      expiresAt: '2030-01-01T00:15:00.000Z',
      contentCookieExpiresAt: '2030-01-02T00:00:00.000Z',
    },
    makeUserProfile(),
  );
});

afterEach(() => {
  cleanup();
  clearAuth();
});

describe('artist layout load errors', () => {
  it('shows not found for the artist_not_found 404', async () => {
    server.use(
      http.get(`${BASE}/v1/studio/artists/artist-one`, () =>
        HttpResponse.json(
          { error: 'artist_not_found', message: 'Missing', status_code: 404 },
          { status: 404 },
        ),
      ),
    );
    renderLayout();

    expect(await screen.findByRole('heading', { name: "This artist doesn't exist" })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('shows the load error with Retry for a server error', async () => {
    server.use(
      http.get(`${BASE}/v1/studio/artists/artist-one`, () =>
        HttpResponse.json(
          { error: 'server_error', message: 'Failed', status_code: 500 },
          { status: 500 },
        ),
      ),
    );
    renderLayout();

    expect(await screen.findByRole('heading', { name: 'Artists could not load' })).toBeTruthy();
    expect(screen.getByText('Please check your connection and try again.')).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('shows a load error for a network failure, then Retry recovers', async () => {
    let attempts = 0;
    const artist = makeArtist({ id: 'artist-one', name: 'Mira Vale' });
    server.use(
      http.get(`${BASE}/v1/studio/artists/artist-one`, () => {
        attempts += 1;
        return attempts === 1 ? HttpResponse.error() : HttpResponse.json(artist);
      }),
    );
    renderLayout();

    expect(await screen.findByRole('heading', { name: 'Artists could not load' })).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'Mira Vale' })).toBeTruthy();
    expect(attempts).toBe(2);
  });
});
