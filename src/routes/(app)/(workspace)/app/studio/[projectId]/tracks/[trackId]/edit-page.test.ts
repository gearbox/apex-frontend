import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { QueryClient } from '@tanstack/svelte-query';
import { http, HttpResponse } from 'msw';
import type { Component } from 'svelte';
import { get } from 'svelte/store';
import QueryHarness from '../../../../../../../../tests/QueryHarness.svelte';
import { MOCK_BASE_URL as BASE } from '../../../../../../../../mocks/config';
import {
  makeArtist,
  makePlanVersion,
  makeProjectProfile,
  makeTrackDetail,
} from '../../../../../../../../mocks/factories/studio';
import { makeUserProfile } from '../../../../../../../../mocks/factories/user';
import { server } from '../../../../../../../../mocks/server';
import { clearAuth, setAuth } from '$lib/stores/auth';
import { songDraftStore } from '$lib/studio/songDraftStore';
import { newDraft } from '$lib/studio/songDraft';
import { clearToasts, toasts } from '$lib/stores/toasts';

const state = vi.hoisted(() => ({
  goto: vi.fn().mockResolvedValue(undefined),
  beforeNavigate: vi.fn(),
}));
vi.mock('$app/navigation', () => state);
vi.mock('$app/stores', () => ({
  page: {
    subscribe: (fn: (value: unknown) => void) => {
      fn({ params: { projectId: 'p1', trackId: 't1' } });
      return () => {};
    },
  },
}));

import Page from './edit/+page.svelte';

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(QueryHarness, {
    props: { component: Page as Component<object>, componentProps: {}, client },
  });
  return client;
}

function setupStudio(withPlan = false) {
  const plan = withPlan
    ? makePlanVersion({
        id: 'plan-v1',
        track_id: 't1',
        content: {
          title: 'Song',
          instrumental: false,
          references: [],
          global_style: { tags: [], avoid: [] },
          sections: [
            { id: 'verse-1', kind: 'verse', label: null, delivery: [], instrumental: false },
          ],
        },
      })
    : null;
  server.use(
    http.get(`${BASE}/v1/studio/tracks/t1`, () =>
      HttpResponse.json(
        makeTrackDetail({
          id: 't1',
          library_project_id: 'p1',
          title: 'Song',
          current_plan_version_id: plan?.id ?? null,
          current_lyrics_version_id: null,
          current_plan: plan,
        }),
      ),
    ),
    http.get(`${BASE}/v1/studio/projects/p1`, () =>
      HttpResponse.json(makeProjectProfile({ library_project_id: 'p1', name: 'Project' })),
    ),
    http.get(`${BASE}/v1/studio/artists`, () =>
      HttpResponse.json({
        items: [makeArtist({ default_language: 'en' })],
        limit: 50,
        has_more: false,
        next_cursor: null,
      }),
    ),
  );
  return plan;
}

function setCurrentUser() {
  setAuth(
    {
      accessToken: 'editor-token',
      refreshToken: 'editor-refresh',
      expiresAt: 'later',
      contentCookieExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    },
    makeUserProfile({ id: 'song-editor-user' }),
  );
}

