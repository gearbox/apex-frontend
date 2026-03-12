import { writable } from 'svelte/store';
import { SESSION_KEYS } from '$lib/utils/constants';
import type { components } from '$lib/api/types';
import { isBrowser } from '$lib/utils/env';

type JobStatus = components['schemas']['JobStatus'];

export interface ActiveJob {
  jobId: string;
  status: JobStatus;
}

function createActiveJobStore() {
  // Rehydrate from sessionStorage on load
  let initial: ActiveJob | null = null;
  if (isBrowser()) {
    try {
      const stored = sessionStorage.getItem(SESSION_KEYS.ACTIVE_JOB);
      if (stored) initial = JSON.parse(stored) as ActiveJob;
    } catch {
      // ignore parse errors
    }
  }

  const { subscribe, set, update } = writable<ActiveJob | null>(initial);

  return {
    subscribe,

    setJob(jobId: string, status: JobStatus) {
      const job: ActiveJob = { jobId, status };
      if (isBrowser()) {
        sessionStorage.setItem(SESSION_KEYS.ACTIVE_JOB, JSON.stringify(job));
      }
      set(job);
    },

    updateStatus(status: JobStatus) {
      update((j) => {
        if (!j) return j;
        const updated = { ...j, status };
        if (isBrowser()) {
          sessionStorage.setItem(SESSION_KEYS.ACTIVE_JOB, JSON.stringify(updated));
        }
        return updated;
      });
    },

    clear() {
      if (isBrowser()) {
        sessionStorage.removeItem(SESSION_KEYS.ACTIVE_JOB);
      }
      set(null);
    },
  };
}

export const activeJobStore = createActiveJobStore();
