import { describe, it, expect } from 'vitest';
import { storageKeys } from './storage';

describe('storageKeys', () => {
  it('generates stable keys for uploads', () => {
    expect(storageKeys.uploads()).toEqual(['storage', 'uploads', {}]);
  });

  it('all key is prefix of others', () => {
    const [prefix] = storageKeys.all;
    expect(storageKeys.uploads()[0]).toBe(prefix);
  });
});
