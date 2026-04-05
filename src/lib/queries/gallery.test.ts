import { describe, it, expect } from 'vitest';
import { galleryKeys } from './gallery';

describe('galleryKeys', () => {
  it('generates stable keys for list', () => {
    expect(galleryKeys.list()).toEqual(['gallery', 'list', {}]);
  });

  it('generates stable keys for detail', () => {
    expect(galleryKeys.detail('job_123')).toEqual(['gallery', 'detail', 'job_123']);
  });

  it('all key is prefix of others', () => {
    const [prefix] = galleryKeys.all;
    expect(galleryKeys.list()[0]).toBe(prefix);
    expect(galleryKeys.detail('x')[0]).toBe(prefix);
  });
});
