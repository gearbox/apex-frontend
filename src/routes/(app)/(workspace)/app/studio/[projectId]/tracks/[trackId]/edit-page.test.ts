import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { QueryClient } from '@tanstack/svelte-query';
import { http, HttpResponse } from 'msw';
import { tick, type Component } from 'svelte';
import { get, type Writable } from 'svelte/store';
import QueryHarness from '../../../../../../../../tests/QueryHarness.svelte';
import { MOCK_BASE_URL as BASE } from '../../../../../../../../mocks/config';
import {
  makeArtist,
  makeLyricsVersion,
  makePlanVersion,
  makeProjectProfile,
  makeTrackDetail,
} from '../../../../../../../../mocks/factories/studio';
import { makeUserProfile } from '../../../../../../../../mocks/factories/user';
import { server } from '../../../../../../../../mocks/server';
import {
  __resetAuthFailureReasonForTesting,
  clearAuth,
  setAuth,
  setAuthFailureReason,
} from '$lib/stores/auth';
import { studioKeys } from '$lib/queries/studio';
import { studioMutationKeys } from '$lib/queries/studioTracks';
import { songDraftStore, type StoredSongDraft } from '$lib/studio/songDraftStore';
import {
  draftFromDocuments,
  newDraft,
  type LyricsDocument,
  type Pair,
  type PlanDocument,
  type PlanSection,
  type SongDraft,
} from '$lib/studio/songDraft';
import { clearToasts, toasts } from '$lib/stores/toasts';
import { isDesktop } from '$lib/utils/breakpoints';

const state = vi.hoisted(() => ({
  goto: vi.fn().mockResolvedValue(undefined),
  beforeNavigate: vi.fn(),
}));
const route = vi.hoisted(() => {
  const at = (trackId: string) => ({
    params: { projectId: 'p1', trackId },
    url: new URL(`http://localhost/app/studio/p1/tracks/${trackId}/edit`),
  });
  let value = at('t1');
  const subscribers = new Set<(next: ReturnType<typeof at>) => void>();
  return {
    page: {
      subscribe(run: (next: ReturnType<typeof at>) => void) {
        subscribers.add(run);
        run(value);
        return () => subscribers.delete(run);
      },
    },
    open(trackId: string) {
      value = at(trackId);
      for (const run of subscribers) run(value);
    },
  };
});
vi.mock('$app/navigation', () => state);
vi.mock('$app/stores', () => ({ page: route.page }));
vi.mock('$lib/utils/breakpoints', async () => {
  const { writable } = await import('svelte/store');
  return { isDesktop: writable(false) };
});

import Page from './edit/+page.svelte';
import EditorShellHarness from './EditorShellHarness.svelte';

const USER = 'song-editor-user';

const section = (id: string, kind: PlanSection['kind'], instrumental = false): PlanSection => ({
  id,
  kind,
  label: null,
  delivery: [],
  instrumental,
});

function planDocument(sections = [section('verse-1', 'verse'), section('chorus-1', 'chorus')]) {
  return {
    title: 'Song',
    instrumental: false,
    references: [],
    global_style: { tags: [], avoid: [] },
    sections,
  } satisfies PlanDocument;
}

const lyricsDocument = (text = 'Server line'): LyricsDocument => ({
  language: 'en',
  sections: [{ section_id: 'verse-1', lines: [{ text, delivery: [] }] }],
});

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

interface Call {
  method: 'POST' | 'PUT';
  trackId: string;
  body: Record<string, unknown>;
}

type AnyVersion = ReturnType<typeof makePlanVersion> | ReturnType<typeof makeLyricsVersion>;

/** A stateful stand-in for the Studio API: saves create versions and move the current pair. */
function setupStudio(options: { plan?: PlanDocument; lyrics?: LyricsDocument } = {}) {
  const versions = new Map<string, AnyVersion>();
  const pairs = new Map<string, Pair>();
  const calls: Call[] = [];
  const holds: { versionPost?: Promise<void>; versionGet?: Promise<void> } = {};

  function addVersion(id: string, kind: 'plan' | 'lyrics', content: unknown, trackId = 't1') {
    const common = { id, track_id: trackId, content: content as never };
    const version =
      kind === 'plan' ? makePlanVersion(common) : makeLyricsVersion({ ...common, kind: 'lyrics' });
    versions.set(id, version);
    return version;
  }
  function pairOf(trackId: string): Pair {
    const pair = pairs.get(trackId) ?? { plan: null, lyrics: null };
    pairs.set(trackId, pair);
    return pair;
  }
  if (options.plan) {
    addVersion('plan-v1', 'plan', options.plan);
    pairOf('t1').plan = 'plan-v1';
  }
  if (options.lyrics) {
    addVersion('lyrics-v1', 'lyrics', options.lyrics);
    pairOf('t1').lyrics = 'lyrics-v1';
  }

  server.use(
    http.get(`${BASE}/v1/studio/tracks/:trackId`, ({ params }) => {
      const id = String(params.trackId);
      const pair = pairOf(id);
      return HttpResponse.json(
        makeTrackDetail({
          id,
          library_project_id: 'p1',
          title: 'Song',
          current_plan_version_id: pair.plan,
          current_lyrics_version_id: pair.lyrics,
          current_plan: (versions.get(pair.plan ?? '') ?? null) as never,
          current_lyrics: (versions.get(pair.lyrics ?? '') ?? null) as never,
        }),
      );
    }),
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
    http.get(`${BASE}/v1/studio/versions/:versionId`, async ({ params }) => {
      await holds.versionGet;
      const version = versions.get(String(params.versionId));
      return version
        ? HttpResponse.json(version)
        : HttpResponse.json(
            { error: 'not_found', message: 'Not found', status_code: 404 },
            { status: 404 },
          );
    }),
    http.post(`${BASE}/v1/studio/tracks/:trackId/versions`, async ({ request, params }) => {
      const body = (await request.json()) as Record<string, unknown>;
      const trackId = String(params.trackId);
      calls.push({ method: 'POST', trackId, body });
      await holds.versionPost;
      const kind = body.kind as 'plan' | 'lyrics';
      const number = [...versions.values()].filter((version) => version.kind === kind).length + 1;
      const version = addVersion(`${kind}-v${number}`, kind, body.content, trackId);
      version.version_number = number;
      return HttpResponse.json({ version, lyrics_detached: false }, { status: 201 });
    }),
    http.put(`${BASE}/v1/studio/tracks/:trackId/current`, async ({ request, params }) => {
      const body = (await request.json()) as Record<string, unknown>;
      const trackId = String(params.trackId);
      calls.push({ method: 'PUT', trackId, body });
      const pair = pairOf(trackId);
      if (typeof body.plan_version_id === 'string') pair.plan = body.plan_version_id;
      if ('lyrics_version_id' in body) pair.lyrics = body.lyrics_version_id as string | null;
      return HttpResponse.json({
        current_plan_version_id: pair.plan,
        current_lyrics_version_id: pair.lyrics,
      });
    }),
  );
  return { versions, pairs, calls, holds, addVersion, pairOf };
}

