import { describe, it, expect, vi, beforeEach } from 'vitest';
import { pullToRefresh, type PullToRefreshOptions } from './pullToRefresh';

type Listener = (e: TouchEvent) => void;

function makeTouch(clientX: number, clientY: number): Touch {
  return { clientX, clientY } as Touch;
}

function makeTouchEvent(touches: Touch[]): TouchEvent {
  return {
    touches,
    preventDefault: vi.fn(),
  } as unknown as TouchEvent;
}

describe('pullToRefresh action', () => {
  let el: HTMLElement;
  let listeners: Record<string, Listener>;
  let removed: string[];
  let onProgress: ReturnType<typeof vi.fn<(px: number, armed: boolean) => void>>;
  let onTrigger: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    el = document.createElement('div');
    Object.defineProperty(el, 'scrollTop', { value: 0, writable: true, configurable: true });

    listeners = {};
    removed = [];
    vi.spyOn(el, 'addEventListener').mockImplementation(((type: string, handler: EventListener) => {
      listeners[type] = handler as Listener;
    }) as typeof el.addEventListener);
    vi.spyOn(el, 'removeEventListener').mockImplementation(((type: string) => {
      removed.push(type);
    }) as typeof el.removeEventListener);

    onProgress = vi.fn<(px: number, armed: boolean) => void>();
    onTrigger = vi.fn<() => void>();
  });

  function attach(options: Partial<PullToRefreshOptions> = {}) {
    return pullToRefresh(el, { onProgress, onTrigger, ...options });
  }

  function fire(type: 'touchstart' | 'touchmove' | 'touchend', e: TouchEvent) {
    listeners[type]?.(e);
  }

  it('engages only when scrollTop is 0 at touchstart', () => {
    el.scrollTop = 20;
    attach();

    fire('touchstart', makeTouchEvent([makeTouch(0, 0)]));
    fire('touchmove', makeTouchEvent([makeTouch(0, 100)]));

    expect(onProgress).not.toHaveBeenCalled();
  });

  it('disengages for the rest of the gesture when horizontal displacement exceeds vertical', () => {
    attach();

    fire('touchstart', makeTouchEvent([makeTouch(0, 0)]));
    // First significant move: mostly horizontal
    fire('touchmove', makeTouchEvent([makeTouch(50, 5)]));
    expect(onProgress).not.toHaveBeenCalled();

    // Subsequent move goes strongly vertical, but intent was already resolved as horizontal
    fire('touchmove', makeTouchEvent([makeTouch(52, 200)]));
    expect(onProgress).not.toHaveBeenCalled();
  });

  it('arms once damped pull distance reaches the threshold', () => {
    attach({ threshold: 72 });

    fire('touchstart', makeTouchEvent([makeTouch(0, 0)]));
    fire('touchmove', makeTouchEvent([makeTouch(0, 10)])); // resolves vertical intent
    onProgress.mockClear();

    // dy = 200 -> damped = 200 * 0.4 = 80 >= 72
    fire('touchmove', makeTouchEvent([makeTouch(0, 200)]));

    expect(onProgress).toHaveBeenCalledWith(80, true);

    fire('touchend', makeTouchEvent([]));
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it('caps damped progress at ~110px', () => {
    attach({ threshold: 72 });

    fire('touchstart', makeTouchEvent([makeTouch(0, 0)]));
    fire('touchmove', makeTouchEvent([makeTouch(0, 10)]));
    onProgress.mockClear();

    // dy = 1000 -> damped = 400, capped to 110
    fire('touchmove', makeTouchEvent([makeTouch(0, 1000)]));

    expect(onProgress).toHaveBeenCalledWith(110, true);
  });

  it('resets to zero on touchend when released below threshold', () => {
    attach({ threshold: 72 });

    fire('touchstart', makeTouchEvent([makeTouch(0, 0)]));
    fire('touchmove', makeTouchEvent([makeTouch(0, 10)]));
    onProgress.mockClear();

    // dy = 20 -> damped = 8, well under threshold
    fire('touchmove', makeTouchEvent([makeTouch(0, 20)]));
    expect(onProgress).toHaveBeenCalledWith(8, false);

    fire('touchend', makeTouchEvent([]));

    expect(onTrigger).not.toHaveBeenCalled();
    expect(onProgress).toHaveBeenLastCalledWith(0, false);
  });

  it('removes all listeners on destroy', () => {
    const action = attach();
    action?.destroy?.();

    expect(removed).toEqual(
      expect.arrayContaining(['touchstart', 'touchmove', 'touchend', 'touchcancel']),
    );
  });
});
