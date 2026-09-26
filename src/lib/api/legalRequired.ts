import { markLegalReacceptanceRequired } from '$lib/stores/legal';

/**
 * Reads a clone, so response parsing remains available to openapi-fetch and callers. A generic
 * 428 is not a legal-state signal: only the contract's error envelope opens the blocking flow.
 */
export async function detectLegalRequired(response: Response): Promise<Response> {
  if (response.status !== 428) return response;

  try {
    const body: unknown = await response.clone().json();
    if (
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      (body as { error?: unknown }).error === 'legal_acceptance_required'
    ) {
      markLegalReacceptanceRequired();
    }
  } catch {
    // A proxy or future endpoint may produce a body we cannot parse. It is not actionable here.
  }

  return response;
}
