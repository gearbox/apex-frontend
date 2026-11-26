import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { QueryClient } from '@tanstack/svelte-query';
import type { ComponentProps } from 'svelte';
import { writable, type Writable } from 'svelte/store';
import { http, HttpResponse } from 'msw';
import QueryHarness from '../../../../../../../../../tests/QueryHarness.svelte';
import { server } from '../../../../../../../../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../../../../../../../../mocks/config';
import {
  makeCursorPage,
  makeLyricsVersion,
  makePlanVersion,
  makeTrack,
  makeTrackDetail,
  makeVersionSummary,
} from '../../../../../../../../../mocks/factories/studio';
import { studioKeys } from '$lib/queries/studio';
import { clearToasts, toasts } from '$lib/stores/toasts';
import { get } from 'svelte/store';

vi.mock('$app/stores', () => ({
  page: {
    subscribe: (fn: (value: unknown) => void) => {
      fn({
        params: { projectId: 'p1', trackId: 't1' },
        url: new URL('http://localhost/app/studio/p1/tracks/t1/history'),
      });
      return () => {};
    },
  },
}));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/utils/breakpoints', () => ({ isDesktop: writable(true) }));
Object.defineProperty(globalThis, 'IntersectionObserver', {
  configurable: true,
  value: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
});
import HistoryPage from './+page.svelte';
import { isDesktop } from '$lib/utils/breakpoints';

const desktop = isDesktop as Writable<boolean>;
const now = '2026-11-26T10:00:00Z';
const planContent = (title: string) => ({
  title,
  instrumental: false,
  references: [],
  global_style: { tags: [], avoid: [] },
  sections: [{ id: 'verse', kind: 'verse' as const, delivery: [], instrumental: false }],
});
const lyricsContent = {
  language: 'en',
  sections: [{ section_id: 'verse', lines: [{ text: 'A line' }] }],
};

afterEach(() => {
  cleanup();
  desktop.set(true);
  clearToasts();
  vi.clearAllMocks();
});

