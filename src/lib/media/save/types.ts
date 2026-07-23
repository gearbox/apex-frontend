import type { components } from '$lib/api/types';

export type MediaObject = components['schemas']['MediaObject'];

/** Frontend-only pseudo-actions layered on top of the backend `LibraryAction` enum. */
export type SaveCapability = 'share' | 'download';

export type SaveOutcome = 'shared' | 'downloaded' | 'cancelled';

/** Share failed because transient user activation expired; retrying will succeed. */
export class SaveActivationError extends Error {
  readonly name = 'SaveActivationError';

  constructor() {
    super('Share requires a fresh tap — user activation expired while fetching the asset.');
  }
}

export type SaveFailedReason = 'network' | 'auth' | 'not-found' | 'too-large' | 'unsupported';

/** The asset could not be retrieved or written. */
export class SaveFailedError extends Error {
  readonly name = 'SaveFailedError';

  constructor(readonly reason: SaveFailedReason) {
    super(`Save failed: ${reason}`);
  }
}

/** Injectable collaborators so every step of the save flow is testable without real browser APIs. */
export interface SaveMediaDeps {
  fetchBlob: (media: MediaObject, signal?: AbortSignal) => Promise<Blob>;
  share: (file: File) => Promise<SaveOutcome>;
  download: (blob: Blob, filename: string) => SaveOutcome;
  now: () => number;
}