beforeEach(() => {
  clearAuth();
  localStorage.clear();
  clearToasts();
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('song editor page', () => {
  it('offers the two starting templates and focuses the new section after adding one', async () => {
    setupStudio();
    setCurrentUser();
    const client = renderPage();

    await fireEvent.click(await screen.findByRole('button', { name: 'Verse–Chorus' }));
    expect(screen.getAllByRole('article')).toHaveLength(6);
    await fireEvent.click(screen.getByRole('button', { name: '+ Add section' }));
    await waitFor(() =>
      expect(document.activeElement?.getAttribute('id')).toMatch(/^section-kind-/u),
    );
    client.clear();
  });

  it('keeps Save disabled when the server content has not changed', async () => {
    setupStudio(true);
    setCurrentUser();
    const client = renderPage();
    const save = await screen.findByRole('button', { name: /^Save$/u });
    await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(true));
    expect(
      screen.getAllByRole('status').some((item) => item.textContent?.includes('All changes saved')),
    ).toBe(true);
    client.clear();
  });

  it('creates plan and lyrics as non-current versions, then switches the pair once', async () => {
    setupStudio();
    setCurrentUser();
    const calls: Array<{ method: string; body: Record<string, unknown> }> = [];
    server.use(
      http.post(`${BASE}/v1/studio/tracks/t1/versions`, async ({ request }) => {
        const body = (await request.json()) as Record<string, unknown>;
        calls.push({ method: 'POST', body });
        const kind = body.kind as 'plan' | 'lyrics';
        const id = `${kind}-v1`;
        const version =
          kind === 'plan'
            ? makePlanVersion({
                id,
                track_id: 't1',
                is_current: false,
                content: body.content as never,
              })
            : {
                id,
                track_id: 't1',
                version_number: 1,
                parent_version_id: null,
                based_on_plan_version_id: body.based_on_plan_version_id as string,
                origin: 'user',
                schema_version: 1,
                content_hash: 'lyrics-hash',
                created_at: new Date().toISOString(),
                is_current: false,
                kind: 'lyrics',
                content: body.content,
              };
        return HttpResponse.json({ version, lyrics_detached: false }, { status: 201 });
      }),
      http.put(`${BASE}/v1/studio/tracks/t1/current`, async ({ request }) => {
        calls.push({ method: 'PUT', body: (await request.json()) as Record<string, unknown> });
        return HttpResponse.json({
          current_plan_version_id: 'plan-v1',
          current_lyrics_version_id: 'lyrics-v1',
        });
      }),
    );
    const client = renderPage();
    await fireEvent.click(await screen.findByRole('button', { name: 'Verse–Chorus' }));
    await fireEvent.input(screen.getByLabelText('Lyrics language'), { target: { value: 'en' } });
    await fireEvent.input(screen.getAllByLabelText('Lyrics')[0]!, {
      target: { value: '[whispered]\nA line' },
    });
    await fireEvent.click(screen.getByRole('button', { name: /^Save$/u }));

    await waitFor(() =>
      expect(get(toasts).map((toast) => toast.message)).toContain('Saved: plan v1, lyrics v1'),
    );
    expect(calls.map((call) => call.method)).toEqual(['POST', 'POST', 'PUT']);
    expect(calls[0]!.body).toMatchObject({
      kind: 'plan',
      make_current: false,
      parent_version_id: null,
    });
    expect(calls[1]!.body).toMatchObject({
      kind: 'lyrics',
      make_current: false,
      parent_version_id: null,
      based_on_plan_version_id: 'plan-v1',
    });
    expect(calls[2]!.body).toEqual({ plan_version_id: 'plan-v1', lyrics_version_id: 'lyrics-v1' });
    expect(get(toasts).map((toast) => toast.message)).toContain('Saved: plan v1, lyrics v1');
    client.clear();
  });

  it('hides instrumental lyrics without discarding their text', async () => {
    setupStudio();
    setCurrentUser();
    const client = renderPage();
    await fireEvent.click(await screen.findByRole('button', { name: 'Blank' }));
    await fireEvent.click(screen.getByRole('button', { name: '+ Add section' }));
    const lyrics = screen.getByLabelText('Lyrics');
    await fireEvent.input(lyrics, { target: { value: 'Keep this line' } });
    await fireEvent.click(screen.getByRole('switch', { name: 'Instrumental track' }));
    expect(screen.queryByLabelText('Lyrics')).toBeNull();
    expect(screen.getByText('Lines hidden: 1 · not saved while instrumental')).toBeTruthy();
    await fireEvent.click(screen.getByRole('switch', { name: 'Instrumental track' }));
    expect((screen.getByLabelText('Lyrics') as HTMLTextAreaElement).value).toBe('Keep this line');
    client.clear();
  });

  it('restores a device draft after reload confirmation', async () => {
    setupStudio();
    setCurrentUser();
    const userId = 'song-editor-user';
    let sectionId = 0;
    const draft = newDraft('verse_chorus', 'Song', 'en', () => `section-${++sectionId}`);
    draft.sections[0]!.lyrics = 'Restored words';
    songDraftStore.save(userId, 't1', {
      savedAt: new Date().toISOString(),
      base: { plan: null, lyrics: null },
      draft,
    });
    const client = renderPage();

    await screen.findByText(/Restore unsaved changes from/u);
    await fireEvent.click(screen.getByRole('button', { name: 'Restore' }));
    expect((screen.getAllByLabelText('Lyrics')[0] as HTMLTextAreaElement).value).toBe(
      'Restored words',
    );
    client.clear();
  });
});
