import { describe, expect, it } from 'vitest';
import { oauthAuthorizeUrl } from './oauth';

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
});
