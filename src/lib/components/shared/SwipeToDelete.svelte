<script lang="ts">
  import { isDesktop } from '$lib/utils/breakpoints';
  import { Trash2 } from 'lucide-svelte';
  import * as m from '$paraglide/messages';
  import type { Snippet } from 'svelte';

  interface Props {
    ondelete: () => void;
    disabled?: boolean;
    children: Snippet;
  }

  let { ondelete, disabled = false, children }: Props = $props();

  // Module-level singleton: only one card open at a time
  let activeSwipeId = $state<string | null>(null);

  const instanceId = crypto.randomUUID();

  let translateX = $state(0);
  let isDragging = $state(false);
  let startX = 0;
  let startY = 0;
  let isScrolling: boolean | null = null; // null = undecided, true/false = decided

  const REVEAL_WIDTH = 80;
  const SNAP_THRESHOLD = 60;
  const OVERSWIPE_THRESHOLD = 120;

  const isOpen = $derived(activeSwipeId === instanceId);

  function snapOpen() {
    translateX = -REVEAL_WIDTH;
    activeSwipeId = instanceId;
  }

  function snapClose() {
    translateX = 0;
    if (activeSwipeId === instanceId) {
      activeSwipeId = null;
    }
  }

  function handleTouchStart(e: TouchEvent) {
    if ($isDesktop || disabled) return;
    const touch = e.touches[0];
    startX = touch.clientX;
    startY = touch.clientY;
    isScrolling = null;
    isDragging = true;
  }

  function handleTouchMove(e: TouchEvent) {
    if (!isDragging || $isDesktop || disabled) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;

    // Decide swipe vs scroll after 10px of movement
    if (isScrolling === null && (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10)) {
      isScrolling = Math.abs(deltaY) > Math.abs(deltaX);
    }

    if (isScrolling) {
      isDragging = false;
      return;
    }

    // Only allow left swipe (negative deltaX) or closing a revealed card
    if (isOpen) {
      // From open position, allow dragging right (back) or more left
      translateX = Math.min(0, Math.max(-REVEAL_WIDTH - 40, -REVEAL_WIDTH + deltaX));
    } else {
      // From closed position, only swipe left
      if (deltaX > 0) return;
      translateX = Math.max(-OVERSWIPE_THRESHOLD - 20, deltaX);
    }

    e.preventDefault();
  }

  function handleTouchEnd() {
    if (!isDragging || $isDesktop || disabled) {
      isDragging = false;
      return;
    }
    isDragging = false;

    if (isScrolling) {
      isScrolling = null;
      return;
    }
    isScrolling = null;

    const absTranslate = Math.abs(translateX);

    if (absTranslate >= OVERSWIPE_THRESHOLD) {
      // Auto-trigger delete
      snapClose();
      ondelete();
    } else if (absTranslate >= SNAP_THRESHOLD) {
      // Close any other open card first
      if (activeSwipeId !== null && activeSwipeId !== instanceId) {
        activeSwipeId = null;
      }
      snapOpen();
    } else {
      snapClose();
    }
  }

  function handleDeleteClick() {
    snapClose();
    ondelete();
  }

  // Close this card when another opens
  $effect(() => {
    if (activeSwipeId !== null && activeSwipeId !== instanceId) {
      translateX = 0;
    }
  });
</script>

{#if $isDesktop || disabled}
  {@render children()}
{:else}
  <div class="swipe-wrapper">
    <!-- Swipeable card content (first in DOM so selectors find the card button first) -->
    <div
      class="swipe-content"
      style="transform: translateX({translateX}px); {isDragging ? 'will-change: transform;' : ''} transition: {isDragging ? 'none' : 'transform 0.25s ease'};"
      role="presentation"
      ontouchstart={handleTouchStart}
      ontouchmove={handleTouchMove}
      ontouchend={handleTouchEnd}
      ontouchcancel={handleTouchEnd}
    >
      {@render children()}
    </div>

    <!-- Red action area (absolutely positioned behind the card, aria-hidden) -->
    <div class="delete-action" aria-hidden="true" onclick={handleDeleteClick}>
      <div class="delete-action-content">
        <Trash2 size={18} />
        <span>{m.common_delete()}</span>
      </div>
    </div>

    <!-- Tap-to-close overlay when card is swiped open -->
    {#if isOpen}
      <div
        class="swipe-close-overlay"
        role="button"
        tabindex="-1"
        aria-label="Close"
        onclick={snapClose}
        onkeydown={(e) => e.key === 'Enter' && snapClose()}
      ></div>
    {/if}
  </div>
{/if}

<style>
  .swipe-wrapper {
    position: relative;
    overflow: hidden;
  }

  .delete-action {
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 80px;
    background: var(--apex-danger);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .delete-action {
    cursor: pointer;
  }

  .delete-action-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    color: white;
    font-size: 11px;
    font-weight: 600;
    font-family: inherit;
    pointer-events: none;
  }

  .swipe-content {
    position: relative;
    z-index: 1;
  }

  .swipe-close-overlay {
    position: absolute;
    inset: 0;
    z-index: 2;
    background: transparent;
  }
</style>
