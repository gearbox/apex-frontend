import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { QueryClient } from '@tanstack/svelte-query';
import type { Component } from 'svelte';
import { http, HttpResponse } from 'msw';
import QueryHarness from '../../../tests/QueryHarness.svelte';
import { server } from '../../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../../mocks/config';
import { makePlanVersion, makeSunoExport } from '../../../mocks/factories/studio';
import { studioKeys } from '$lib/queries/studio';

vi.mock('$app/stores', () => ({
  page: {
    subscribe: (fn: (value: unknown) => void) => {
      fn({ params: { projectId: 'p1' }, url: new URL('http://localhost/app/studio/p1/tracks/t1') });
      return () => {};
    },
  },
}));
import SunoExportSheet from './SunoExportSheet.svelte';

afterEach(() => {
  cleanup();
  document.querySelector('.test-background-dialog')?.remove();
  Reflect.deleteProperty(navigator, 'clipboard');
  Reflect.deleteProperty(document, 'execCommand');
  vi.restoreAllMocks();
});

function mount(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const view = render(QueryHarness<{ trackId: string; onclose: () => void }>, {
    props: {
      component: SunoExportSheet as Component<{ trackId: string; onclose: () => void }>,
      componentProps: { trackId: 't1', onclose: vi.fn() },
      client,
    },
  });
  return { ...view, client };
}

it('renders all four Suno boxes and copies the exact selected field', async () => {
  const exported = makeSunoExport({
    title: 'Title exactly',
    style: 'Style exactly',
    exclude: 'Exclude exactly',
    lyrics: 'Lyrics exactly\nline two',
  });
  server.use(
    http.get(`${BASE}/v1/studio/tracks/t1/exports/suno`, () => HttpResponse.json(exported)),
    http.get(`${BASE}/v1/studio/versions/plan_mock_001`, () =>
      HttpResponse.json(makePlanVersion()),
    ),
  );
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  const { client } = mount();
  await screen.findByDisplayValue('Title exactly');
  expect(screen.getByDisplayValue('Style exactly')).toBeTruthy();
  expect(screen.getByDisplayValue('Exclude exactly')).toBeTruthy();
  expect(document.querySelector('[data-export-field="lyrics"]')?.textContent?.trim()).toBe(
    'Lyrics exactly\nline two',
  );
  await fireEvent.click(screen.getByRole('button', { name: 'Copy Lyrics' }));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith('Lyrics exactly\nline two'));
  expect(await screen.findByRole('status')).toBeTruthy();
  client.clear();
});

it('gives each copy button a distinct accessible name', async () => {
  server.use(
    http.get(`${BASE}/v1/studio/tracks/t1/exports/suno`, () => HttpResponse.json(makeSunoExport())),
  );
  const { client } = mount();
  await screen.findByDisplayValue('First track');
  expect(
    screen
      .getAllByRole('button', { name: /^Copy / })
      .map((button) => button.getAttribute('aria-label')),
  ).toEqual(['Copy Song title', 'Copy Style of Music', 'Copy Exclude styles', 'Copy Lyrics']);
  client.clear();
});

it('shows over-limit guidance and the instrumental callout', async () => {
  server.use(
    http.get(`${BASE}/v1/studio/tracks/t1/exports/suno`, () =>
      HttpResponse.json(
        makeSunoExport({
          instrumental: true,
          fields: {
            title: { length: 8, limit: null, within_limit: true },
            style: { length: 1001, limit: 1000, within_limit: false },
            exclude: { length: 5, limit: 1000, within_limit: true },
            lyrics: { length: 4, limit: 5000, within_limit: true },
          },
        }),
      ),
    ),
  );
  const { client } = mount();
  expect(await screen.findByText(/Turn on Instrumental in Suno/)).toBeTruthy();
  expect(await screen.findByText('Suno will cut this; shorten it.')).toBeTruthy();
  expect(screen.getByText('1001 / 1000')).toBeTruthy();
  client.clear();
});

it('names the section that caused an export warning', async () => {
  const plan = makePlanVersion({
    id: 'plan_mock_001',
    content: {
      title: 'First track',
      instrumental: false,
      references: [],
      sections: [{ id: 'warn-section', kind: 'verse', delivery: [], instrumental: false }],
    },
  });
  server.use(
    http.get(`${BASE}/v1/studio/tracks/t1/exports/suno`, () =>
      HttpResponse.json(
        makeSunoExport({
          warnings: [{ code: 'local_avoid_not_exportable', section_id: 'warn-section' }],
        }),
      ),
    ),
    http.get(`${BASE}/v1/studio/versions/plan_mock_001`, () => HttpResponse.json(plan)),
  );
  const { client } = mount();
  expect(await screen.findByText(/Section avoid tags are not sent to Suno/)).toBeTruthy();
  expect(screen.getByText(/Verse/)).toBeTruthy();
  client.clear();
});

