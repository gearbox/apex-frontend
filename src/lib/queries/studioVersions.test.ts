import { afterEach, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/svelte-query';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../mocks/config';
import { makeSunoImportResult, makeVersionSummary } from '../../mocks/factories/studio';
import { studioKeys, studioScopes } from './studio';
import {
  deleteVersionMutationOptions,
  setCurrentMutationOptions,
  sunoExportQueryOptions,
  sunoImportPreview,
  sunoImportMutationOptions,
} from './studioVersions';

afterEach(() => vi.restoreAllMocks());

it('keys exports by the exact plan and lyrics pair', () => {
  const current = sunoExportQueryOptions('t1');
  const plan = sunoExportQueryOptions('t1', { plan: 'p1' });
  const pair = sunoExportQueryOptions('t1', { plan: 'p1', lyrics: 'l1' });
  expect(current.queryKey).toEqual(studioKeys.sunoExport('t1', {}));
  expect(
    new Set([
      JSON.stringify(current.queryKey),
      JSON.stringify(plan.queryKey),
      JSON.stringify(pair.queryKey),
    ]).size,
  ).toBe(3);
});

it('runs the dry import preview without a cache write or document-write scope', async () => {
  const qc = new QueryClient();
  server.use(
    http.post(`${BASE}/v1/studio/tracks/t1/imports/suno`, async ({ request }) => {
      expect(await request.json()).toMatchObject({ dry_run: true });
      return HttpResponse.json(makeSunoImportResult());
    }),
  );
  const result = await sunoImportPreview('t1', { style: '', exclude: '', lyrics: '' });
  expect(result.dry_run).toBe(true);
  expect(qc.getQueryCache().getAll()).toHaveLength(0);
  expect(sunoImportMutationOptions(qc, 'p1', 't1').scope?.id).toBe(studioScopes.track('t1'));
  qc.clear();
});

it('serializes current-pair and delete writes on a track scope', async () => {
  let releaseFirst!: () => void;
  let startedFirst!: () => void;
  const gate = new Promise<void>((resolve) => (releaseFirst = resolve));
  const requested = new Promise<void>((resolve) => (startedFirst = resolve));
  const order: string[] = [];
  server.use(
    http.put(`${BASE}/v1/studio/tracks/t1/current`, async () => {
      order.push('current');
      startedFirst();
      await gate;
      return HttpResponse.json({});
    }),
    http.delete(`${BASE}/v1/studio/versions/v1`, () => {
      order.push('delete');
      return new HttpResponse(null, { status: 204 });
    }),
  );
  const qc = new QueryClient();
  const current = qc
    .getMutationCache()
    .build(qc, setCurrentMutationOptions(qc, 'p1', 't1'))
    .execute({ plan: 'plan1' });
  await requested;
  const remove = qc
    .getMutationCache()
    .build(qc, deleteVersionMutationOptions(qc, 'p1', 't1'))
    .execute({ id: 'v1' });
  await Promise.resolve();
  expect(order).toEqual(['current']);
  releaseFirst();
  await Promise.all([current, remove]);
  expect(order).toEqual(['current', 'delete']);
  qc.clear();
});

it('reconciles a burst only after the final track-document write settles', async () => {
  let releaseFirst!: () => void;
  let startedFirst!: () => void;
  const gate = new Promise<void>((resolve) => (releaseFirst = resolve));
  const requested = new Promise<void>((resolve) => (startedFirst = resolve));
  server.use(
    http.put(`${BASE}/v1/studio/tracks/t1/current`, async () => {
      startedFirst();
      await gate;
      return HttpResponse.json({});
    }),
  );
  const qc = new QueryClient();
  const invalidate = vi.spyOn(qc, 'invalidateQueries').mockResolvedValue(undefined);
  const options = setCurrentMutationOptions(qc, 'p1', 't1');
  const first = qc.getMutationCache().build(qc, options).execute({ plan: 'plan1' });
  await requested;
  const second = qc.getMutationCache().build(qc, options).execute({ plan: 'plan2' });
  releaseFirst();
  await Promise.all([first, second]);
  expect(invalidate.mock.calls.map(([filter]) => filter?.queryKey)).toEqual([
    studioKeys.track('t1'),
    studioKeys.versions('t1', 'plan'),
    studioKeys.versions('t1', 'lyrics'),
    studioKeys.tracks('p1'),
    [...studioKeys.track('t1'), 'suno-export'],
  ]);
  qc.clear();
});

it('sends null for lyrics only when explicitly requested', async () => {
  const bodies: unknown[] = [];
  server.use(
    http.put(`${BASE}/v1/studio/tracks/t1/current`, async ({ request }) => {
      bodies.push(await request.json());
      return HttpResponse.json({});
    }),
  );
  const qc = new QueryClient();
  const options = setCurrentMutationOptions(qc, 'p1', 't1');
  await options.mutationFn({ plan: 'plan1' });
  await options.mutationFn({ lyrics: null });
  expect(bodies).toEqual([{ plan_version_id: 'plan1' }, { lyrics_version_id: null }]);
  qc.clear();
});

it('removes a deleted version from every cached page without replacing pages', () => {
  const qc = new QueryClient();
  const key = studioKeys.versions('t1', 'plan');
  const kept = makeVersionSummary({ id: 'kept' });
  const deleted = makeVersionSummary({ id: 'deleted' });
  const original = {
    pages: [
      { items: [deleted], limit: 30, has_more: true, next_cursor: 'next' },
      { items: [kept], limit: 30, has_more: false, next_cursor: null },
    ],
    pageParams: [null, 'next'],
  };
  qc.setQueryData(key, original);
  const options = deleteVersionMutationOptions(qc, 'p1', 't1');
  options.onSuccess(undefined, { id: 'deleted' });
  expect(qc.getQueryData(key)).toEqual({
    ...original,
    pages: [
      { ...original.pages[0], items: [] },
      { ...original.pages[1], items: [kept] },
    ],
  });
  qc.clear();
});
