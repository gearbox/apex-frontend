import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { QueryClient } from '@tanstack/svelte-query';
import { http, HttpResponse } from 'msw';
import QueryHarness from '../../../../../../../../tests/QueryHarness.svelte';
import { server } from '../../../../../../../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../../../../../../../mocks/config';
import {
  makeTrackDetail,
  makePlanVersion,
  makeLyricsVersion,
} from '../../../../../../../../mocks/factories/studio';
import type { Component } from 'svelte';
import { studioKeys } from '$lib/queries/studio';
vi.mock('$app/stores', () => ({
  page: {
    subscribe: (fn: (value: unknown) => void) => {
      fn({
        params: { projectId: 'p', trackId: 't' },
        url: new URL('http://localhost/app/studio/p/tracks/t'),
      });
      return () => {};
    },
  },
}));
import TrackPage from './+page.svelte';
function show() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(QueryHarness, {
    props: { component: TrackPage as Component<object>, componentProps: {}, client },
  });
  return client;
}
afterEach(cleanup);
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
        HttpResponse.json(makeTrackDetail({ id: 't', current_plan: plan, current_lyrics: lyrics })),
      ),
    );
    const client = show();
    const first = (await screen.findByText('First')).parentElement!;
    const second = screen.getByText('Second').parentElement!;
    expect(within(first).getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
    expect(within(first).queryByText('second line')).toBeNull();
    expect(within(second).getByText('second line')).toBeTruthy();
    expect(screen.queryByText('hidden line')).toBeNull();
    expect(document.querySelector('img')).toBeNull();
    client.clear();
  });
  it('shows plan and lyrics empty states', async () => {
    server.use(
      http.get(`${BASE}/v1/studio/tracks/t`, () => HttpResponse.json(makeTrackDetail({ id: 't' }))),
    );
    const client = show();
    expect(await screen.findByText('No plan yet')).toBeTruthy();
    expect(screen.getByText('No lyrics yet')).toBeTruthy();
    client.clear();
  });
  it('keeps the loaded track visible when a refetch fails', async () => {
    server.use(
      http.get(`${BASE}/v1/studio/tracks/t`, () =>
        HttpResponse.json(makeTrackDetail({ id: 't', title: 'Still here' })),
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
