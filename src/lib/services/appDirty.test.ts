import { get } from 'svelte/store';
import { afterEach, describe, expect, it } from 'vitest';
import { appIsDirty, appDirtySources, setAppDirty } from './appDirty';

describe('app dirty state', () => {
  const releases: Array<() => void> = [];

  afterEach(() => {
    while (releases.length) releases.pop()?.();
  });

  it('tracks multiple sources independently and releases them safely', () => {
    releases.push(setAppDirty('prompt', true));
    releases.push(setAppDirty('upload', true));
    expect(get(appIsDirty)).toBe(true);
    expect([...get(appDirtySources)]).toEqual(['prompt', 'upload']);

    setAppDirty('prompt', false);
    expect(get(appIsDirty)).toBe(true);

    setAppDirty('upload', false);
    expect(get(appIsDirty)).toBe(false);
  });
});