function setCurrentUser() {
  setAuth(
    {
      accessToken: 'editor-token',
      refreshToken: 'editor-refresh',
      expiresAt: 'later',
      contentCookieExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    },
    makeUserProfile({ id: USER }),
  );
}

const clients: QueryClient[] = [];
function newClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  return client;
}

/** Pass the same client again to model returning to the editor inside the running app. */
function renderPage(client = newClient(), component: Component<object> = Page as never) {
  const view = render(QueryHarness, { props: { component, componentProps: {}, client } });
  return { client, ...view };
}

/** What SvelteKit's navigation hook receives when the user leaves through a link. */
function navigate(overrides: { type?: string; url?: string } = {}) {
  const navigation = {
    type: overrides.type ?? 'link',
    to: { url: new URL(overrides.url ?? 'http://localhost/app/studio') },
    cancel: vi.fn(),
  };
  (state.beforeNavigate.mock.calls.at(-1)![0] as (value: typeof navigation) => void)(navigation);
  return navigation;
}

const stored = (trackId = 't1') => songDraftStore.load(USER, trackId);
const toastMessages = () => get(toasts).map((toast) => toast.message);
const lyricsFields = () => screen.getAllByLabelText('Lyrics') as HTMLTextAreaElement[];
const firstLyrics = async () =>
  (await screen.findAllByLabelText('Lyrics'))[0] as HTMLTextAreaElement;
// Role queries walk the accessibility tree of every card, which is slow on a whole song, so the
// lookups repeated everywhere go by text or selector.
const saveButton = () => screen.getByText(/^Save$/u, { selector: 'button' }) as HTMLButtonElement;
const cards = () => [...document.querySelectorAll('article')];
const restoreButton = () => screen.getByRole('button', { name: 'Restore' }) as HTMLButtonElement;
const type = (element: Element, value: string) => fireEvent.input(element, { target: { value } });
const summaryHeading = () => document.getElementById('song-error-summary-heading');
const statusTexts = () =>
  [...document.querySelectorAll('[role="status"]')].map((item) => item.textContent?.trim() ?? '');
const hasStatus = (text: string) => statusTexts().some((item) => item.includes(text));
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The nearest inert ancestor. Svelte sets the DOM property, which jsdom does not reflect to the
 *  attribute; the e2e spec checks the attribute in real browsers. */
function inertAncestor(element: Element): HTMLElement | null {
  for (let node = element.parentElement; node; node = node.parentElement)
    if (node.inert) return node;
  return null;
}

async function restoreWhenReady() {
  await screen.findByText(/Restore unsaved changes from/u);
  await waitFor(() => expect(restoreButton().disabled).toBe(false));
  await fireEvent.click(restoreButton());
}

async function startTemplate(name: 'Blank' | 'Verse–Chorus' = 'Verse–Chorus') {
  await fireEvent.click(await screen.findByRole('button', { name }));
}

/** A new song with only as many sections as a test needs; each card makes every query slower. */
async function startSong(sections: number) {
  await startTemplate('Blank');
  const add = screen.getByText('+ Add section', { selector: 'button' });
  for (let index = 0; index < sections; index++) await fireEvent.click(add);
}

async function waitForToast(message: string) {
  await waitFor(() => expect(toastMessages()).toContain(message));
}

/** A device draft of the current documents, changed by `change`, based on `base`. */
function storeDraft(
  base: Pair,
  change: (draft: SongDraft) => void,
  documents: { plan?: PlanDocument; lyrics?: LyricsDocument | null } = {},
): StoredSongDraft {
  const draft = draftFromDocuments(
    documents.plan ?? planDocument(),
    documents.lyrics === undefined ? lyricsDocument() : documents.lyrics,
    { language: 'en' },
  );
  change(draft);
  const record = { savedAt: new Date(Date.now() - 60_000).toISOString(), base, draft };
  songDraftStore.save(USER, 't1', record);
  return record;
}

