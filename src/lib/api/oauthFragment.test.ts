import { describe, expect, it } from 'vitest';
import { parseOAuthFragment } from './oauthFragment';

describe('parseOAuthFragment', () => {
  it('parses login and sanitizes its return path', () => {
    expect(parseOAuthFragment('#result=login&code=opaque&return_to=%2Fapp%2Fgallery')).toEqual({
      result: 'login',
      code: 'opaque',
      returnTo: '/app/gallery',
    });
    expect(parseOAuthFragment('#result=login&code=opaque&return_to=%2F%2Fevil')).toEqual({
      result: 'login',
      code: 'opaque',
      returnTo: null,
    });
  });

  it('parses a signup ticket and known error codes', () => {
    expect(parseOAuthFragment('#result=signup&ticket=opaque')).toEqual({
      result: 'signup',
      ticket: 'opaque',
      returnTo: null,
    });
    expect(parseOAuthFragment('#result=error&error=flow_expired')).toEqual({
      result: 'error',
      error: 'flow_expired',
    });
  });

  it.each([
    '',
    '#result=unknown',
    '#result=login',
    '#result=signup',
    '#result=error&error=unknown',
  ])('rejects malformed fragment %s', (hash) => {
    expect(parseOAuthFragment(hash)).toEqual({ result: 'invalid' });
  });
});
