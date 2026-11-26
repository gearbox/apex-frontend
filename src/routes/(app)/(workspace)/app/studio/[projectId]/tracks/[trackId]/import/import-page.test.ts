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

it('editing after a preview marks it outdated and hides line buttons', async () => {
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
  const lyrics = screen.getByLabelText('Lyrics');
  await fireEvent.input(lyrics, { target: { value: '[Verse]\nla [soft] la' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
  await screen.findByRole('button', { name: 'Line 2' });
  await fireEvent.input(lyrics, { target: { value: 'inserted\n[Verse]\nla [soft] la' } });
  const status = screen.getByRole('status', { name: '' });
  expect(status.textContent).toContain(
    'The text changed since the preview. Preview again to see the result.',
  );
  expect(screen.queryByRole('button', { name: 'Line 2' })).toBeNull();
  expect((screen.getByRole('button', { name: 'Import' }) as HTMLButtonElement).disabled).toBe(true);
  await fireEvent.click(screen.getByText('Show the previous preview (outdated)'));
  expect(screen.queryByRole('button', { name: 'Line 2' })).toBeNull();
  client.clear();
});

it('editing after an error hides stale issues until the next preview', async () => {
  let previews = 0;
  const { client } = await setup(
    () => makeSunoImportResult({ dry_run: false }),
    () => {
      previews++;
      return previews === 1
        ? HttpResponse.json(
            {
              error: 'import_invalid',
              message: 'invalid',
              status_code: 422,
              detail: { issues: [{ path: 'plan.global_style.avoid[0]', code: 'tag_conflict' }] },
            },
            { status: 422 },
          )
        : makeSunoImportResult();
    },
  );
  await fireEvent.input(screen.getByLabelText('Style of Music'), { target: { value: 'rock' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
  const issue = await screen.findByText('A style tag is also listed as an avoid tag.');
  const styleBox = screen.getByLabelText('Style of Music').parentElement;
  const excludeBox = screen.getByLabelText('Exclude styles').parentElement;
  expect(styleBox?.contains(issue)).toBe(false);
  expect(excludeBox?.contains(issue)).toBe(true);
  await fireEvent.input(screen.getByLabelText('Style of Music'), {
    target: { value: 'dream pop' },
  });
  expect(screen.getByRole('status').textContent).toContain('The text changed since the preview.');
  expect(screen.queryByRole('alert')).toBeNull();
  const previous = screen.getByText('Show the previous preview (outdated)');
  await fireEvent.click(previous);
  expect(screen.getByText('A style tag is also listed as an avoid tag.')).toBeTruthy();
  await fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
  await screen.findByText('Plan: new version');
  expect(screen.queryByText('Show the previous preview (outdated)')).toBeNull();
  expect(screen.queryByText('A style tag is also listed as an avoid tag.')).toBeNull();
  client.clear();
});

it('the disabled Import explains why the preview cannot be reused', async () => {
  const { client } = await setup();
  await fireEvent.input(screen.getByLabelText('Style of Music'), { target: { value: 'rock' } });
  await fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
  await screen.findByText('Plan: new version');
  await fireEvent.input(screen.getByLabelText('Style of Music'), {
    target: { value: 'dream pop' },
  });
  const importButton = screen.getByRole('button', { name: 'Import' });
  expect((importButton as HTMLButtonElement).disabled).toBe(true);
  const statusId = importButton.getAttribute('aria-describedby');
  expect(statusId).toBe('import-stale-status');
  expect(document.getElementById(statusId!)?.textContent).toContain(
    'The text changed since the preview. Preview again to see the result.',
  );
  client.clear();
});

it('an invalid language blocks Preview with a format hint', async () => {
  const { client } = await setup();
  await fireEvent.click(screen.getByText('More'));
  const language = screen.getByLabelText('Language');
  await fireEvent.input(language, { target: { value: 'EN-us' } });
  expect(language.getAttribute('aria-invalid')).toBe('true');
  expect(screen.getByText(/Use a language code such as en or pt-BR/)).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Preview' }) as HTMLButtonElement).disabled).toBe(
    true,
  );
  client.clear();
});

it.each([
  {
    name: 'changed plan and lyrics',
    result: {
      created: true,
      plan_unchanged: false,
      lyrics_unchanged: false,
      plan_version: makeVersionSummary({ version_number: 3 }),
      lyrics_version: makeVersionSummary({ kind: 'lyrics', version_number: 4 }),
      lyrics: { language: 'en', sections: [] },
    },
    expected: 'New plan v3 and lyrics v4',
  },
  {
    name: 'changed plan only',
    result: {
      created: true,
      plan_unchanged: false,
      lyrics_unchanged: true,
      plan_version: makeVersionSummary({ version_number: 3 }),
    },
    expected: 'New plan v3',
  },
  {
    name: 'changed lyrics only',
    result: {
      created: true,
      plan_unchanged: true,
      lyrics_unchanged: false,
      lyrics_version: makeVersionSummary({ kind: 'lyrics', version_number: 4 }),
      lyrics: { language: 'en', sections: [] },
    },
    expected: 'New lyrics v4',
  },
  {
    name: 'changed plan and cleared lyrics',
    result: {
      created: true,
      plan_unchanged: false,
      lyrics_unchanged: false,
      plan_version: makeVersionSummary({ version_number: 3 }),
      lyrics: null,
    },
    expected: 'New plan v3; lyrics cleared',
  },
  {
    name: 'no changes',
    result: { created: false },
    expected: 'Nothing changed',
  },
])('the toast names only what changed: $name', async ({ result, expected }) => {
  const { client } = await setup(() => makeSunoImportResult({ dry_run: false, ...result }));
  await fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
  await screen.findByText('Plan: new version');
  await fireEvent.click(screen.getByRole('button', { name: 'Import' }));
  await waitFor(() => expect(get(toasts).at(-1)?.message).toBe(expected));
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
  await waitFor(() => expect(get(toasts).at(-1)?.message).toContain('New plan v'));
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