beforeEach(() => {
  clearAuth();
  __resetAuthFailureReasonForTesting();
  localStorage.clear();
  clearToasts();
  vi.clearAllMocks();
  route.open('t1');
  (isDesktop as Writable<boolean>).set(false);
});

afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'visibilityState');
});

describe('song editor page', () => {
  it('offers the two starting templates and focuses the new section after adding one', async () => {
    setupStudio();
    setCurrentUser();
    renderPage();

    await startTemplate();
    expect(cards()).toHaveLength(6);
    await fireEvent.click(screen.getByRole('button', { name: '+ Add section' }));
    await waitFor(() =>
      expect(document.activeElement?.getAttribute('id')).toMatch(/^section-kind-/u),
    );
  });

  it('keeps Save disabled when the server content has not changed', async () => {
    setupStudio({ plan: planDocument() });
    setCurrentUser();
    renderPage();
    await firstLyrics();
    expect(saveButton().disabled).toBe(true);
    expect(hasStatus('All changes saved')).toBe(true);
  });

  it('creates plan and lyrics as non-current versions, then switches the pair once', async () => {
    const studio = setupStudio();
    setCurrentUser();
    renderPage();
    await startTemplate();
    await type(screen.getByLabelText('Lyrics language'), 'en');
    await type(lyricsFields()[0]!, '[whispered]\nA line');
    await fireEvent.click(saveButton());

    await waitForToast('Saved: plan v1, lyrics v1');
    expect(studio.calls.map((call) => call.method)).toEqual(['POST', 'POST', 'PUT']);
    expect(studio.calls[0]!.body).toMatchObject({
      kind: 'plan',
      make_current: false,
      parent_version_id: null,
    });
    expect(studio.calls[1]!.body).toMatchObject({
      kind: 'lyrics',
      make_current: false,
      parent_version_id: null,
      based_on_plan_version_id: 'plan-v1',
    });
    expect(studio.calls[2]!.body).toEqual({
      plan_version_id: 'plan-v1',
      lyrics_version_id: 'lyrics-v1',
    });
  });

  it('hides instrumental lyrics without discarding their text', async () => {
    setupStudio();
    setCurrentUser();
    renderPage();
    await startTemplate('Blank');
    await fireEvent.click(screen.getByRole('button', { name: '+ Add section' }));
    await type(screen.getByLabelText('Lyrics'), 'Keep this line');
    await fireEvent.click(screen.getByRole('switch', { name: 'Instrumental track' }));
    expect(screen.queryByLabelText('Lyrics')).toBeNull();
    expect(screen.getByText('Lines hidden: 1 · not saved while instrumental')).toBeTruthy();
    await fireEvent.click(screen.getByRole('switch', { name: 'Instrumental track' }));
    expect((screen.getByLabelText('Lyrics') as HTMLTextAreaElement).value).toBe('Keep this line');
  });

  it('hides the lyrics field of a hidden section even when it holds only a delivery row', async () => {
    setupStudio();
    setCurrentUser();
    renderPage();
    await startTemplate('Blank');
    await fireEvent.click(screen.getByRole('button', { name: '+ Add section' }));
    const instrumental = screen.getByRole('switch', { name: 'Instrumental section' });
    await fireEvent.click(instrumental);
    expect(screen.queryByLabelText('Lyrics')).toBeNull();
    expect(screen.queryByText(/Lines hidden/u)).toBeNull();
    await fireEvent.click(instrumental);
    await type(screen.getByLabelText('Lyrics'), '[whispered]');
    await fireEvent.click(instrumental);
    expect(screen.queryByLabelText('Lyrics')).toBeNull();
    expect(screen.getByText('Lines hidden: 1 · not saved while instrumental')).toBeTruthy();
  });

  it('restores a device draft after reload confirmation', async () => {
    setupStudio();
    setCurrentUser();
    let sectionId = 0;
    const draft = newDraft('verse_chorus', 'Song', 'en', () => `section-${++sectionId}`);
    draft.sections[0]!.lyrics = 'Restored words';
    songDraftStore.save(USER, 't1', {
      savedAt: new Date().toISOString(),
      base: { plan: null, lyrics: null },
      draft,
    });
    renderPage();

    await restoreWhenReady();
    expect(lyricsFields()[0]!.value).toBe('Restored words');
  });

  it('a project load error still opens the editor', async () => {
    setupStudio();
    setCurrentUser();
    server.use(
      http.get(
        `${BASE}/v1/studio/projects/p1`,
        () =>
          HttpResponse.json(
            { error: 'server_error', message: 'Broken', status_code: 500 },
            { status: 500 },
          ),
        { once: true },
      ),
    );
    renderPage();

    await startTemplate('Blank');
    expect(screen.getByLabelText('Song title')).toBeTruthy();
    expect(
      screen.getByText("Couldn't load the project; the language default may be missing."),
    ).toBeTruthy();
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByText(/Couldn't load the project/u)).toBeNull());
  });
});

describe('restore choice', () => {
  /** The device draft is based on `plan-v0`, which is not cached, so its load can be held. */
  function setupUncachedBase() {
    const studio = setupStudio({ plan: planDocument(), lyrics: lyricsDocument() });
    studio.addVersion('plan-v0', 'plan', planDocument());
    const load = gate();
    studio.holds.versionGet = load.promise;
    setCurrentUser();
    storeDraft({ plan: 'plan-v0', lyrics: null }, (draft) => {
      draft.sections[0]!.lyrics = 'Device line';
    });
    return { studio, load };
  }

  it('discarding while the stored base loads does not bring the banner back', async () => {
    const { load } = setupUncachedBase();
    renderPage();
    await screen.findByText('Checking the saved draft…');

    await fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.queryByText(/Restore unsaved changes from/u)).toBeNull();
    load.release();
    await pause(50);

    expect(screen.queryByText(/Restore unsaved changes from/u)).toBeNull();
    expect(lyricsFields()[0]!.value).toBe('Server line');
    expect(stored()).toBeNull();
  });

  it('Restore is disabled until the stored base is loaded', async () => {
    const { load } = setupUncachedBase();
    renderPage();
    await screen.findByText('Checking the saved draft…');
    expect(restoreButton().disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Discard' }) as HTMLButtonElement).disabled).toBe(
      false,
    );

    load.release();
    await waitFor(() => expect(restoreButton().disabled).toBe(false));
    expect(screen.queryByText('Checking the saved draft…')).toBeNull();
  });

  it('the editor is inert while a restore choice is pending', async () => {
    const { studio, load } = setupUncachedBase();
    renderPage();
    const title = await screen.findByLabelText('Song title');
    const inertWrapper = inertAncestor(title);
    expect(inertWrapper).not.toBeNull();
    expect(inertWrapper!.contains(lyricsFields()[0]!)).toBe(true);
    expect(inertWrapper!.contains(screen.getByRole('button', { name: 'Discard' }))).toBe(false);
    await fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    expect(studio.calls).toEqual([]);

    load.release();
    await restoreWhenReady();
    await waitFor(() => expect(inertAncestor(screen.getByLabelText('Song title'))).toBeNull());
    expect(lyricsFields()[0]!.value).toBe('Device line');
  });

  it('a stored draft whose base was deleted restores onto the current pair', async () => {
    const studio = setupStudio({ plan: planDocument(), lyrics: lyricsDocument() });
    setCurrentUser();
    storeDraft({ plan: 'plan-gone', lyrics: null }, (draft) => {
      draft.sections[0]!.lyrics = 'Device line';
    });
    renderPage();

    await screen.findByText(/The version it was based on was deleted/u);
    await restoreWhenReady();
    await fireEvent.click(saveButton());

    await waitForToast('Saved: lyrics v2');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(studio.calls[0]!.body).toMatchObject({
      kind: 'lyrics',
      parent_version_id: 'lyrics-v1',
      based_on_plan_version_id: 'plan-v1',
    });
  });

  it('a stored draft that differs only in unsent text restores onto the current pair', async () => {
    const plan = planDocument([section('verse-1', 'verse'), section('solo-1', 'chorus', true)]);
    const studio = setupStudio({ plan, lyrics: lyricsDocument() });
    // The record's base is older than the current pair, but its documents match the current ones.
    studio.addVersion('plan-v0', 'plan', planDocument([section('verse-1', 'verse')]));
    setCurrentUser();
    storeDraft(
      { plan: 'plan-v0', lyrics: 'lyrics-v1' },
      (draft) => {
        draft.sections[1]!.lyrics = 'Hidden words';
      },
      { plan },
    );
    renderPage();
    await restoreWhenReady();
    expect(saveButton().disabled).toBe(true);
    expect(hasStatus('Some text is kept only on this device')).toBe(true);

    await type(lyricsFields()[0]!, 'Another line');
    await fireEvent.click(saveButton());

    await waitForToast('Saved: lyrics v2');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(studio.calls[0]!.body).toMatchObject({ parent_version_id: 'lyrics-v1' });
  });

  it('offers Retry when the stored base cannot be loaded', async () => {
    const studio = setupStudio({ plan: planDocument(), lyrics: lyricsDocument() });
    studio.addVersion('plan-v0', 'plan', planDocument());
    server.use(
      http.get(
        `${BASE}/v1/studio/versions/plan-v0`,
        () =>
          HttpResponse.json(
            { error: 'server_error', message: 'Broken', status_code: 500 },
            { status: 500 },
          ),
        { once: true },
      ),
    );
    setCurrentUser();
    storeDraft({ plan: 'plan-v0', lyrics: null }, (draft) => {
      draft.title = 'Device title';
    });
    renderPage();

    await screen.findByText("Couldn't check the saved draft.");
    expect(restoreButton().disabled).toBe(true);
    await fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await restoreWhenReady();
    expect((screen.getByLabelText('Song title') as HTMLInputElement).value).toBe('Device title');
  });
});

