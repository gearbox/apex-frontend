import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as oauthReturnTarget from './oauthReturnTarget';

const STORAGE_KEY = 'apex:oauth:return-to';

describe('OAuth return target storage', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('T1-a: round-trips a safe path, rejects tampered storage, and removes a null target', () => {
    oauthReturnTarget.save('/app/library?tab=all');
    expect(oauthReturnTarget.load()).toBe('/app/library?tab=all');

    sessionStorage.setItem(STORAGE_KEY, '//evil.example');
    expect(oauthReturnTarget.load()).toBeNull();

    oauthReturnTarget.save(null);
    expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('T1-a: treats unavailable storage as a missing target without throwing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });

    expect(oauthReturnTarget.load()).toBeNull();
  });
});