function setup(
  options: {
    currentPlan?: string | null;
    currentLyrics?: string | null;
    lyricsBasePlanId?: string;
    planVersions?: ReturnType<typeof makeVersionSummary>[];
    lyricsVersions?: ReturnType<typeof makeVersionSummary>[];
    onCurrent?: (body: Record<string, unknown>) => Response | Promise<Response>;
    onDelete?: () => Response;
  } = {},
) {
  const currentTrack = {
    ...makeTrack({
      id: 't1',
      library_project_id: 'p1',
      title: 'Song',
      current_plan_version_id: options.currentPlan === undefined ? 'plan-1' : options.currentPlan,
      current_lyrics_version_id:
        options.currentLyrics === undefined ? 'lyrics-1' : options.currentLyrics,
    }),
  };
  const plans = (
    options.planVersions ?? [
      makeVersionSummary({
        id: 'plan-2',
        kind: 'plan',
        version_number: 2,
        is_current: false,
        created_at: now,
      }),
      makeVersionSummary({
        id: 'plan-1',
        kind: 'plan',
        version_number: 1,
        is_current: true,
        created_at: now,
      }),
    ]
  ).slice();
  const lyrics = (
    options.lyricsVersions ?? [
      makeVersionSummary({
        id: 'lyrics-1',
        kind: 'lyrics',
        version_number: 1,
        based_on_plan_version_id: options.lyricsBasePlanId ?? 'plan-1',
        is_current: true,
        created_at: now,
      }),
    ]
  ).slice();
  const currentBodies: Record<string, unknown>[] = [];
  let planListReads = 0;
  server.use(
    http.get(`${BASE}/v1/studio/tracks/t1`, () => HttpResponse.json(makeTrackDetail(currentTrack))),
    http.get(`${BASE}/v1/studio/tracks/t1/versions`, ({ request }) => {
      const kind = new URL(request.url).searchParams.get('kind');
      if (kind === 'plan') planListReads++;
      return HttpResponse.json(makeCursorPage(kind === 'lyrics' ? lyrics : plans, 30, false));
    }),
    http.get(`${BASE}/v1/studio/versions/:id`, ({ params }) => {
      if (params.id === 'plan-1')
        return HttpResponse.json(
          makePlanVersion({
            id: 'plan-1',
            track_id: 't1',
            version_number: 1,
            created_at: now,
            content: planContent('Song'),
          }),
        );
      if (params.id === 'plan-2')
        return HttpResponse.json(
          makePlanVersion({
            id: 'plan-2',
            track_id: 't1',
            version_number: 2,
            created_at: now,
            content: planContent('Song 2'),
          }),
        );
      if (params.id === 'lyrics-1')
        return HttpResponse.json(
          makeLyricsVersion({
            id: 'lyrics-1',
            track_id: 't1',
            version_number: 1,
            based_on_plan_version_id: options.lyricsBasePlanId ?? 'plan-1',
            created_at: now,
            content: lyricsContent,
          }),
        );
      return HttpResponse.json(
        { error: 'not_found', message: 'missing', status_code: 404 },
        { status: 404 },
      );
    }),
    http.put(`${BASE}/v1/studio/tracks/t1/current`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      currentBodies.push(body);
      if (options.onCurrent) return options.onCurrent(body);
      currentTrack.current_plan_version_id =
        (body.plan_version_id as string | undefined) ?? currentTrack.current_plan_version_id;
      if ('lyrics_version_id' in body)
        currentTrack.current_lyrics_version_id = body.lyrics_version_id as string | null;
      return HttpResponse.json(currentTrack);
    }),
    http.delete(`${BASE}/v1/studio/versions/:id`, ({ params }) => {
      const response = options.onDelete?.() ?? new HttpResponse(null, { status: 204 });
      if (response.status >= 200 && response.status < 300) {
        for (const versions of [plans, lyrics]) {
          const index = versions.findIndex((version) => version.id === params.id);
          if (index >= 0) versions.splice(index, 1);
        }
      }
      return response;
    }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  desktop.set(true);
  render(QueryHarness<ComponentProps<typeof HistoryPage>>, {
    props: { component: HistoryPage, componentProps: {}, client },
  });
  return { client, currentBodies, currentTrack, getPlanListReads: () => planListReads };
}

it('renders current badges and shows which plan a lyrics version uses', async () => {
  const { client } = setup();
  await screen.findByText('for plan v1');
  expect(screen.getAllByText('Current')).toHaveLength(2);
  expect(screen.getByRole('heading', { name: 'Plan' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'Lyrics' })).toBeTruthy();
  client.clear();
});

it('a plan version viewer has no lyrics section', async () => {
  const { client } = setup();
  const planList = (await screen.findByRole('heading', { name: 'Plan' })).closest('section');
  await fireEvent.click(await within(planList!).findByRole('button', { name: /v2/ }));
  const viewerHeading = await screen.findByRole('heading', { name: 'Plan v2' });
  const viewer = viewerHeading.closest('section');
  expect(within(viewer!).queryByRole('heading', { name: 'Lyrics' })).toBeNull();
  client.clear();
});

it('asks before making an incompatible plan current and sends null only after confirmation', async () => {
  const { client, currentBodies, currentTrack } = setup({
    onCurrent: (body) => {
      if (!('lyrics_version_id' in body))
        return HttpResponse.json(
          { error: 'lyrics_incompatible_with_plan', message: 'incompatible', status_code: 409 },
          { status: 409 },
        );
      currentTrack.current_plan_version_id = body.plan_version_id as string;
      currentTrack.current_lyrics_version_id = null;
      return HttpResponse.json(currentTrack);
    },
  });
  await screen.findByRole('button', { name: /v2/ });
  await fireEvent.click(screen.getByRole('button', { name: /v2/ }));
  await screen.findByRole('heading', { name: /Plan v2/ });
  await fireEvent.click(screen.getByRole('button', { name: 'Make current' }));
  const dialog = await screen.findByRole('dialog', {
    name: "These lyrics don't fit this plan. Make the plan current without lyrics?",
  });
  expect(currentBodies).toEqual([{ plan_version_id: 'plan-2' }]);
  await fireEvent.click(
    within(dialog).getByRole('button', { name: 'Make current without lyrics' }),
  );
  await waitFor(() =>
    expect(currentBodies).toEqual([
      { plan_version_id: 'plan-2' },
      { plan_version_id: 'plan-2', lyrics_version_id: null },
    ]),
  );
  client.clear();
});

it('offers to switch to a lyrics version base plan and sends both ids', async () => {
  const { client, currentBodies } = setup({
    currentPlan: 'plan-2',
    currentLyrics: null,
    lyricsVersions: [
      makeVersionSummary({
        id: 'lyrics-1',
        kind: 'lyrics',
        version_number: 1,
        based_on_plan_version_id: 'plan-1',
        is_current: false,
        created_at: now,
      }),
    ],
  });
  await screen.findByText('for plan v1');
  const lyricsList = screen.getByRole('heading', { name: 'Lyrics' }).closest('section');
  await fireEvent.click(within(lyricsList!).getByRole('button', { name: /v1/ }));
  await screen.findByRole('heading', { name: /Lyrics v1/ });
  await fireEvent.click(screen.getByRole('button', { name: 'Make current' }));
  const dialog = await screen.findByRole('dialog', {
    name: 'These lyrics were written for plan v1. Switch to plan v1 with them?',
  });
  await fireEvent.click(within(dialog).getByRole('button', { name: 'Switch plan' }));
  await waitFor(() =>
    expect(currentBodies).toEqual([{ plan_version_id: 'plan-1', lyrics_version_id: 'lyrics-1' }]),
  );
  client.clear();
});

it('uses Detach lyrics as the confirmation action label', async () => {
  const { client, currentBodies } = setup();
  await screen.findByText('for plan v1');
  const lyricsList = screen.getByRole('heading', { name: 'Lyrics' }).closest('section');
  await fireEvent.click(within(lyricsList!).getByRole('button', { name: /v1.*Current/ }));
  await screen.findByRole('heading', { name: /Lyrics v1/ });
  await fireEvent.click(screen.getByRole('button', { name: 'Detach lyrics' }));
  const dialog = await screen.findByRole('dialog', {
    name: 'Detach the current lyrics from this track?',
  });
  await fireEvent.click(within(dialog).getByRole('button', { name: 'Detach lyrics' }));
  await waitFor(() => expect(currentBodies).toEqual([{ lyrics_version_id: null }]));
  client.clear();
});

it('uses the plan wording when the lyrics base plan number is unknown', async () => {
  const { client } = setup({
    currentPlan: 'plan-2',
    currentLyrics: null,
    lyricsBasePlanId: 'plan-missing',
    lyricsVersions: [
      makeVersionSummary({
        id: 'lyrics-1',
        kind: 'lyrics',
        version_number: 1,
        based_on_plan_version_id: 'plan-missing',
        is_current: false,
        created_at: now,
      }),
    ],
  });
  await screen.findByText('for an older plan');
  const lyricsList = screen.getByRole('heading', { name: 'Lyrics' }).closest('section');
  await fireEvent.click(within(lyricsList!).getByRole('button', { name: /v1/ }));
  await screen.findByRole('heading', { name: /Lyrics v1/ });
  const makeCurrent = await screen.findByRole('button', { name: 'Make current' });
  await waitFor(() => expect((makeCurrent as HTMLButtonElement).disabled).toBe(false));
  await fireEvent.click(makeCurrent);
  const dialog = await screen.findByRole('dialog', {
    name: 'These lyrics were written for a different plan. Switch to the plan these lyrics were written for?',
  });
  expect(within(dialog).getByRole('button', { name: 'Switch plan' })).toBeTruthy();
  client.clear();
});

it('selecting a version moves focus and scrolls to the viewer heading', async () => {
  const scrollIntoView = vi.fn();
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoView,
  });
  const { client } = setup();
  const planList = (await screen.findByRole('heading', { name: 'Plan' })).closest('section');
  await fireEvent.click(await within(planList!).findByRole('button', { name: /v2/ }));
  const heading = await screen.findByRole('heading', { name: /Plan v2/ });
  await waitFor(() => expect(document.activeElement).toBe(heading));
  expect(heading.getAttribute('tabindex')).toBe('-1');
  expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
  client.clear();
});

