import { describe, expect, it } from 'vitest';
import apiClient from '$lib/api/client';

describe('Library and Studio project mocks', () => {
  it('keeps multiple projects, renames them across APIs, and keeps Library after Studio removal', async () => {
    const first = await apiClient.POST('/v1/library/projects', { body: { name: 'One' } });
    const second = await apiClient.POST('/v1/library/projects', { body: { name: 'Two' } });
    const id1 = (first.data as { id: string }).id;
    const id2 = (second.data as { id: string }).id;
    expect(id1).not.toBe(id2);
    await apiClient.PUT('/v1/studio/projects/{project_id}', {
      params: { path: { project_id: id1 } },
      body: { release_kind: 'single', artist_id: null, concept: null },
    });
    await apiClient.PATCH('/v1/library/projects/{project_id}', {
      params: { path: { project_id: id1 } },
      body: { name: 'Renamed' },
    });
    const profile = await apiClient.GET('/v1/studio/projects/{project_id}', {
      params: { path: { project_id: id1 } },
    });
    expect(profile.data?.name).toBe('Renamed');
    await apiClient.DELETE('/v1/studio/projects/{project_id}', {
      params: { path: { project_id: id1 } },
    });
    const library = await apiClient.GET('/v1/library/projects/{project_id}', {
      params: { path: { project_id: id1 } },
    });
    expect(library.data?.name).toBe('Renamed');
  });
  it('blocks Library deletion while Studio tracks exist', async () => {
    const created = await apiClient.POST('/v1/library/projects', { body: { name: 'A release' } });
    const id = (created.data as { id: string }).id;
    await apiClient.PUT('/v1/studio/projects/{project_id}', {
      params: { path: { project_id: id } },
      body: { release_kind: 'single', artist_id: null, concept: null },
    });
    await apiClient.POST('/v1/studio/projects/{project_id}/tracks', {
      params: { path: { project_id: id } },
      body: { title: 'Song' },
    });
    const deletion = await apiClient.DELETE('/v1/library/projects/{project_id}', {
      params: { path: { project_id: id } },
    });
    expect(deletion.response.status).toBe(409);
    expect(deletion.error).toMatchObject({
      error: 'project_in_use',
      detail: { blockers: [{ code: 'studio_tracks', count: 1 }] },
    });
  });
});