it('links a missing plan response to the import page', async () => {
  server.use(
    http.get(`${BASE}/v1/studio/tracks/t1/exports/suno`, () =>
      HttpResponse.json(
        { error: 'plan_required', message: 'no plan', status_code: 409 },
        { status: 409 },
      ),
    ),
  );
  const { client } = mount();
  expect(await screen.findByText(/This track has no plan yet/)).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Import from Suno' }).getAttribute('href')).toBe(
    '/app/studio/p1/tracks/t1/import',
  );
  client.clear();
});

it('links an incompatible explicit pair to History', async () => {
  server.use(
    http.get(`${BASE}/v1/studio/tracks/t1/exports/suno`, () =>
      HttpResponse.json(
        { error: 'lyrics_incompatible_with_plan', message: 'incompatible', status_code: 409 },
        { status: 409 },
      ),
    ),
  );
  const { client } = mount();
  expect(
    await screen.findByText(
      'These versions cannot be exported together because their sections do not match.',
    ),
  ).toBeTruthy();
  expect(screen.getByRole('link', { name: 'History' }).getAttribute('href')).toBe(
    '/app/studio/p1/tracks/t1/history',
  );
  client.clear();
});

it('explains clipboard fallback failure and allows manual selection', async () => {
  server.use(
    http.get(`${BASE}/v1/studio/tracks/t1/exports/suno`, () => HttpResponse.json(makeSunoExport())),
  );
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn(() => false) });
  const { client } = mount();
  await screen.findByDisplayValue('First track');
  await fireEvent.click(screen.getByRole('button', { name: 'Copy Song title' }));
  expect((await screen.findByRole('status')).textContent).toContain(
    "Couldn't copy. Select the text and copy it manually.",
  );
  expect(document.activeElement).toBe(screen.getByDisplayValue('First track'));
  client.clear();
});

it('shows the export load error for a generic failure', async () => {
  server.use(
    http.get(`${BASE}/v1/studio/tracks/t1/exports/suno`, () =>
      HttpResponse.json(
        { error: 'server_error', message: 'failed', status_code: 500 },
        { status: 500 },
      ),
    ),
  );
  const { client } = mount();
  expect(await screen.findByText('Could not load this export. Please try again.')).toBeTruthy();
  client.clear();
});

it('selects the fallback field in this sheet when another dialog is open', async () => {
  const background = document.createElement('div');
  background.className = 'test-background-dialog';
  background.setAttribute('role', 'dialog');
  background.innerHTML = '<input data-export-field="style" value="Background field" />';
  document.body.prepend(background);
  server.use(
    http.get(`${BASE}/v1/studio/tracks/t1/exports/suno`, () => HttpResponse.json(makeSunoExport())),
  );
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn(() => false) });
  const { client } = mount();
  await screen.findByDisplayValue('First track');
  const style = screen.getByDisplayValue('dream pop, warm synths');
  await fireEvent.click(screen.getByRole('button', { name: 'Copy Style of Music' }));
  await waitFor(() => expect(document.activeElement).toBe(style));
  expect(document.activeElement).not.toBe(background.querySelector('input'));
  client.clear();
});

it('refetches the export whenever the sheet is opened again', async () => {
  let reads = 0;
  server.use(
    http.get(`${BASE}/v1/studio/tracks/t1/exports/suno`, () => {
      reads++;
      return HttpResponse.json(makeSunoExport());
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const first = mount(client);
  await screen.findByDisplayValue('First track');
  first.unmount();
  mount(client);
  await waitFor(() => expect(reads).toBe(2));
  client.clear();
});

it('keeps the shown export after a refetch error', async () => {
  server.use(
    http.get(`${BASE}/v1/studio/tracks/t1/exports/suno`, () =>
      HttpResponse.json(makeSunoExport({ title: 'Still available' })),
    ),
  );
  const { client } = mount();
  expect(await screen.findByDisplayValue('Still available')).toBeTruthy();
  server.use(
    http.get(`${BASE}/v1/studio/tracks/t1/exports/suno`, () =>
      HttpResponse.json(
        { error: 'server_error', message: 'failed', status_code: 500 },
        { status: 500 },
      ),
    ),
  );
  await client.invalidateQueries({ queryKey: studioKeys.sunoExport('t1', {}) });
  expect(
    await screen.findByText('Could not refresh. Your existing content is still available.'),
  ).toBeTruthy();
  expect(screen.getByDisplayValue('Still available')).toBeTruthy();
  client.clear();
});