it('switching the selected version resets its pending confirm', async () => {
  const { client } = setup({
    onCurrent: () =>
      HttpResponse.json(
        {
          error: 'lyrics_incompatible_with_plan',
          message: 'incompatible',
          status_code: 409,
        },
        { status: 409 },
      ),
  });
  await screen.findByRole('heading', { name: 'Plan' });
  const planList = screen.getByRole('heading', { name: 'Plan' }).closest('section');
  await fireEvent.click(await within(planList!).findByRole('button', { name: /v2/ }));
  await screen.findByRole('heading', { name: /Plan v2/ });
  await fireEvent.click(screen.getByRole('button', { name: 'Make current' }));
  expect(
    await screen.findByRole('dialog', { name: /Make the plan current without lyrics/ }),
  ).toBeTruthy();
  await fireEvent.click(within(planList!).getByRole('button', { name: /v1/ }));
  await screen.findByRole('heading', { name: /Plan v1/ });
  expect(screen.queryByRole('dialog')).toBeNull();
  client.clear();
});

it('a late make-current response after selecting another version only toasts', async () => {
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const requested = new Promise<void>((resolve) => (started = resolve));
  const { client } = setup({
    onCurrent: async (body) => {
      started();
      await gate;
      return HttpResponse.json({
        ...makeTrack({ id: 't1', library_project_id: 'p1' }),
        current_plan_version_id: body.plan_version_id,
        current_lyrics_version_id: null,
      });
    },
  });
  await screen.findByRole('heading', { name: 'Plan' });
  const planList = screen.getByRole('heading', { name: 'Plan' }).closest('section');
  await fireEvent.click(await within(planList!).findByRole('button', { name: /v2/ }));
  await screen.findByRole('heading', { name: /Plan v2/ });
  await fireEvent.click(screen.getByRole('button', { name: 'Make current' }));
  await requested;
  await fireEvent.click(within(planList!).getByRole('button', { name: /v1/ }));
  await screen.findByRole('heading', { name: /Plan v1/ });
  release();
  await waitFor(() => expect(get(toasts).at(-1)?.message).toBe('Saved.'));
  expect(screen.getByRole('heading', { name: /Plan v1/ })).toBeTruthy();
  expect(screen.queryByRole('alert')).toBeNull();
  client.clear();
});

