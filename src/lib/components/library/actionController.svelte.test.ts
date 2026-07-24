import { describe, it, expect, vi } from 'vitest';
import { createActionController } from './actionController.svelte';

describe('createActionController', () => {
  it('starts with no pending action or group', () => {
    const controller = createActionController();

    expect(controller.isPending('share')).toBe(false);
    expect(controller.isGroupPending('navigate')).toBe(false);
  });

  it('marks the given key and navigation group pending until its handler settles', async () => {
    const controller = createActionController();
    let resolveFn: () => void;
    const fn = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveFn = resolve;
        }),
    );

    const runPromise = controller.run('remix', 'navigate', fn);
    expect(controller.isPending('remix')).toBe(true);
    expect(controller.isGroupPending('navigate')).toBe(true);

    resolveFn!();
    await runPromise;

    expect(controller.isPending('remix')).toBe(false);
    expect(controller.isGroupPending('navigate')).toBe(false);
  });

  it('does not run the same save action twice', async () => {
    const controller = createActionController();
    let resolveSave: () => void;
    const save = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );

    const first = controller.run('share', 'save', save);
    const second = controller.run('share', 'save', save);
    resolveSave!();
    await Promise.all([first, second]);

    expect(save).toHaveBeenCalledTimes(1);
  });

  it('allows a navigation action while a save is pending', async () => {
    const controller = createActionController();
    let resolveSave: () => void;
    const save = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );
    const navigate = vi.fn();

    const savePromise = controller.run('share', 'save', save);
    await controller.run('remix', 'navigate', navigate);
    resolveSave!();
    await savePromise;

    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('keeps Share and Download independent', async () => {
    const controller = createActionController();
    const share = vi.fn();
    const download = vi.fn();

    await Promise.all([
      controller.run('share', 'save', share),
      controller.run('download', 'save', download),
    ]);

    expect(share).toHaveBeenCalledTimes(1);
    expect(download).toHaveBeenCalledTimes(1);
  });

  it('serializes different navigation actions', async () => {
    const controller = createActionController();
    let resolveFirst: () => void;
    const first = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const second = vi.fn();

    const firstRun = controller.run('remix', 'navigate', first);
    const secondRun = controller.run('animate', 'navigate', second);
    resolveFirst!();
    await Promise.all([firstRun, secondRun]);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it('clears pending state when a handler throws', async () => {
    const controller = createActionController();
    const failing = vi.fn().mockRejectedValue(new Error('boom'));

    await expect(controller.run('remix', 'navigate', failing)).rejects.toThrow('boom');

    expect(controller.isPending('remix')).toBe(false);
    expect(controller.isGroupPending('navigate')).toBe(false);
  });
});