describe('device draft', () => {
  /** Start a save of an edit to the server song, held at the first version POST. */
  async function startHeldSave() {
    const studio = setupStudio({ plan: planDocument(), lyrics: lyricsDocument() });
    const post = gate();
    studio.holds.versionPost = post.promise;
    setCurrentUser();
    const view = renderPage();
    await type(await firstLyrics(), 'First change');
    await fireEvent.click(saveButton());
    await waitFor(() => expect(studio.calls).toHaveLength(1));
    return { studio, post, ...view };
  }

  it('after saving with hidden text the draft stays stored on the new base', async () => {
    setupStudio();
    setCurrentUser();
    const { client, unmount } = renderPage();
    await startSong(2);
    await type(screen.getByLabelText('Lyrics language'), 'en');
    await type(lyricsFields()[0]!, 'Sung line');
    await type(lyricsFields()[1]!, 'Hidden words');
    const second = cards()[1]!;
    await fireEvent.click(within(second).getByRole('switch', { name: 'Instrumental section' }));
    await fireEvent.click(saveButton());

    await waitForToast('Saved: plan v1, lyrics v1');
    await waitFor(() => expect(hasStatus('Some text is kept only on this device')).toBe(true));
    expect(stored()?.base).toEqual({ plan: 'plan-v1', lyrics: 'lyrics-v1' });
    expect(stored()?.draft.sections[1]!.lyrics).toBe('Hidden words');

    unmount();
    renderPage(client);
    await restoreWhenReady();
    expect(saveButton().disabled).toBe(true);
    const restored = cards()[1]!;
    await fireEvent.click(within(restored).getByRole('switch', { name: 'Instrumental section' }));
    expect((within(restored).getByLabelText('Lyrics') as HTMLTextAreaElement).value).toBe(
      'Hidden words',
    );
  });

  it('a save that finishes after leaving re-bases the stored draft (no false conflict)', async () => {
    const { studio, post, client, unmount } = await startHeldSave();
    await type(lyricsFields()[0]!, 'Typed during the save');
    navigate();
    unmount();
    post.release();

    await waitForToast('Saved: lyrics v2');
    expect(stored()?.base).toEqual({ plan: 'plan-v1', lyrics: 'lyrics-v2' });
    expect(stored()?.draft.sections[0]!.lyrics).toBe('Typed during the save');

    renderPage(client);
    await restoreWhenReady();
    await fireEvent.click(saveButton());
    await waitForToast('Saved: lyrics v3');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(studio.calls.at(-2)!.body).toMatchObject({ parent_version_id: 'lyrics-v2' });
  });

  it('drops the stored draft when a save that finishes after leaving holds all of it', async () => {
    const { post, unmount } = await startHeldSave();
    navigate();
    expect(stored()).not.toBeNull();
    unmount();
    post.release();

    await waitForToast('Saved: lyrics v2');
    expect(stored()).toBeNull();
  });

  it('re-bases the offer when the earlier save finishes during the next visit', async () => {
    const { studio, post, client, unmount } = await startHeldSave();
    await type(lyricsFields()[0]!, 'Typed during the save');
    navigate();
    unmount();

    renderPage(client);
    await screen.findByText(/Restore unsaved changes from/u);
    await waitFor(() => expect(restoreButton().disabled).toBe(false));
    post.release();
    await waitForToast('Saved: lyrics v2');
    await waitFor(() =>
      expect(client.getQueryData(studioKeys.track('t1'))).toMatchObject({
        current_lyrics_version_id: 'lyrics-v2',
      }),
    );

    await restoreWhenReady();
    await fireEvent.click(saveButton());
    await waitForToast('Saved: lyrics v3');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(studio.calls.at(-2)!.body).toMatchObject({ parent_version_id: 'lyrics-v2' });
  });

  it("a newer editor's stored draft is not overwritten by a late save", async () => {
    const { post, unmount } = await startHeldSave();
    navigate();
    unmount();
    const newer = storeDraft({ plan: 'plan-v1', lyrics: 'lyrics-v1' }, (draft) => {
      draft.title = 'Newer editor';
    });
    post.release();

    await waitForToast('Saved: lyrics v2');
    expect(stored()).toEqual(newer);
  });

  it('hiding the page flushes the pending autosave', async () => {
    setupStudio({ plan: planDocument(), lyrics: lyricsDocument() });
    setCurrentUser();
    renderPage();
    const field = await firstLyrics();

    await type(field, 'Last words');
    await tick();
    expect(stored()).toBeNull();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(stored()?.draft.sections[0]!.lyrics).toBe('Last words');

    await type(field, 'Very last words');
    await tick();
    window.dispatchEvent(new Event('pagehide'));
    expect(stored()?.draft.sections[0]!.lyrics).toBe('Very last words');
  });

  it("hiding an idle editor leaves another tab's draft alone", async () => {
    setupStudio({ plan: planDocument(), lyrics: lyricsDocument() });
    setCurrentUser();
    renderPage();
    await firstLyrics();
    const otherTab = storeDraft({ plan: 'plan-v1', lyrics: 'lyrics-v1' }, (draft) => {
      draft.title = 'Other tab';
    });

    window.dispatchEvent(new Event('pagehide'));
    navigate();

    expect(stored()).toEqual(otherTab);
  });

  it('keeps the last keystrokes when the session expires under the editor', async () => {
    setupStudio({ plan: planDocument(), lyrics: lyricsDocument() });
    setCurrentUser();
    renderPage();
    await type(await firstLyrics(), 'Typed before expiry');
    await tick();

    setAuthFailureReason('invalid_token');
    clearAuth();

    expect(stored()?.draft.sections[0]!.lyrics).toBe('Typed before expiry');
    await waitFor(() => expect(screen.queryByLabelText('Song title')).toBeNull());
  });

  it('writes nothing back when the user is cleared by signing out', async () => {
    setupStudio({ plan: planDocument(), lyrics: lyricsDocument() });
    setCurrentUser();
    renderPage();
    await type(await firstLyrics(), 'Typed before sign-out');
    await tick();

    clearAuth();
    await pause(450);

    expect(stored()).toBeNull();
    expect(screen.queryByLabelText('Song title')).toBeNull();
  });

  it('with storage unavailable, leaving asks in a sheet and Leave navigates', async () => {
    vi.spyOn(songDraftStore, 'available', 'get').mockReturnValue(false);
    vi.spyOn(songDraftStore, 'save').mockReturnValue(false);
    setupStudio();
    setCurrentUser();
    renderPage();
    await startSong(1);
    const url = 'http://localhost/app/library';

    expect(navigate({ url }).cancel).toHaveBeenCalledOnce();
    const dialog = await screen.findByRole('dialog', { name: 'Leave without saving?' });
    expect(within(dialog).getByText("This device can't keep your changes.")).toBeTruthy();
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Stay' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(state.goto).not.toHaveBeenCalled();

    navigate({ url });
    const again = await screen.findByRole('dialog', { name: 'Leave without saving?' });
    expect(state.goto).not.toHaveBeenCalled();
    await fireEvent.click(within(again).getByRole('button', { name: 'Leave' }));
    expect(state.goto).toHaveBeenCalledExactlyOnceWith(new URL(url));
    expect(navigate({ url }).cancel).not.toHaveBeenCalled();
  });

  it('leaves a closing tab to the browser prompt when storage is unavailable', async () => {
    vi.spyOn(songDraftStore, 'available', 'get').mockReturnValue(false);
    vi.spyOn(songDraftStore, 'save').mockReturnValue(false);
    setupStudio();
    setCurrentUser();
    renderPage();
    await startSong(1);

    expect(navigate({ type: 'leave' }).cancel).toHaveBeenCalledOnce();
    await tick();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('save and problems', () => {
  async function startDirtySong(sections = 1) {
    const studio = setupStudio();
    setCurrentUser();
    renderPage();
    await startSong(sections);
    await type(screen.getByLabelText('Lyrics language'), 'en');
    return studio;
  }

  it('Save stays enabled with a problem and clicking it shows and focuses the summary', async () => {
    const studio = await startDirtySong();
    await type(screen.getByLabelText('Song title'), '');
    expect(saveButton().disabled).toBe(false);

    await fireEvent.click(saveButton());

    await waitFor(() => expect(document.activeElement).toBe(summaryHeading()));
    expect(summaryHeading()?.textContent).toContain('Problems: 1');
    expect(summaryHeading()?.closest('section')?.getAttribute('role')).toBe('alert');
    expect(studio.calls).toEqual([]);
  });

  it('fixing the problem after Ctrl+S re-enables Save and clears the summary', async () => {
    await startDirtySong();
    const title = screen.getByLabelText('Song title');
    await type(title, '');
    await fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    await waitFor(() => expect(summaryHeading()).not.toBeNull());

    await type(title, 'Fixed title');

    expect(summaryHeading()).toBeNull();
    expect(saveButton().disabled).toBe(false);
    await fireEvent.click(saveButton());
    await waitForToast('Saved: plan v1');
  });

  it('announces the summary once, then updates it politely', async () => {
    await startDirtySong();
    await type(screen.getByLabelText('Song title'), '');
    await fireEvent.click(saveButton());
    await waitFor(() => expect(summaryHeading()).not.toBeNull());

    await type(screen.getByLabelText('Tempo (BPM)'), '10');

    expect(summaryHeading()?.textContent).toContain('Problems: 2');
    expect(summaryHeading()?.closest('section')?.getAttribute('role')).toBeNull();
    expect(statusTexts()).toContain('Problems: 2');
  });

  it('the summary is not shown before a save attempt', async () => {
    await startDirtySong();
    const title = screen.getByLabelText('Song title');
    await type(title, '');
    await type(lyricsFields()[0]!, '[whispered]');

    expect(summaryHeading()).toBeNull();
    expect(title.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('button', { name: /^Line 1 · /u })).toBeTruthy();
  });

  it('a 422 on sections[1].lines[2] marks that card and "Line 3", and clears after the next edit', async () => {
    await startDirtySong(2);
    server.use(
      http.post(`${BASE}/v1/studio/tracks/t1/versions`, async ({ request }) => {
        const body = (await request.json()) as { kind: string; content: unknown };
        if (body.kind === 'lyrics')
          return HttpResponse.json(
            {
              error: 'document_invalid',
              message: 'Invalid',
              status_code: 422,
              detail: { issues: [{ path: 'sections[1].lines[2]', code: 'reserved_delivery_tag' }] },
            },
            { status: 422 },
          );
        return HttpResponse.json(
          {
            version: makePlanVersion({
              id: 'plan-v1',
              track_id: 't1',
              is_current: false,
              content: body.content as never,
            }),
            lyrics_detached: false,
          },
          { status: 201 },
        );
      }),
    );
    await type(lyricsFields()[0]!, 'Verse line');
    await type(lyricsFields()[1]!, 'One\nTwo\nThree');
    await fireEvent.click(saveButton());

    const [first, second] = cards() as [HTMLElement, HTMLElement];
    const inline = await within(second).findByRole('button', { name: /^Line 3 · /u });
    expect(lyricsFields()[1]!.getAttribute('aria-invalid')).toBe('true');
    expect(lyricsFields()[1]!.getAttribute('aria-describedby')).toContain(inline.closest('li')!.id);
    expect(lyricsFields()[0]!.getAttribute('aria-invalid')).toBe('false');
    expect(within(first).queryByRole('button', { name: /^Line / })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(summaryHeading()));
    await fireEvent.click(inline);
    const field = lyricsFields()[1]!;
    expect(field.value.slice(field.selectionStart, field.selectionEnd)).toBe('Three');

    await type(field, 'One\nTwo\nFour');
    expect(within(second).queryByRole('button', { name: /^Line 3 · /u })).toBeNull();
    expect(summaryHeading()).toBeNull();
    expect(field.getAttribute('aria-invalid')).toBe('false');
  });

  it('reports a rejected save whose issues no longer match the draft', async () => {
    await startDirtySong();
    const post = gate();
    server.use(
      http.post(`${BASE}/v1/studio/tracks/t1/versions`, async () => {
        await post.promise;
        return HttpResponse.json(
          {
            error: 'document_invalid',
            message: 'Invalid',
            status_code: 422,
            detail: { issues: [{ path: 'title', code: 'reserved_characters' }] },
          },
          { status: 422 },
        );
      }),
    );
    await fireEvent.click(saveButton());
    await type(screen.getByLabelText('Song title'), 'Typed meanwhile');
    post.release();

    expect(await screen.findByText('Could not save the song. Please try again.')).toBeTruthy();
    expect(summaryHeading()).toBeNull();
  });

  it('label, duration and notes problems are shown next to their fields', async () => {
    await startDirtySong();
    const card = cards()[0]!;
    const fields = [
      within(card).getByLabelText('Section label'),
      within(card).getByLabelText('Duration (seconds)'),
      within(card).getByLabelText('Notes'),
    ];
    await type(fields[0]!, 'a'.repeat(61));
    await type(fields[1]!, '700');
    await type(fields[2]!, 'n'.repeat(1001));

    for (const field of fields) {
      expect(field.getAttribute('aria-invalid')).toBe('true');
      const message = document.getElementById(field.getAttribute('aria-describedby')!);
      expect(message?.textContent?.trim()).toBeTruthy();
      expect(card.contains(message)).toBe(true);
    }
    expect(summaryHeading()).toBeNull();
  });

  it('opens the closed details around a field picked in the summary', async () => {
    await startDirtySong();
    const notes = within(cards()[0]!).getByLabelText('Notes');
    await type(notes, 'n'.repeat(1001));
    await fireEvent.click(saveButton());
    await waitFor(() => expect(summaryHeading()).not.toBeNull());
    const details = notes.closest('details')!;
    expect(details.open).toBe(false);

    await fireEvent.click(
      within(summaryHeading()!.closest('section')!).getByRole('button', { name: /Verse/u }),
    );

    await waitFor(() => expect(document.activeElement).toBe(notes));
    expect(details.open).toBe(true);
  });
});

describe('editor resilience and concurrency', () => {
  async function openServerSong() {
    const studio = setupStudio({ plan: planDocument(), lyrics: lyricsDocument() });
    setCurrentUser();
    const view = renderPage();
    await firstLyrics();
    return { studio, ...view };
  }

  it('typing during a save keeps the new text dirty and stored', async () => {
    const { studio, client } = await openServerSong();
    const post = gate();
    studio.holds.versionPost = post.promise;
    await type(lyricsFields()[0]!, 'Saved text');
    await fireEvent.click(saveButton());
    await waitFor(() => expect(studio.calls).toHaveLength(1));

    await type(lyricsFields()[0]!, 'Saved text, then more');
    post.release();

    await waitForToast('Saved: lyrics v2');
    expect(studio.calls[0]!.body).toMatchObject({
      content: { sections: [{ lines: [{ text: 'Saved text' }] }] },
    });
    await waitFor(() => expect(client.isMutating()).toBe(0));
    expect(lyricsFields()[0]!.value).toBe('Saved text, then more');
    expect(hasStatus('Unsaved changes')).toBe(true);
    expect(stored()?.base).toEqual({ plan: 'plan-v1', lyrics: 'lyrics-v2' });
    expect(stored()?.draft.sections[0]!.lyrics).toBe('Saved text, then more');
  });

  it("switching track remounts the editor with that track's draft", async () => {
    setupStudio();
    setCurrentUser();
    for (const trackId of ['t1', 't2']) {
      let id = 0;
      const draft = newDraft('verse_chorus', 'Song', 'en', () => `${trackId}-section-${++id}`);
      draft.sections[0]!.lyrics = `Words of ${trackId}`;
      songDraftStore.save(USER, trackId, {
        savedAt: new Date().toISOString(),
        base: { plan: null, lyrics: null },
        draft,
      });
    }
    renderPage();
    await restoreWhenReady();
    expect(lyricsFields()[0]!.value).toBe('Words of t1');
    navigate();

    route.open('t2');

    await restoreWhenReady();
    expect(lyricsFields()[0]!.value).toBe('Words of t2');
    expect(stored('t1')?.draft.sections[0]!.lyrics).toBe('Words of t1');
  });

  it('a track refetch error keeps the editor and the draft', async () => {
    const { client } = await openServerSong();
    const field = lyricsFields()[0]!;
    await type(field, 'Still here');
    server.use(
      http.get(`${BASE}/v1/studio/tracks/t1`, () =>
        HttpResponse.json(
          { error: 'server_error', message: 'Broken', status_code: 500 },
          { status: 500 },
        ),
      ),
    );

    await client.refetchQueries({ queryKey: studioKeys.track('t1'), exact: true });

    await screen.findByRole('button', { name: 'Try again' });
    expect(lyricsFields()[0]).toBe(field);
    expect(field.value).toBe('Still here');
    await waitFor(() => expect(stored()?.draft.sections[0]!.lyrics).toBe('Still here'));
  });

  it('a breakpoint change keeps the draft', async () => {
    setupStudio({ plan: planDocument(), lyrics: lyricsDocument() });
    setCurrentUser();
    const { container } = renderPage(newClient(), EditorShellHarness as never);
    const field = await firstLyrics();
    await type(field, 'Across breakpoints');

    for (const desktop of [true, false]) {
      (isDesktop as Writable<boolean>).set(desktop);
      await tick();
      expect(container.querySelector('.sidebar') !== null).toBe(desktop);
      expect(lyricsFields()[0]).toBe(field);
      expect(field.value).toBe('Across breakpoints');
    }
  });

  it('focus moves to the next card after delete and to the handle after move', async () => {
    setupStudio();
    setCurrentUser();
    renderPage();
    await startTemplate();
    const handle = (card: Element) => card.querySelector<HTMLElement>('[data-section-handle]')!;
    const press = (card: HTMLElement, name: string) =>
      fireEvent.click(within(card).getByRole('button', { name }));

    // An empty section is deleted at once.
    const nextAfterFirst = cards()[1]!;
    await press(cards()[0]!, 'Delete');
    await waitFor(() => expect(cards()).toHaveLength(5));
    await waitFor(() => expect(document.activeElement).toBe(handle(nextAfterFirst)));

    // A section with lyrics is confirmed first.
    await type(within(cards()[0]!).getByLabelText('Lyrics'), 'Not empty');
    const nextAfterConfirm = cards()[1]!;
    await press(cards()[0]!, 'Delete');
    const dialog = await screen.findByRole('dialog', { name: 'Delete this section?' });
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(cards()).toHaveLength(4));
    await waitFor(() => expect(document.activeElement).toBe(handle(nextAfterConfirm)));

    const moved = cards()[0]!;
    await press(moved, 'Move down');
    await waitFor(() => expect(cards()[1]).toBe(moved));
    await waitFor(() => expect(document.activeElement).toBe(handle(moved)));
  });

  it('save is disabled while another track write is pending', async () => {
    const { studio, client } = await openServerSong();
    await type(lyricsFields()[0]!, 'Changed');
    expect(saveButton().disabled).toBe(false);
    const write = gate();
    const mutation = client.getMutationCache().build(client, {
      mutationKey: studioMutationKeys.trackDocuments('t1'),
      mutationFn: () => write.promise,
    });
    const pending = mutation.execute(undefined);

    await waitFor(() => expect(saveButton().disabled).toBe(true));
    await fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    await pause(20);
    expect(studio.calls).toEqual([]);

    write.release();
    await pending;
    await waitFor(() => expect(saveButton().disabled).toBe(false));
  });

  it('one reconcile after a three-step save', async () => {
    const studio = setupStudio();
    setCurrentUser();
    const { client } = renderPage();
    await startSong(1);
    await type(screen.getByLabelText('Lyrics language'), 'en');
    await type(lyricsFields()[0]!, 'A line');
    const invalidate = vi.spyOn(client, 'invalidateQueries');

    await fireEvent.click(saveButton());
    await waitForToast('Saved: plan v1, lyrics v1');
    await waitFor(() => expect(client.isMutating()).toBe(0));
    await pause(20);

    expect(studio.calls.map((call) => call.method)).toEqual(['POST', 'POST', 'PUT']);
    const trackKey = JSON.stringify(studioKeys.track('t1'));
    expect(
      invalidate.mock.calls.filter(
        ([filters]) => filters?.exact && JSON.stringify(filters.queryKey) === trackKey,
      ),
    ).toHaveLength(1);
  });

  it('confirming lyrics removal sends lyrics_version_id null', async () => {
    const { studio } = await openServerSong();
    await type(lyricsFields()[0]!, '');
    await fireEvent.click(saveButton());

    const dialog = await screen.findByRole('dialog', { name: 'Remove the lyrics?' });
    expect(studio.calls).toEqual([]);
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Remove lyrics' }));

    await waitForToast('Saved: lyrics removed');
    expect(studio.calls).toEqual([
      {
        method: 'PUT',
        trackId: 't1',
        body: { plan_version_id: 'plan-v1', lyrics_version_id: null },
      },
    ]);
  });

  it('a conflict asks in a sheet and Replace saves on the base', async () => {
    const { studio } = await openServerSong();
    await type(lyricsFields()[0]!, 'My change');
    studio.addVersion('lyrics-v2', 'lyrics', lyricsDocument('Someone else'));
    studio.pairOf('t1').lyrics = 'lyrics-v2';

    await fireEvent.click(saveButton());
    const dialog = await screen.findByRole('dialog', { name: 'This track changed' });
    expect(studio.calls).toEqual([]);
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Replace current' }));

    await waitForToast('Saved: lyrics v3');
    expect(studio.calls[0]!.body).toMatchObject({
      kind: 'lyrics',
      parent_version_id: 'lyrics-v1',
    });
    expect(studio.calls[1]!.body).toEqual({
      plan_version_id: 'plan-v1',
      lyrics_version_id: 'lyrics-v3',
    });
  });
});
