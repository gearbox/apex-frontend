import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { QueryClient } from '@tanstack/svelte-query';
import { get } from 'svelte/store';
import type { ComponentProps } from 'svelte';
import { http, HttpResponse } from 'msw';
import QueryHarness from '../../../../../../../../../tests/QueryHarness.svelte';
import { server } from '../../../../../../../../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../../../../../../../../mocks/config';
import {
  makeProjectProfile,
  makeSunoImportResult,
  makeTrackDetail,
  makeVersionSummary,
} from '../../../../../../../../../mocks/factories/studio';
import { clearToasts, toasts } from '$lib/stores/toasts';
import { setCurrentMutationOptions } from '$lib/queries/studioVersions';

vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$app/stores', () => ({
  page: {
    subscribe: (fn: (value: unknown) => void) => {
      fn({
        params: { projectId: 'p1', trackId: 't1' },
        url: new URL('http://localhost/app/studio/p1/tracks/t1/import'),
      });
      return () => {};
    },
  },
}));
import { goto } from '$app/navigation';
import ImportPage from './+page.svelte';

afterEach(() => {
  cleanup();
  clearToasts();
  vi.clearAllMocks();
});

async function setup(
  onImport: (request: Record<string, unknown>) => unknown = () =>
    makeSunoImportResult({ dry_run: false }),
  onPreview: (request: Record<string, unknown>) => unknown = () => makeSunoImportResult(),
) {
  const previewBodies: Record<string, unknown>[] = [];
  const importBodies: Record<string, unknown>[] = [];
  server.use(
    http.get(`${BASE}/v1/studio/tracks/t1`, () =>
      HttpResponse.json(
        makeTrackDetail({
          id: 't1',
          library_project_id: 'p1',
          title: 'Song',
          current_lyrics_version_id: 'lyrics-current',
        }),
      ),
    ),
    http.get(`${BASE}/v1/studio/projects/p1`, () =>
      HttpResponse.json(makeProjectProfile({ library_project_id: 'p1' })),
    ),
    http.post(`${BASE}/v1/studio/tracks/t1/imports/suno`, async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      if (body.dry_run) {
        previewBodies.push(body);
        const result = await onPreview(body);
        return result instanceof Response
          ? result
          : HttpResponse.json(result as Record<string, unknown>);
      }
      importBodies.push(body);
      const result = await onImport(body);
      return result instanceof Response
        ? result
        : HttpResponse.json(result as Record<string, unknown>, { status: 201 });
    }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(QueryHarness<ComponentProps<typeof ImportPage>>, {
    props: {
      component: ImportPage,
      componentProps: {},
      client,
    },
  });
  await screen.findByText('Song');
  return { client, previewBodies, importBodies };
}

it('disables Import before preview and after any request field changes', async () => {
  const { client } = await setup();
  expect((screen.getByRole('button', { name: 'Import' }) as HTMLButtonElement).disabled).toBe(true);
  await fireEvent.input(screen.getByLabelText('Style of Music'), {
    target: { value: 'dream pop' },
  });
  await fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
  await screen.findByText('Plan: new version');
  expect((screen.getByRole('button', { name: 'Import' }) as HTMLButtonElement).disabled).toBe(
    false,
  );
  await fireEvent.input(screen.getByLabelText('Style of Music'), { target: { value: 'rock' } });
  expect((screen.getByRole('button', { name: 'Import' }) as HTMLButtonElement).disabled).toBe(true);
  client.clear();
});

it('imports exactly the request snapshot that was previewed', async () => {
  const { client, previewBodies, importBodies } = await setup(() =>
    makeSunoImportResult({
      dry_run: false,
      created: true,
      plan_version: makeVersionSummary({ version_number: 4 }),
      lyrics_version: makeVersionSummary({ kind: 'lyrics', version_number: 6 }),
    }),
  );
  await fireEvent.input(screen.getByLabelText('Style of Music'), {
    target: { value: '  rock, dream pop ' },
  });
  await fireEvent.input(screen.getByLabelText('Lyrics'), { target: { value: '[Verse]\nA line' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
  await screen.findByText('Plan: new version');
  await fireEvent.click(screen.getByRole('button', { name: 'Import' }));
  await waitFor(() => expect(importBodies).toHaveLength(1));
  expect(importBodies[0]).toEqual({ ...previewBodies[0], dry_run: false });
  expect(previewBodies[0]).toEqual({
    style: '  rock, dream pop ',
    exclude: '',
    lyrics: '[Verse]\nA line',
    title: null,
    instrumental: null,
    language: null,
    dry_run: true,
  });
  await waitFor(() => expect(goto).toHaveBeenCalledWith('/app/studio/p1/tracks/t1'));
  client.clear();
});

it('shows that the current lyrics will be cleared for a preview without lyrics', async () => {
  const { client } = await setup(
    () => makeSunoImportResult({ dry_run: false }),
    () => makeSunoImportResult({ lyrics: null }),
  );
  await fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
  expect(
    await screen.findByText('Lyrics: none — the current lyrics will be cleared.'),
  ).toBeTruthy();
  client.clear();
});

it('selects the requested line with CRLF and CR pasted line endings', async () => {
  const { client } = await setup(
    () => makeSunoImportResult({ dry_run: false }),
    () =>
      HttpResponse.json(
        {
          error: 'import_invalid',
          message: 'invalid',
          status_code: 422,
          detail: {
            issues: [{ path: 'lyrics', code: 'unsupported_inline_tag' }],
            source_lines: { lyrics: [2] },
          },
        },
        { status: 422 },
      ),
  );
  const lyrics = screen.getByLabelText('Lyrics') as HTMLTextAreaElement;
  await fireEvent.input(lyrics, { target: { value: 'first\r\nsecond\rthird' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
  await fireEvent.click(await screen.findByRole('button', { name: 'Line 2' }));
  expect(lyrics.selectionStart).toBe(6);
  expect(lyrics.selectionEnd).toBe(12);
  expect(lyrics.value.slice(lyrics.selectionStart, lyrics.selectionEnd)).toBe('second');
  client.clear();
});

it('opens More and focuses Language after language_required', async () => {
  const { client } = await setup(
    () => makeSunoImportResult({ dry_run: false }),
    () =>
      HttpResponse.json(
        {
          error: 'language_required',
          message: 'language required',
          status_code: 422,
        },
        { status: 422 },
      ),
  );
  await fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
  const more = screen.getByText('More').closest('details') as HTMLDetailsElement;
  expect(await screen.findByText(/Add a language before previewing/)).toBeTruthy();
  expect(more.open).toBe(true);
  await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Language')));
  client.clear();
});

it('sets Instrumental to Off and previews again after an instrumental-lines error', async () => {
  const requests: Record<string, unknown>[] = [];
  const { client } = await setup(
    () => makeSunoImportResult({ dry_run: false }),
    (body) => {
      requests.push(body);
      return requests.length === 1
        ? HttpResponse.json(
            { error: 'instrumental_with_lyric_lines', message: 'instrumental', status_code: 422 },
            { status: 422 },
          )
        : makeSunoImportResult();
    },
  );
  await fireEvent.input(screen.getByLabelText('Lyrics'), { target: { value: 'a lyric line' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
  await fireEvent.click(
    await screen.findByRole('button', { name: 'Set Instrumental to Off and preview again' }),
  );
  await waitFor(() => expect(requests).toHaveLength(2));
  expect(requests.map((item) => item.instrumental)).toEqual([null, false]);
  client.clear();
});

it('shows a Nothing changed toast for a no-op import', async () => {
  const { client } = await setup(() => makeSunoImportResult({ dry_run: false, created: false }));
  await fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
  await screen.findByText('Plan: new version');
  await fireEvent.click(screen.getByRole('button', { name: 'Import' }));
  await waitFor(() => expect(get(toasts).at(-1)?.message).toBe('Nothing changed'));
  expect(goto).toHaveBeenCalledWith('/app/studio/p1/tracks/t1');
  client.clear();
});

it('a late import response only toasts after the page is destroyed', async () => {
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const requested = new Promise<void>((resolve) => (started = resolve));
  const { client } = await setup(async () => {
    started();
    await gate;
    return makeSunoImportResult({ dry_run: false, created: true });
  });
  await fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
  await screen.findByText('Plan: new version');
  await fireEvent.click(screen.getByRole('button', { name: 'Import' }));
  await requested;
  cleanup();
  release();
  await waitFor(() => expect(get(toasts).at(-1)?.message).toContain('Imported: plan v'));
  expect(goto).not.toHaveBeenCalled();
  client.clear();
});

it('disables Import while a current-pair write on the same track is pending', async () => {
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const requested = new Promise<void>((resolve) => (started = resolve));
  server.use(
    http.put(`${BASE}/v1/studio/tracks/t1/current`, async () => {
      started();
      await gate;
      return HttpResponse.json({});
    }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const pendingWrite = client
    .getMutationCache()
    .build(client, setCurrentMutationOptions(client, 'p1', 't1'))
    .execute({ plan: 'plan-1' });
  await requested;
  server.use(
    http.get(`${BASE}/v1/studio/tracks/t1`, () =>
      HttpResponse.json(makeTrackDetail({ id: 't1', library_project_id: 'p1' })),
    ),
    http.get(`${BASE}/v1/studio/projects/p1`, () =>
      HttpResponse.json(makeProjectProfile({ library_project_id: 'p1' })),
    ),
    http.post(`${BASE}/v1/studio/tracks/t1/imports/suno`, () =>
      HttpResponse.json(makeSunoImportResult()),
    ),
  );
  render(QueryHarness<ComponentProps<typeof ImportPage>>, {
    props: { component: ImportPage, componentProps: {}, client },
  });
  await fireEvent.click(await screen.findByRole('button', { name: 'Preview' }));
  await screen.findByText('Plan: new version');
  expect((screen.getByRole('button', { name: 'Import' }) as HTMLButtonElement).disabled).toBe(true);
  release();
  await pendingWrite;
  client.clear();
});

it('has one page heading and preserves the form when the viewport changes', async () => {
  const { client } = await setup();
  await fireEvent.input(screen.getByLabelText('Lyrics'), { target: { value: 'Pasted line' } });
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  window.dispatchEvent(new Event('resize'));
  expect((screen.getByLabelText('Lyrics') as HTMLTextAreaElement).value).toBe('Pasted line');
  client.clear();
});
