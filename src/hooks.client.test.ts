import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/api/oauthFragment', () => ({
  captureOAuthCallbackFragment: vi.fn(),
}));

import { captureOAuthCallbackFragment } from '$lib/api/oauthFragment';
import { init } from './hooks.client';

describe('client init', () => {
  it('R0-c: captures the OAuth callback fragment before routing starts', () => {
    init();
    expect(captureOAuthCallbackFragment).toHaveBeenCalledOnce();
  });
});