it('hides delete for the current version and shows a version-delete refusal', async () => {
  const { client } = setup({
    onDelete: () =>
      HttpResponse.json(
        {
          error: 'version_has_children',
          message: 'has children',
          status_code: 409,
          detail: { count: 1 },
        },
        { status: 409 },
      ),
  });
  await screen.findByRole('heading', { name: 'Plan' });
  const planList = screen.getByRole('heading', { name: 'Plan' }).closest('section');
  await fireEvent.click(await within(planList!).findByRole('button', { name: /v1.*Current/ }));
  await screen.findByRole('heading', { name: /Plan v1/ });
  expect(screen.queryByRole('button', { name: 'Delete version' })).toBeNull();
  await fireEvent.click(within(planList!).getByRole('button', { name: /v2/ }));
  await screen.findByRole('heading', { name: /Plan v2/ });
  await fireEvent.click(screen.getByRole('button', { name: 'Delete version' }));
  const dialog = await screen.findByRole('dialog', {
    name: 'Delete version v2? This cannot be undone.',
  });
  await fireEvent.click(within(dialog).getByRole('button', { name: 'Delete version' }));
  expect(
    await screen.findByText('This version has dependent child versions (1). Delete them first.'),
  ).toBeTruthy();
  client.clear();
});

it('mobile: deleting the viewed version closes the viewer, reports it, and focuses the list heading', async () => {
  const { client } = setup();
  desktop.set(false);
  const planList = (await screen.findByRole('heading', { name: 'Plan' })).closest('section');
  await fireEvent.click(await within(planList!).findByRole('button', { name: /v2/ }));
  await screen.findByRole('heading', { name: 'Plan v2' });
  await fireEvent.click(screen.getByRole('button', { name: 'Delete version' }));
  const confirm = await screen.findByRole('dialog', {
    name: 'Delete version v2? This cannot be undone.',
  });
  await fireEvent.click(within(confirm).getByRole('button', { name: 'Delete version' }));

  await waitFor(() => expect(screen.queryAllByRole('dialog')).toHaveLength(0));
  expect(screen.queryByText('Loading…')).toBeNull();
  expect(get(toasts).at(-1)?.message).toBe('Version v2 deleted');
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Plan' })),
  );
  client.clear();
});

it('desktop: deleting the viewed version shows the placeholder and focuses the list heading', async () => {
  const { client } = setup();
  const planList = (await screen.findByRole('heading', { name: 'Plan' })).closest('section');
  await fireEvent.click(await within(planList!).findByRole('button', { name: /v2/ }));
  await screen.findByRole('heading', { name: 'Plan v2' });
  await fireEvent.click(screen.getByRole('button', { name: 'Delete version' }));
  const confirm = await screen.findByRole('dialog', {
    name: 'Delete version v2? This cannot be undone.',
  });
  await fireEvent.click(within(confirm).getByRole('button', { name: 'Delete version' }));

  expect(await screen.findByText('Select a version to view it')).toBeTruthy();
  expect(get(toasts).at(-1)?.message).toBe('Version v2 deleted');
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Plan' })),
  );
  client.clear();
});

