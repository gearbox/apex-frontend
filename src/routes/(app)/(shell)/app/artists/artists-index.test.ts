import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { QueryClient } from '@tanstack/svelte-query';
import { http, HttpResponse } from 'msw';
import { server } from '../../../../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../../../../mocks/config';
import { makeArtist } from '../../../../../mocks/factories/studio';
import { clearAuth, setAuth } from '$lib/stores/auth';
import { makeUserProfile } from '../../../../../mocks/factories/user';
import { studioKeys } from '$lib/queries/studio';
import QueryHarness from '../../../../../tests/QueryHarness.svelte';
import type { Component } from 'svelte';
import Page from './+page.svelte';

beforeEach(() => {
  setAuth(
    {
      accessToken: 'artist-index-access',
      refreshToken: 'artist-index-refresh',
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

describe('artists index', () => {
  it('a refetch error keeps the cards and shows a banner', async () => {
    const list = {
      items: [makeArtist({ id: 'artist-one', name: 'Mira Vale' })],
      limit: 50,
      has_more: false,
      next_cursor: null,
    };
    server.use(http.get(`${BASE}/v1/studio/artists`, () => HttpResponse.json(list)));
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(QueryHarness, {
      props: { component: Page as Component<object>, componentProps: {}, client },
    });
    const card = await screen.findByRole('heading', { name: 'Mira Vale' });
    server.use(http.get(`${BASE}/v1/studio/artists`, () => HttpResponse.error()));
    await client.invalidateQueries({ queryKey: studioKeys.artists() });
    const notice = await screen.findByText("We couldn't refresh your artists.");
    const banner = notice.closest('[role="status"]') as HTMLElement;
    expect(banner).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Mira Vale' })).toBe(card);
    server.use(http.get(`${BASE}/v1/studio/artists`, () => HttpResponse.json(list)));
    await fireEvent.click(within(banner).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByText("We couldn't refresh your artists.")).toBeNull());
  });
});
