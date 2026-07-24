import { describe, it, expect, vi } from 'vitest';
import { createActionController } from './actionController.svelte';

describe('createActionController', () => {
  it('starts with nothing pending', () => {
    const controller = createActionController();
    expect(controller.pending).toBe(false);
    expect(controller.isPending('remix')).toBe(false);
  });

  it('marks the given key pending while its handler runs, and clears it after', async () => {
    const controller = createActionController();
    let resolveFn: () => void;
    const fn = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveFn = resolve;
        }),
    );

    const runPromise = controller.run('remix', fn);
    expect(controller.pending).toBe(true);
    expect(controller.isPending('remix')).toBe(true);
    expect(controller.isPending('animate')).toBe(false);

    resolveFn!();
    await runPromise;

    expect(controller.pending).toBe(false);
    expect(controller.isPending('remix')).toBe(false);
  });

  it('is a no-op for a second run() call while one is already pending', async () => {
    const controller = createActionController();
    let resolveFirst: () => void;
    const first = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const second = vi.fn();

    const firstRun = controller.run('remix', first);
    const secondRun = controller.run('animate', second);

    resolveFirst!();
    await Promise.all([firstRun, secondRun]);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it('clears runningKey even when the handler throws, and propagates the error', async () => {
    const controller = createActionController();
    const failing = vi.fn().mockRejectedValue(new Error('boom'));

    await expect(controller.run('remix', failing)).rejects.toThrow('boom');

    expect(controller.pending).toBe(false);
    expect(controller.isPending('remix')).toBe(false);
  });

  it('supports synchronous (non-Promise-returning) handlers', async () => {
    const controller = createActionController();
    const fn = vi.fn();

    await controller.run('favorite', fn);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(controller.pending).toBe(false);
  });

  it('allows a new run once the previous one has settled', async () => {
    const controller = createActionController();
    const first = vi.fn();
    const second = vi.fn();

    await controller.run('remix', first);
    await controller.run('animate', second);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });
});
