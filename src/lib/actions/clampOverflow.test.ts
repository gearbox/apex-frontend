import { afterEach, describe, expect, it, vi } from 'vitest';
import { clampOverflow } from './clampOverflow';

afterEach(() => vi.unstubAllGlobals());

describe('clampOverflow', () => {
  it('reports clipped content on setup, updates and resize, then disconnects', () => {
    let resize: ResizeObserverCallback | undefined;
    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resize = callback;
        }
        observe = observe;
        disconnect = disconnect;
      },
    );

    let clientHeight = 72;
    let scrollHeight = 96;
    const node = document.createElement('p');
    Object.defineProperties(node, {
      clientHeight: { configurable: true, get: () => clientHeight },
      scrollHeight: { configurable: true, get: () => scrollHeight },
    });
    const onchange = vi.fn();
    const action = clampOverflow(node, onchange);

    expect(observe).toHaveBeenCalledWith(node);
    expect(onchange).toHaveBeenLastCalledWith(true);

    scrollHeight = 72;
    action.update();
    expect(onchange).toHaveBeenLastCalledWith(false);

    scrollHeight = 96;
    resize?.([], {} as ResizeObserver);
    expect(onchange).toHaveBeenLastCalledWith(true);

    clientHeight = 96;
    action.update();
    expect(onchange).toHaveBeenLastCalledWith(false);
    action.destroy();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
