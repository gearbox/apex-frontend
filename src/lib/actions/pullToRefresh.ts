import type { Action } from 'svelte/action';

export interface PullToRefreshOptions {
  /** Pull distance (post-damping, px) required to arm the gesture. Default 72. */
  threshold?: number;
  onProgress: (px: number, armed: boolean) => void;
  onTrigger: () => void;
}

const DEFAULT_THRESHOLD = 72;
const DAMPING = 0.4;
const MAX_PULL_PX = 110;
const INTENT_DEADZONE_PX = 5;

function startsInModal(event: Event): boolean {
  return event
    .composedPath()
    .some(
      (target) =>
        target instanceof Element &&
        target.getAttribute('role') === 'dialog' &&
        target.getAttribute('aria-modal') === 'true',
    );
}

/**
 * Pull-to-reload gesture for a scroll container. Only engages when the
 * container is already at scrollTop 0, and only once vertical intent is
 * confirmed. Modal interactions are excluded so a drag inside a media viewer
 * cannot reload the page and dismiss the viewer.
 */
export const pullToRefresh: Action<HTMLElement, PullToRefreshOptions> = (node, options) => {
  let opts = options;

  let startX = 0;
  let startY = 0;
  let tracking = false;
  let intentResolved = false;
  let verticalIntent = false;
  let armed = false;

  const reset = () => {
    tracking = false;
    intentResolved = false;
    verticalIntent = false;
    armed = false;
  };

  const onTouchStart = (e: TouchEvent) => {
    if (startsInModal(e) || node.scrollTop > 0) {
      reset();
      return;
    }
    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    tracking = true;
    intentResolved = false;
    verticalIntent = false;
    armed = false;
  };

  const onTouchMove = (e: TouchEvent) => {
    if (!tracking) return;

    const touch = e.touches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;

    if (!intentResolved) {
      if (Math.abs(dx) < INTENT_DEADZONE_PX && Math.abs(dy) < INTENT_DEADZONE_PX) return;
      intentResolved = true;
      verticalIntent = Math.abs(dy) >= Math.abs(dx);
      if (!verticalIntent) return;
    }

    if (!verticalIntent) return;

    if (node.scrollTop > 0 || dy <= 0) {
      armed = false;
      opts.onProgress(0, false);
      return;
    }

    e.preventDefault();
    const damped = Math.min(dy * DAMPING, MAX_PULL_PX);
    armed = damped >= (opts.threshold ?? DEFAULT_THRESHOLD);
    opts.onProgress(damped, armed);
  };

  const onTouchEnd = () => {
    if (!tracking) return;
    if (armed) {
      opts.onTrigger();
    } else {
      opts.onProgress(0, false);
    }
    reset();
  };

  node.addEventListener('touchstart', onTouchStart, { passive: true });
  node.addEventListener('touchmove', onTouchMove, { passive: false });
  node.addEventListener('touchend', onTouchEnd, { passive: true });
  node.addEventListener('touchcancel', onTouchEnd, { passive: true });

  return {
    update(newOptions) {
      opts = newOptions;
    },
    destroy() {
      node.removeEventListener('touchstart', onTouchStart);
      node.removeEventListener('touchmove', onTouchMove);
      node.removeEventListener('touchend', onTouchEnd);
      node.removeEventListener('touchcancel', onTouchEnd);
    },
  };
};
