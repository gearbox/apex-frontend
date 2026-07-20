import { beforeEach, describe, expect, it, vi } from 'vitest';

const { postMock, getMock } = vi.hoisted(() => ({
  postMock: vi.fn(),
  getMock: vi.fn(),
}));

vi.mock('$lib/api/client', () => ({
  default: { POST: postMock, GET: getMock },
}));

import { activeProject } from '$lib/stores/activeProject.svelte';
import {
  inheritProjectForCompletedJob,
  inheritProjectForUpload,
  trackProjectForJob,
} from './projectInheritance';

describe('project inheritance helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activeProject.reset();
    postMock.mockResolvedValue({ data: {}, error: undefined });
  });

  it('assigns an uploaded asset with one set_project bulk call', async () => {
    activeProject.set('project-1');

    await inheritProjectForUpload('upload-42');

    expect(postMock).toHaveBeenCalledWith('/v1/library/assets/bulk', {
      body: { type: 'set_project', project_id: 'project-1', asset_refs: ['upload:upload-42'] },
    });
  });

  it('tracks a job under its starting project and assigns its completed outputs', async () => {
    activeProject.set('project-1');
    trackProjectForJob('job-1');
    activeProject.set('project-2');

    await inheritProjectForCompletedJob({
      id: 'job-1',
      outputs: [{ id: 'out-1' }, { id: 'out-2' }],
    } as never);

    expect(postMock).toHaveBeenCalledWith('/v1/library/assets/bulk', {
      body: {
        type: 'set_project',
        project_id: 'project-1',
        asset_refs: ['output:out-1', 'output:out-2'],
      },
    });
  });
});
