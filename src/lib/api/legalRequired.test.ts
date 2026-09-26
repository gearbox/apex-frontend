import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { detectLegalRequired } from '$lib/api/legalRequired';
import { legalReacceptanceRequired, resetLegalState } from '$lib/stores/legal';

beforeEach(() => resetLegalState());

describe('detectLegalRequired()', () => {
  it('marks the blocking flow and leaves the original response readable', async () => {
    const response = new Response(
      JSON.stringify({ error: 'legal_acceptance_required', message: 'Review', status_code: 428 }),
      { status: 428, headers: { 'content-type': 'application/json' } },
    );

    const returned = await detectLegalRequired(response);

    expect(returned).toBe(response);
    expect(get(legalReacceptanceRequired)).toBe(true);
    await expect(returned.json()).resolves.toMatchObject({ error: 'legal_acceptance_required' });
  });

  it('ignores a non-legal or unparsable 428 response', async () => {
    await detectLegalRequired(
      new Response(JSON.stringify({ error: 'different_precondition' }), {
        status: 428,
        headers: { 'content-type': 'application/json' },
      }),
    );
    await detectLegalRequired(new Response('not-json', { status: 428 }));

    expect(get(legalReacceptanceRequired)).toBe(false);
  });
});
