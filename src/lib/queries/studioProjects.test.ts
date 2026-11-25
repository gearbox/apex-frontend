import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/svelte-query';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { MOCK_BASE_URL as BASE } from '../../mocks/config';
import {
  createStudioProjectMutationOptions,
  disableStudioProjectMutationOptions,
  renameStudioProjectMutationOptions,
  StudioProjectSetupError,
  updateProjectProfileMutationOptions,
} from './studioProjects';
import { studioKeys } from './studio';
import { renameProjectMutationOptions, deleteProjectMutationOptions } from './library';

const profile = { release_kind: 'single' as const, artist_id: null, concept: null };
describe('Studio projects', () => {
  it('reuses a library project after setup fails', async () => {
    let posts = 0;
    let puts = 0;
    let patches = 0;
    server.use(
      http.post(`${BASE}/v1/library/projects`, () => {
        posts++;
        return HttpResponse.json({ id: 'p1', name: 'First' }, { status: 201 });
      }),
      http.patch(`${BASE}/v1/library/projects/:id`, () => {
        patches++;
        return HttpResponse.json({ id: 'p1', name: 'Renamed' });
      }),
      http.put(`${BASE}/v1/studio/projects/:id`, () => {
        puts++;
        return puts === 1
          ? HttpResponse.json(
              { error: 'failed', message: 'failed', status_code: 500 },
              { status: 500 },
            )
          : HttpResponse.json({
              library_project_id: 'p1',
              name: 'Renamed',
              ...profile,
              track_count: 0,
            });
      }),
    );
    const qc = new QueryClient();
    const options = createStudioProjectMutationOptions(qc);
    let failed: unknown;
    try {
      await options.mutationFn({ name: 'First', profile });
    } catch (error) {
      failed = error;
    }
    expect(failed).toBeInstanceOf(StudioProjectSetupError);
    expect((failed as StudioProjectSetupError).libraryProjectId).toBe('p1');
    await options.mutationFn({
      name: 'Renamed',
      previousName: 'First',
      existingLibraryProjectId: 'p1',
      profile,
    });
    expect({ posts, puts, patches }).toEqual({ posts: 1, puts: 2, patches: 1 });
    qc.clear();
  });
  it('invalidates Studio when the library renames or deletes a project', async () => {
    const qc = new QueryClient();
    qc.setQueryData(studioKeys.projects(), []);
    qc.setQueryData(studioKeys.project('p1'), {});
    renameProjectMutationOptions(qc).onSuccess(
      { id: 'p1', name: 'x', created_at: '', updated_at: '' },
      { projectId: 'p1' },
    );
    expect(qc.getQueryState(studioKeys.projects())?.isInvalidated).toBe(true);
    expect(qc.getQueryState(studioKeys.project('p1'))?.isInvalidated).toBe(true);
    qc.setQueryData(studioKeys.projects(), []);
    qc.setQueryData(studioKeys.project('p1'), {});
    deleteProjectMutationOptions(qc).onSuccess(undefined, 'p1');
    expect(qc.getQueryState(studioKeys.projects())?.isInvalidated).toBe(true);
    expect(qc.getQueryState(studioKeys.project('p1'))?.isInvalidated).toBe(true);
    qc.clear();
  });

  it('project mutations share a scope and run in submission order', async () => {
    let releaseFirst!: () => void;
    let firstStarted!: () => void;
    const firstGate = new Promise<void>((resolve) => (releaseFirst = resolve));
    const requested = new Promise<void>((resolve) => (firstStarted = resolve));
    const started: string[] = [];
    let serverName = 'Original';
    server.use(
      http.patch(`${BASE}/v1/library/projects/p`, async ({ request }) => {
        const body = (await request.json()) as { name: string };
        started.push(body.name);
        if (body.name === 'B') {
          firstStarted();
          await firstGate;
        }
        serverName = body.name;
        return HttpResponse.json({ id: 'p', name: serverName });
      }),
    );
    const qc = new QueryClient();
    const options = renameStudioProjectMutationOptions(qc, 'p');
    expect(options.scope?.id).toBe('studio.project.p');
    expect(updateProjectProfileMutationOptions(qc, 'p').scope?.id).toBe('studio.project.p');
    expect(disableStudioProjectMutationOptions(qc, 'p').scope?.id).toBe('studio.project.p');
    const first = qc.getMutationCache().build(qc, options).execute({ name: 'B' });
    await requested;
    const second = qc.getMutationCache().build(qc, options).execute({ name: 'C' });
    await Promise.resolve();
    expect(started).toEqual(['B']);
    releaseFirst();
    await Promise.all([first, second]);
    expect(started).toEqual(['B', 'C']);
    expect(serverName).toBe('C');
    qc.clear();
  });

  it('project mutation inputs cannot override the project id captured by each factory', () => {
    const qc = new QueryClient();
    const rename = renameStudioProjectMutationOptions(qc, 'p');
    const update = updateProjectProfileMutationOptions(qc, 'p');
    const disable = disableStudioProjectMutationOptions(qc, 'p');

    const invalidInputs = () => {
      // @ts-expect-error The project id is captured by the factory.
      void rename.mutationFn({ id: 'other', name: 'Renamed' });
      // @ts-expect-error The project id is captured by the factory.
      void update.mutationFn({ id: 'other', profile });
      // @ts-expect-error Disable mutations take no project id variable.
      void disable.mutationFn('other');
    };
    void invalidInputs;
    qc.clear();
  });
});
