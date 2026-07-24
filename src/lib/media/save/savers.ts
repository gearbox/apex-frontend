import { SaveActivationError, SaveFailedError } from './types';
import type { SaveOutcome } from './types';

/** Opens the native share sheet. WebKit requires this to run within ~5s of user activation. */
export async function shareFile(file: File): Promise<SaveOutcome> {
  try {
    await navigator.share({ files: [file] });
    return 'shared';
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      throw new SaveActivationError();
    }
    throw new SaveFailedError('unsupported');
  }
}

/** Triggers a browser download. The object URL is revoked after a delay so the transfer can't be aborted mid-flight. */
export function downloadBlob(blob: Blob, filename: string): SaveOutcome {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'downloaded';
}
