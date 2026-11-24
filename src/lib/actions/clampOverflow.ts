/** Reports whether a line-clamped element hides content. Re-checks on resize and content changes. */
export function clampOverflow(node: HTMLElement, onchange: (overflowing: boolean) => void) {
  const check = () => onchange(node.scrollHeight > node.clientHeight + 1);
  const ro = new ResizeObserver(check);
  ro.observe(node);
  check();
  return { update: check, destroy: () => ro.disconnect() };
}