it('mobile viewer has a Close button that closes it and returns focus to the version row', async () => {
  const { client } = setup();
  desktop.set(false);
  const planList = (await screen.findByRole('heading', { name: 'Plan' })).closest('section');
  const versionRow = await within(planList!).findByRole('button', { name: /v2/ });
  await fireEvent.click(versionRow);
  const viewer = await screen.findByRole('dialog', { name: 'Version history' });
  await screen.findByRole('heading', { name: 'Plan v2' });
  await fireEvent.click(within(viewer).getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Version history' })).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(versionRow));
  client.clear();
});

it('a deleted version stays gone after the lists reconcile', async () => {
  const { client, getPlanListReads } = setup();
  const planList = (await screen.findByRole('heading', { name: 'Plan' })).closest('section');
  const readsBeforeDelete = getPlanListReads();
  await fireEvent.click(await within(planList!).findByRole('button', { name: /v2/ }));
  await screen.findByRole('heading', { name: 'Plan v2' });
  await fireEvent.click(screen.getByRole('button', { name: 'Delete version' }));
  const confirm = await screen.findByRole('dialog', {
    name: 'Delete version v2? This cannot be undone.',
  });
  await fireEvent.click(within(confirm).getByRole('button', { name: 'Delete version' }));

  await waitFor(() => expect(getPlanListReads()).toBeGreaterThan(readsBeforeDelete));
  expect(within(planList!).queryByRole('button', { name: /v2/ })).toBeNull();
  client.clear();
});

it('disables history actions while a document write is pending', async () => {
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const requested = new Promise<void>((resolve) => (started = resolve));
  const { client } = setup({
    currentLyrics: null,
    onCurrent: async (body) => {
      started();
      await gate;
      return HttpResponse.json({
        ...makeTrack({ id: 't1', library_project_id: 'p1' }),
        current_plan_version_id: body.plan_version_id,
        current_lyrics_version_id: null,
      });
    },
  });
  await screen.findByRole('button', { name: /v2/ });
  await fireEvent.click(screen.getByRole('button', { name: /v2/ }));
  await screen.findByRole('heading', { name: /Plan v2/ });
  const makeCurrent = screen.getByRole('button', { name: 'Make current' }) as HTMLButtonElement;
  const remove = screen.getByRole('button', { name: 'Delete version' }) as HTMLButtonElement;
  const exportButton = screen.getByRole('button', {
    name: 'Export this version',
  }) as HTMLButtonElement;
  await fireEvent.click(makeCurrent);
  await requested;
  expect(makeCurrent.disabled).toBe(true);
  expect(remove.disabled).toBe(true);
  expect(exportButton.disabled).toBe(true);
  release();
  await waitFor(() => expect(remove.disabled).toBe(false));
  client.clear();
});

it('keeps the version lists visible after a list refetch error', async () => {
  let reads = 0;
  const { client } = setup();
  await screen.findByRole('heading', { name: 'Plan' });
  const planList = screen.getByRole('heading', { name: 'Plan' }).closest('section');
  await within(planList!).findByRole('button', { name: /v1/ });
  server.use(
    http.get(`${BASE}/v1/studio/tracks/t1/versions`, ({ request }) => {
      const kind = new URL(request.url).searchParams.get('kind');
      if (kind === 'plan' && ++reads > 0)
        return HttpResponse.json(
          { error: 'server_error', message: 'failed', status_code: 500 },
          { status: 500 },
        );
      const items =
        kind === 'lyrics'
          ? [
              makeVersionSummary({
                id: 'lyrics-1',
                kind: 'lyrics',
                version_number: 1,
                based_on_plan_version_id: 'plan-1',
                is_current: true,
                created_at: now,
              }),
            ]
          : [
              makeVersionSummary({
                id: 'plan-1',
                kind: 'plan',
                version_number: 1,
                is_current: true,
                created_at: now,
              }),
            ];
      return HttpResponse.json(makeCursorPage(items, 30, false));
    }),
  );
  await within(planList!).findByRole('button', { name: /v1/ });
  await client.invalidateQueries({ queryKey: studioKeys.versions('t1', 'plan') });
  expect(
    await screen.findByText('Could not refresh. Your existing content is still available.'),
  ).toBeTruthy();
  expect(within(planList!).getByRole('button', { name: /v1/ })).toBeTruthy();
  client.clear();
});
