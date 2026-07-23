import type { Action } from 'svelte/action';

export interface SwipeNavigationOptions {
  onprev?: () => void;
  onnext?: () => void;
  enabled?: boolean;
}

const DIRECTION_LOCK_PX = 10;
const TRIGGER_THRESHOLD_PX = 40;

/**
 * Horizontal swipe-to-navigate gesture, direction-locked like SwipeToDelete: once
 * vertical intent wins the first 10px, the gesture releases to native scroll instead
 * of hijacking it.
 */
export const swipeNavigation: Action<HTMLElement, SwipeNavigationOptions> = (node, options) => {
  let opts = options;

  let startX = 0;
  let startY = 0;
  let tracking = false;
  let intentResolved = false;
  let horizontalIntent = false;

  const reset = () => {
    tracking = false;
    intentResolved = false;
    horizontalIntent = false;
  };

  const onTouchStart = (e: TouchEvent) => {
    if (!opts.enabled || e.touches.length !== 1) {
      reset();
      return;
    }
    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    tracking = true;
    intentResolved = false;
    horizontalIntent = false;
  };

  const onTouchMove = (e: TouchEvent) => {
    if (!tracking || !opts.enabled) return;
    const touch = e.touches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;

    if (!intentResolved) {
      if (Math.abs(dx) < DIRECTION_LOCK_PX && Math.abs(dy) < DIRECTION_LOCK_PX) return;
      intentResolved = true;
      horizontalIntent = Math.abs(dx) > Math.abs(dy);
      if (!horizontalIntent) return;
    }

    if (!horizontalIntent) return;
    e.preventDefault();
  };

  const onTouchEnd = (e: TouchEvent) => {
    if (!tracking || !opts.enabled || !horizontalIntent) {
      reset();
      return;
    }
    const touch = e.changedTouches[0];
    reset();
    if (!touch) return;
    const dx = touch.clientX - startX;
    if (Math.abs(dx) < TRIGGER_THRESHOLD_PX) return;
    if (dx < 0) {
      opts.onnext?.();
    } else {
      opts.onprev?.();
    }
  };

  node.addEventListener('touchstart', onTouchStart, { passive: true });
  node.addEventListener('touchmove', onTouchMove, { passive: false });
  node.addEventListener('touchend', onTouchEnd, { passive: true });
  node.addEventListener('touchcancel', reset, { passive: true });

  return {
    update(newOptions) {
      opts = newOptions;
    },
    destroy() {
      node.removeEventListener('touchstart', onTouchStart);
      node.removeEventListener('touchmove', onTouchMove);
      node.removeEventListener('touchend', onTouchEnd);
      node.removeEventListener('touchcancel', reset);
    },
  };
};
