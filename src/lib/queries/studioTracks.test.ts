import { describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryObserver } from '@tanstack/svelte-query';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../mocks/config';
import type { components } from '$lib/api/types';
import { studioKeys } from './studio';
import {
  applyOrder,
  createTrackMutationOptions,
  renameTrackMutationOptions,
  deleteTrackMutationOptions,
  reorderTracksMutationOptions,
  studioMutationKeys,
  tracksQueryOptions,
} from './studioTracks';
type Track = components['schemas']['TrackOut'];
const track = (id: string): Track => ({
  id,
  library_project_id: 'p',
  title: id,
  position: 0,
  current_plan_version_id: null,
  current_lyrics_version_id: null,
  created_at: '',
  updated_at: '',
});
describe('track reorder', () => {
  it('sends the full order and restores the snapshot on a mismatch', async () => {
    let sent: unknown;
    server.use(
      http.put(`${BASE}/v1/studio/projects/:id/tracks/order`, async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(
          { error: 'track_order_mismatch', message: 'changed', status_code: 422 },
          { status: 422 },
        );
      }),
    );
    const qc = new QueryClient();
    const before = [track('a'), track('b'), track('c')];
    qc.setQueryData(studioKeys.tracks('p'), before);
    const options = reorderTracksMutationOptions(qc, 'p');
    const vars = { trackIds: ['a', 'c', 'b'] };
    const context = await options.onMutate(vars);
    expect(qc.getQueryData<Track[]>(studioKeys.tracks('p'))?.map((item) => item.id)).toEqual(
      vars.trackIds,
    );
    let failure: unknown;
    try {
      await options.mutationFn(vars);
    } catch (error) {
      failure = error;
    }
    expect(sent).toEqual({ track_ids: vars.trackIds });
    expect(failure).toMatchObject({ error: 'track_order_mismatch' });
    options.onError(failure, vars, context);
    expect(qc.getQueryData(studioKeys.tracks('p'))).toEqual(before);
    qc.clear();
  });

  it('applyOrder keeps unknown ids at the end and drops nothing', () => {
    const current = [track('a'), track('b'), track('c')];
    expect(applyOrder(current, ['c', 'missing', 'a']).map((item) => item.id)).toEqual([
      'c',
      'a',
      'b',
    ]);
  });

  it('list mutations share a scope and run in submission order', async () => {
    let releaseFirst!: () => void;
    let firstStarted!: () => void;
    const firstGate = new Promise<void>((resolve) => (releaseFirst = resolve));
    const requested = new Promise<void>((resolve) => (firstStarted = resolve));
    const started: string[] = [];
    let serverTitle = 'Original';
    server.use(
      http.patch(`${BASE}/v1/studio/tracks/a`, async ({ request }) => {
        const body = (await request.json()) as { title: string };
        started.push(body.title);
        if (body.title === 'First') {
          firstStarted();
          await firstGate;
        }
        serverTitle = body.title;
        return HttpResponse.json({ ...track('a'), title: serverTitle });
      }),
    );
    const qc = new QueryClient();
    const options = renameTrackMutationOptions(qc, 'p');
    expect(options.mutationKey).toEqual(studioMutationKeys.tracks('p'));
    expect(options.scope?.id).toBe('studio.tracks.p');
    const first = qc.getMutationCache().build(qc, options).execute({ id: 'a', title: 'First' });
    await requested;
    const second = qc.getMutationCache().build(qc, options).execute({ id: 'a', title: 'Second' });
    await Promise.resolve();
    expect(started).toEqual(['First']);
    releaseFirst();
    await Promise.all([first, second]);
    expect(started).toEqual(['First', 'Second']);
    expect(serverTitle).toBe('Second');
    qc.clear();
  });

  it('the list is reconciled once after the last list mutation settles', async () => {
    let releaseReorder!: () => void;
    let reorderStarted!: () => void;
    const reorderGate = new Promise<void>((resolve) => (releaseReorder = resolve));
    const requested = new Promise<void>((resolve) => (reorderStarted = resolve));
    let reads = 0;
    let serverTracks = [track('a'), track('b')];
    serverTracks[1] = { ...serverTracks[1], position: 1 };
    let posts = 0;
    server.use(
      http.get(`${BASE}/v1/studio/projects/p/tracks`, () => {
        reads++;
        return HttpResponse.json(serverTracks);
      }),
      http.put(`${BASE}/v1/studio/projects/p/tracks/order`, async ({ request }) => {
        const body = (await request.json()) as { track_ids: string[] };
        serverTracks = applyOrder(serverTracks, body.track_ids);
        serverTracks = serverTracks.map((item, position) => ({ ...item, position }));
        reorderStarted();
        await reorderGate;
        return HttpResponse.json(serverTracks);
      }),
      http.post(`${BASE}/v1/studio/projects/p/tracks`, async ({ request }) => {
        posts++;
        const body = (await request.json()) as { title: string };
        const created = { ...track('c'), title: body.title, position: 2 };
        serverTracks = [...serverTracks, created];
        return HttpResponse.json(created, { status: 201 });
      }),
    );
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const observer = new QueryObserver(qc, tracksQueryOptions('p'));
    const unsubscribe = observer.subscribe(() => {});
    await observer.refetch();
    const reorder = qc
      .getMutationCache()
      .build(qc, reorderTracksMutationOptions(qc, 'p'))
      .execute({ trackIds: ['b', 'a'] });
    await requested;
    const create = qc
      .getMutationCache()
      .build(qc, createTrackMutationOptions(qc, 'p'))
      .execute({ title: 'Gamma' });
    await Promise.resolve();
    expect(posts).toBe(0);
    releaseReorder();
    await Promise.all([reorder, create]);
    await vi.waitFor(() => expect(reads).toBe(2));
    expect(qc.getQueryData<Track[]>(studioKeys.tracks('p'))?.map((item) => item.id)).toEqual([
      'b',
      'a',
      'c',
    ]);
    expect(reads).toBe(2);
    unsubscribe();
    qc.clear();
  });

  it('track mutation inputs cannot override the project id captured by each factory', () => {
    const qc = new QueryClient();
    const create = createTrackMutationOptions(qc, 'p');
    const rename = renameTrackMutationOptions(qc, 'p');
    const remove = deleteTrackMutationOptions(qc, 'p');
    const reorder = reorderTracksMutationOptions(qc, 'p');

    const invalidInputs = () => {
      // @ts-expect-error The project id is captured by the factory.
      void create.mutationFn({ projectId: 'other', title: 'Track' });
      // @ts-expect-error The project id is captured by the factory.
      void rename.mutationFn({ projectId: 'other', id: 'track', title: 'Track' });
      // @ts-expect-error The project id is captured by the factory.
      void remove.mutationFn({ projectId: 'other', id: 'track' });
      // @ts-expect-error The project id is captured by the factory.
      void reorder.mutationFn({ projectId: 'other', trackIds: [] });
    };
    void invalidInputs;
    qc.clear();
  });
});
