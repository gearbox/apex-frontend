const COMPACT_NAME_CLASS = 'currency-name--compact';

/**
 * Keeps the fitting decision separate from DOM observation so it can be
 * tested without relying on browser layout.
 */
export function needsCompactCurrencyName({
  scrollHeight,
  clientHeight,
}: Pick<HTMLElement, 'scrollHeight' | 'clientHeight'>): boolean {
  return scrollHeight > clientHeight + 1;
}

/** Applies compact typography only when the normal two-line name area overflows. */
export function fitCurrencyName(node: HTMLElement): { destroy: () => void } {
  let destroyed = false;

  const update = (): void => {
    if (destroyed) return;

    // Always assess the normal type scale. Otherwise a compact name that happens
    // to fit could repeatedly switch back to the larger scale after a resize.
    node.classList.remove(COMPACT_NAME_CLASS);
    node.classList.toggle(COMPACT_NAME_CLASS, needsCompactCurrencyName(node));
  };

  queueMicrotask(update);

  const observer =
    typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => update());
  observer?.observe(node);

  return {
    destroy: () => {
      destroyed = true;
      observer?.disconnect();
    },
  };
}
