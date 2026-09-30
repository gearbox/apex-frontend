import { API_BASE_URL } from '$lib/utils/constants';
import { APP_VERSION, BUILD_SHA } from '$lib/utils/appVersion';

export const FEEDBACK_MESSAGE_MIN_CODE_POINTS = 10;
export const FEEDBACK_MESSAGE_MAX_CODE_POINTS = 4000;

export type FeedbackMessageValidity = 'valid' | 'too_short' | 'too_long' | 'contains_nul';

export interface FeedbackMessageValidation {
  trimmed: string;
  codePointCount: number;
  validity: FeedbackMessageValidity;
}

/**
 * Mirrors only the feedback message checks that make the form easier to use. The API remains
 * authoritative, in particular because it trims before applying its Unicode code-point limits.
 */
export function validateFeedbackMessage(value: string): FeedbackMessageValidation {
  const trimmed = value.trim();
  const codePointCount = [...trimmed].length;
  const validity: FeedbackMessageValidity = value.includes('\u0000')
    ? 'contains_nul'
    : codePointCount < FEEDBACK_MESSAGE_MIN_CODE_POINTS
      ? 'too_short'
      : codePointCount > FEEDBACK_MESSAGE_MAX_CODE_POINTS
        ? 'too_long'
        : 'valid';

  return { trimmed, codePointCount, validity };
}

export function feedbackAppVersion(): string {
  // Both build constants are deployment metadata rather than user-supplied input. Keep the wire
  // value compact and obey the backend's 64-character maximum even for unusually long dev SHAs.
  return `${APP_VERSION}+${BUILD_SHA}`.slice(0, 64);
}

const FEEDBACK_ASSET_PATH =
  /^\/v1\/content\/feedback\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves only the admin-only feedback proxy path. Do not reuse normal owner content helpers:
 * an admin must never turn another user's asset reference into an owner-scoped content URL.
 */
export function resolveFeedbackAssetUrl(assetUrl: string | null | undefined): string | null {
  if (!assetUrl || !FEEDBACK_ASSET_PATH.test(assetUrl)) return null;
  try {
    return new URL(assetUrl, API_BASE_URL).toString();
  } catch {
    return null;
  }
}
