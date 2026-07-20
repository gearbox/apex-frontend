import apiClient from '$lib/api/client';
import { activeProject } from '$lib/stores/activeProject.svelte';
import type { components } from '$lib/api/types';

type UnifiedJobResponse = components['schemas']['UnifiedJobResponse'];

/** Best-effort project assignment shared by Library uploads and Create completions. */
export async function setProjectForAssets(
  projectId: string | null,
  assetRefs: string[],
): Promise<void> {
  if (!projectId || assetRefs.length === 0) return;
  const { error } = await apiClient.POST('/v1/library/assets/bulk', {
    body: { type: 'set_project', project_id: projectId, asset_refs: assetRefs },
  });
  if (error) throw error;
}

export async function inheritProjectForUpload(
  uploadId: string,
  projectId = activeProject.id,
): Promise<void> {
  await setProjectForAssets(projectId, [`upload:${uploadId}`]);
}

export function trackProjectForJob(jobId: string, projectId = activeProject.id): void {
  activeProject.trackJob(jobId, projectId);
}

export async function inheritProjectForCompletedJob(job: UnifiedJobResponse): Promise<void> {
  const projectId = activeProject.takeJobProject(job.id);
  const assetRefs = (job.outputs ?? []).map((output) => `output:${output.id}`);
  await setProjectForAssets(projectId, assetRefs);
}

/** SSE only carries status, so resolve outputs once the tracked job is terminal. */
export async function inheritProjectForCompletedJobId(jobId: string): Promise<void> {
  const projectId = activeProject.takeJobProject(jobId);
  if (!projectId) return;
  const { data, error } = await apiClient.GET('/v1/jobs/{job_id}', {
    params: { path: { job_id: jobId } },
  });
  if (error || !data) return;
  const assetRefs = ((data as UnifiedJobResponse).outputs ?? []).map(
    (output) => `output:${output.id}`,
  );
  await setProjectForAssets(projectId, assetRefs);
}
