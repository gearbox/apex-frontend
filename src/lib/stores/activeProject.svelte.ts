/**
 * A lightweight cross-route hand-off. The Library URL remains authoritative; this only
 * preserves the currently selected project while a create/upload operation is in flight.
 */
class ActiveProjectState {
  id = $state<string | null>(null);
  #startedJobs = new Map<string, string>();

  set(projectId: string | null): void {
    this.id = projectId;
  }

  trackJob(jobId: string, projectId = this.id): void {
    if (projectId) this.#startedJobs.set(jobId, projectId);
  }

  takeJobProject(jobId: string): string | null {
    const projectId = this.#startedJobs.get(jobId) ?? null;
    this.#startedJobs.delete(jobId);
    return projectId;
  }

  reset(): void {
    this.id = null;
    this.#startedJobs.clear();
  }
}

export const activeProject = new ActiveProjectState();
