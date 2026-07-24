import { vi } from 'vitest';

/**
 * jsdom has no real media pipeline: `play()`/`pause()` throw "not implemented" and
 * `.paused` is a hardcoded read-only getter that never reflects playback state. Components
 * that drive playback imperatively (see VideoStage) rely on the native 'play'/'pause' events
 * flowing back through Svelte's `bind:paused` to resync state, so a plain resolved-promise
 * stub isn't enough — this stub also flips a per-element paused flag and dispatches the
 * matching event, mirroring real browser behaviour closely enough for that resync to fire.
 *
 * Call in `beforeAll`, and call the returned function in `afterAll` to restore the
 * prototype. Individual tests can still layer `.mockRejectedValueOnce(...)` etc. on top via
 * `vi.spyOn(HTMLMediaElement.prototype, 'play')`, which returns this same spy.
 */
export function installMediaElementStubs(): () => void {
  const pausedState = new WeakMap<HTMLMediaElement, boolean>();
  const pausedDescriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'paused');

  Object.defineProperty(HTMLMediaElement.prototype, 'paused', {
    configurable: true,
    get(this: HTMLMediaElement) {
      return pausedState.get(this) ?? true;
    },
  });

  const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    pausedState.set(this, false);
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  });

  const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    pausedState.set(this, true);
    this.dispatchEvent(new Event('pause'));
  });

  return function restoreMediaElementStubs() {
    playSpy.mockRestore();
    pauseSpy.mockRestore();
    if (pausedDescriptor) {
      Object.defineProperty(HTMLMediaElement.prototype, 'paused', pausedDescriptor);
    } else {
      Reflect.deleteProperty(HTMLMediaElement.prototype, 'paused');
    }
  };
}
