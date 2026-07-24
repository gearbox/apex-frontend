import { describe, it, expect, vi, beforeEach } from 'vitest';
import { swipeNavigation, type SwipeNavigationOptions } from './swipeNavigation';

type Listener = (e: TouchEvent) => void;

function makeTouch(clientX: number, clientY: number): Touch {
  return { clientX, clientY } as Touch;
}

function makeTouchEvent(
  touches: Touch[],
  changedTouches: Touch[] = touches,
  target: EventTarget = document.createElement('div'),
): TouchEvent {
  return {
    touches,
    changedTouches,
    target,
    preventDefault: vi.fn(),
  } as unknown as TouchEvent;
}

describe('swipeNavigation action', () => {
  let el: HTMLElement;
  let listeners: Record<string, Listener>;
  let removed: string[];
  let onprev: ReturnType<typeof vi.fn<() => void>>;
  let onnext: ReturnType<typeof vi.fn<() => void>>;

  beforeEach(() => {
    el = document.createElement('div');

    listeners = {};
    removed = [];
    vi.spyOn(el, 'addEventListener').mockImplementation(((type: string, handler: EventListener) => {
      listeners[type] = handler as Listener;
    }) as typeof el.addEventListener);
    vi.spyOn(el, 'removeEventListener').mockImplementation(((type: string) => {
      removed.push(type);
    }) as typeof el.removeEventListener);

    onprev = vi.fn<() => void>();
    onnext = vi.fn<() => void>();
  });

  function attach(options: Partial<SwipeNavigationOptions> = {}) {
    return swipeNavigation(el, { onprev, onnext, enabled: true, ...options });
  }

  function fire(type: 'touchstart' | 'touchmove' | 'touchend' | 'touchcancel', e: TouchEvent) {
    listeners[type]?.(e);
  }

  it('fires onnext when a leftward swipe clears the 40px threshold', () => {
    attach();

    fire('touchstart', makeTouchEvent([makeTouch(200, 100)]));
    fire('touchmove', makeTouchEvent([makeTouch(150, 102)]));
    fire('touchend', makeTouchEvent([], [makeTouch(150, 102)]));

    expect(onnext).toHaveBeenCalledTimes(1);
    expect(onprev).not.toHaveBeenCalled();
  });

  it('fires onprev when a rightward swipe clears the 40px threshold', () => {
    attach();

    fire('touchstart', makeTouchEvent([makeTouch(100, 100)]));
    fire('touchmove', makeTouchEvent([makeTouch(150, 98)]));
    fire('touchend', makeTouchEvent([], [makeTouch(150, 98)]));

    expect(onprev).toHaveBeenCalledTimes(1);
    expect(onnext).not.toHaveBeenCalled();
  });

  it('fires nothing when vertical movement dominates the initial 10px', () => {
    attach();

    fire('touchstart', makeTouchEvent([makeTouch(100, 100)]));
    fire('touchmove', makeTouchEvent([makeTouch(102, 150)]));
    fire('touchend', makeTouchEvent([], [makeTouch(102, 300)]));

    expect(onnext).not.toHaveBeenCalled();
    expect(onprev).not.toHaveBeenCalled();
  });

  it('fires nothing when horizontal travel stays under the 40px trigger threshold', () => {
    attach();

    fire('touchstart', makeTouchEvent([makeTouch(100, 100)]));
    fire('touchmove', makeTouchEvent([makeTouch(115, 101)]));
    fire('touchend', makeTouchEvent([], [makeTouch(120, 101)]));

    expect(onnext).not.toHaveBeenCalled();
    expect(onprev).not.toHaveBeenCalled();
  });

  it('is entirely inert when enabled is false', () => {
    attach({ enabled: false });

    fire('touchstart', makeTouchEvent([makeTouch(200, 100)]));
    fire('touchmove', makeTouchEvent([makeTouch(100, 100)]));
    fire('touchend', makeTouchEvent([], [makeTouch(100, 100)]));

    expect(onnext).not.toHaveBeenCalled();
    expect(onprev).not.toHaveBeenCalled();
  });

  it('removes all listeners on destroy', () => {
    const action = attach();
    action?.destroy?.();

    expect(removed).toEqual(
      expect.arrayContaining(['touchstart', 'touchmove', 'touchend', 'touchcancel']),
    );
  });

  it('fires neither callback for a horizontal swipe starting on a [data-swipe-passthrough] descendant', () => {
    attach();
    const passthrough = document.createElement('div');
    passthrough.setAttribute('data-swipe-passthrough', '');
    const range = document.createElement('input');
    passthrough.appendChild(range);

    fire('touchstart', makeTouchEvent([makeTouch(200, 100)], undefined, range));
    fire('touchmove', makeTouchEvent([makeTouch(150, 102)]));
    fire('touchend', makeTouchEvent([], [makeTouch(150, 102)]));

    expect(onnext).not.toHaveBeenCalled();
    expect(onprev).not.toHaveBeenCalled();
  });

  it('fires onnext for a horizontal swipe starting on a <video> element (regression: video no longer blocks swipe)', () => {
    attach();
    const video = document.createElement('video');
    const source = document.createElement('source');
    video.appendChild(source);

    fire('touchstart', makeTouchEvent([makeTouch(200, 100)], undefined, source));
    fire('touchmove', makeTouchEvent([makeTouch(150, 102)]));
    fire('touchend', makeTouchEvent([], [makeTouch(150, 102)]));

    expect(onnext).toHaveBeenCalledTimes(1);
    expect(onprev).not.toHaveBeenCalled();
  });

  it('still fires for the same swipe on a plain child element', () => {
    attach();
    const child = document.createElement('div');

    fire('touchstart', makeTouchEvent([makeTouch(200, 100)], undefined, child));
    fire('touchmove', makeTouchEvent([makeTouch(150, 102)]));
    fire('touchend', makeTouchEvent([], [makeTouch(150, 102)]));

    expect(onnext).toHaveBeenCalledTimes(1);
    expect(onprev).not.toHaveBeenCalled();
  });
});
