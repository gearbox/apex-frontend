<script lang="ts">
  import { onMount, tick, type Snippet } from 'svelte';

  let {
    id,
    label,
    onclose,
    children,
    tall = false,
  }: {
    id: string;
    label: string;
    onclose: () => void;
    children: Snippet;
    tall?: boolean;
  } = $props();

  let panel = $state<HTMLDivElement>();
  let previousFocus: HTMLElement | null = null;
  let previousBodyOverflow = '';
  let dragOffset = $state(0);
  let isDragging = $state(false);
  let isDismissing = $state(false);
  let activePointerId: number | null = null;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartedAt = 0;
  let dragIntentResolved = false;
  let isHorizontalGesture = false;
  let dismissTimer: ReturnType<typeof setTimeout> | undefined;

  const DRAG_INTENT_PX = 8;
  const DISMISS_DISTANCE_RATIO = 0.2;
  const DISMISS_DISTANCE_MIN_PX = 64;
  const DISMISS_DISTANCE_MAX_PX = 160;
  const FAST_FLICK_MIN_DISTANCE_PX = 28;
  const FAST_FLICK_VELOCITY_PX_PER_MS = 0.65;
  const DISMISS_TRANSITION_MS = 220;

  function releasePointer(target: HTMLElement, pointerId: number) {
    if (target.hasPointerCapture?.(pointerId)) target.releasePointerCapture?.(pointerId);
  }

  function resetDrag(target?: HTMLElement) {
    if (target && activePointerId !== null) releasePointer(target, activePointerId);
    activePointerId = null;
    dragIntentResolved = false;
    isHorizontalGesture = false;
    isDragging = false;
  }

  function snapBack(target?: HTMLElement) {
    resetDrag(target);
    dragOffset = 0;
  }

  function getPanelHeight() {
    return Math.max(panel?.getBoundingClientRect().height ?? 0, 320);
  }

  function getDismissDistance() {
    return Math.min(
      Math.max(getPanelHeight() * DISMISS_DISTANCE_RATIO, DISMISS_DISTANCE_MIN_PX),
      DISMISS_DISTANCE_MAX_PX,
    );
  }

  function clearDismissTimer() {
    if (dismissTimer !== undefined) clearTimeout(dismissTimer);
    dismissTimer = undefined;
  }

  function finishDismissal() {
    if (!isDismissing) return;
    isDismissing = false;
    clearDismissTimer();
    onclose();
  }

  onMount(() => {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    void tick().then(() => panel?.focus());

    return () => {
      clearDismissTimer();
      document.body.style.overflow = previousBodyOverflow;
      previousFocus?.focus();
    };
  });

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') onclose();
  }

  function handleDragStart(event: PointerEvent) {
    if (isDismissing || !event.isPrimary || event.button !== 0) return;

    const target = event.currentTarget as HTMLElement;
    activePointerId = event.pointerId;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    dragStartedAt = performance.now();
    dragIntentResolved = false;
    isHorizontalGesture = false;
    isDragging = false;
    dragOffset = 0;
    target.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function handleDragMove(event: PointerEvent) {
    if (event.pointerId !== activePointerId || isDismissing) return;

    const deltaX = event.clientX - dragStartX;
    const deltaY = event.clientY - dragStartY;

    if (!dragIntentResolved) {
      if (Math.abs(deltaX) < DRAG_INTENT_PX && Math.abs(deltaY) < DRAG_INTENT_PX) return;
      dragIntentResolved = true;
      isHorizontalGesture = Math.abs(deltaX) > Math.abs(deltaY);
    }

    if (isHorizontalGesture) return;

    isDragging = deltaY > 0;
    dragOffset = Math.min(Math.max(deltaY, 0), getPanelHeight());
    event.preventDefault();
  }

  function handleDragEnd(event: PointerEvent) {
    if (event.pointerId !== activePointerId) return;

    const target = event.currentTarget as HTMLElement;
    const downwardDistance = Math.max(event.clientY - dragStartY, 0);
    const elapsedMs = Math.max(performance.now() - dragStartedAt, 1);
    const velocity = downwardDistance / elapsedMs;
    const shouldDismiss =
      dragIntentResolved &&
      !isHorizontalGesture &&
      (downwardDistance >= getDismissDistance() ||
        (downwardDistance >= FAST_FLICK_MIN_DISTANCE_PX &&
          velocity >= FAST_FLICK_VELOCITY_PX_PER_MS));

    resetDrag(target);

    if (!shouldDismiss) {
      dragOffset = 0;
      return;
    }

    isDismissing = true;
    dragOffset = getPanelHeight() + 24;

    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      queueMicrotask(finishDismissal);
      return;
    }

    dismissTimer = setTimeout(finishDismissal, DISMISS_TRANSITION_MS + 80);
  }

  function handleDragCancel(event: PointerEvent) {
    if (event.pointerId !== activePointerId) return;
    snapBack(event.currentTarget as HTMLElement);
  }

  function handlePanelTransitionEnd(event: TransitionEvent) {
    if (event.target === event.currentTarget && isDismissing) finishDismissal();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="sheet-backdrop" onclick={onclose} role="presentation">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="sheet-panel-shell"
    class:dragging={isDragging}
    class:dismissing={isDismissing}
    style:transform={`translateY(${dragOffset}px)`}
    ontransitionend={handlePanelTransitionEnd}
  >
    <div
      bind:this={panel}
      {id}
      class="sheet-panel chrome-no-select"
      class:tall
      onclick={(event) => event.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      tabindex="-1"
    >
      <div
        class="sheet-drag-zone"
        data-testid="mobile-nav-sheet-drag-zone"
        aria-hidden="true"
        onpointerdown={handleDragStart}
        onpointermove={handleDragMove}
        onpointerup={handleDragEnd}
        onpointercancel={handleDragCancel}
      >
        <div class="sheet-handle"></div>
      </div>
      {@render children()}
    </div>
  </div>
</div>

<style>
  @keyframes slideUp {
    from {
      transform: translateY(100%);
    }
    to {
      transform: translateY(0);
    }
  }

  .sheet-backdrop {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }

  .sheet-panel-shell {
    width: 100%;
    max-width: 480px;
    transition: transform 0.22s ease-out;
  }

  .sheet-panel-shell.dragging {
    transition: none;
  }

  .sheet-panel {
    display: flex;
    width: 100%;
    max-height: 85dvh;
    flex-direction: column;
    overflow: hidden;
    border-radius: 20px 20px 0 0;
    background: var(--apex-surface);
    padding: 4px 0 max(16px, env(safe-area-inset-bottom));
    animation: slideUp 0.25s ease-out;
    outline: none;
  }

  .sheet-panel.tall {
    height: min(78dvh, 42rem);
  }

  .sheet-drag-zone {
    display: flex;
    height: 44px;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    touch-action: none;
  }

  .sheet-handle {
    width: 36px;
    height: 4px;
    border-radius: 2px;
    background: var(--apex-border);
  }

  @media (prefers-reduced-motion: reduce) {
    .sheet-panel-shell {
      transition-duration: 1ms;
    }

    .sheet-panel {
      animation-duration: 1ms;
    }
  }
</style>
