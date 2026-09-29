import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  captureOAuthCallbackFragment,
  clearCapturedOAuthFragment,
  getCapturedOAuthFragment,
  parseOAuthFragment,
} from './oauthFragment';

afterEach(() => clearCapturedOAuthFragment());

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

describe('captureOAuthCallbackFragment', () => {
  it('R0-a: captures a callback fragment and strips it while preserving history state', () => {
    const state = { __kit: { index: 2 } };
    const history = { state, replaceState: vi.fn() } as unknown as History;
    const location = {
      pathname: '/auth/callback',
      search: '',
      hash: '#result=login&code=c1',
    } as Location;

    captureOAuthCallbackFragment(location, history);

    expect(getCapturedOAuthFragment()).toEqual({ result: 'login', code: 'c1', returnTo: null });
    expect(history.replaceState).toHaveBeenCalledWith(state, '', '/auth/callback');

    captureOAuthCallbackFragment(
      {
        pathname: '/auth/callback',
        search: '?x=1',
        hash: '#result=signup&ticket=t1',
      } as Location,
      history,
    );
    expect(history.replaceState).toHaveBeenLastCalledWith(state, '', '/auth/callback?x=1');
  });

  it('R0-b: does nothing outside the callback route or without a fragment', () => {
    const history = { state: { prior: true }, replaceState: vi.fn() } as unknown as History;

    captureOAuthCallbackFragment(
      { pathname: '/login', search: '', hash: '#result=login&code=c1' } as Location,
      history,
    );
    captureOAuthCallbackFragment(
      { pathname: '/auth/callback', search: '', hash: '' } as Location,
      history,
    );

    expect(getCapturedOAuthFragment()).toBeNull();
    expect(history.replaceState).not.toHaveBeenCalled();
  });
});
