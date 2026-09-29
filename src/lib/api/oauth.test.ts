import { afterEach, describe, expect, it, vi } from 'vitest';
import { oauthAuthorizeUrl, startOAuthSignIn } from './oauth';
import * as oauthReturnTarget from './oauthReturnTarget';

const originalLocation = window.location;

afterEach(() => {
  Object.defineProperty(window, 'location', {
    value: originalLocation,
    writable: true,
    configurable: true,
  });
  vi.restoreAllMocks();
});

describe('oauthAuthorizeUrl', () => {
  it('uses the API authorize endpoint and encodes an approved return path', () => {
    const url = new URL(oauthAuthorizeUrl('google', '/app/gallery?tab=all'));
    expect(url.pathname).toBe('/v1/auth/oauth/google/authorize');
    expect(url.searchParams.get('return_to')).toBe('/app/gallery?tab=all');
  });

  it('omits unsafe return paths before a browser navigation can produce a raw API error', () => {
    const url = new URL(oauthAuthorizeUrl('google', '//evil'));
    expect(url.searchParams.has('return_to')).toBe(false);
  });

  it('T1-b: saves the destination before assigning the Google authorize URL', () => {
    const calls: string[] = [];
    const save = vi.spyOn(oauthReturnTarget, 'save').mockImplementation(() => {
      calls.push('save');
    });
    const assign = vi.fn(() => {
      calls.push('assign');
    });
    Object.defineProperty(window, 'location', {
      value: { assign },
      writable: true,
      configurable: true,
    });

    startOAuthSignIn('google', '/app/library');

    expect(save).toHaveBeenCalledWith('/app/library');
    expect(assign).toHaveBeenCalledWith(expect.stringContaining('/v1/auth/oauth/google/authorize'));
    expect(calls).toEqual(['save', 'assign']);
  });
});
