import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/svelte-query';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../mocks/config';
import type { components } from '$lib/api/types';
import { studioKeys } from './studio';
import { reorderTracksMutationOptions } from './studioTracks';
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
    const options = reorderTracksMutationOptions(qc);
    const vars = { projectId: 'p', trackIds: ['a', 'c', 'b'] };
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
});
