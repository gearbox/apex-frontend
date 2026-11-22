<script lang="ts">
  import { tick } from 'svelte';
  import { isDesktop } from '$lib/utils/breakpoints';
  import type { LucideIcon } from '@lucide/svelte';
  import type { Snippet } from 'svelte';

  export interface ContextMenuTrigger {
    readonly expanded: boolean;
    /** Opens below the clicked element, or closes when this element opened it. Focus returns here on close. */
    toggle(event: MouseEvent): void;
  }

  interface ContextMenuItem {
    label: string;
    icon?: LucideIcon;
    variant?: 'default' | 'danger';
    onclick: () => void | Promise<void>;
    /** Fires before `click` — e.g. prewarming a share's blob cache before activation expires. */
    onpointerdown?: () => void;
    /** Keeps a reopened menu truthful while an action started from it is still pending. */
    disabled?: boolean;
    pending?: boolean;
  }

  interface Props {
    items: ContextMenuItem[];
    children: Snippet<[ContextMenuTrigger]>;
  }

  let { items, children }: Props = $props();

  let menuVisible = $state(false);
  let menuX = $state(0);
  let menuY = $state(0);

  let menuEl: HTMLDivElement | undefined = $state();
  let opener: HTMLElement | undefined = $state();
  let trigger = $derived({ expanded: menuVisible, toggle: toggleFromTrigger });

  function focusFirstItem() {
    menuEl?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')?.focus();
  }

  function positionMenu(x: number, y: number) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const menuW = 160;
    const menuH = items.length * 40 + 8; // approx

    menuX = x + menuW > vw ? x - menuW : x;
    menuY = y + menuH > vh ? y - menuH : y;
  }

  function handleContextMenu(e: MouseEvent) {
    if (!$isDesktop) return;
    e.preventDefault();
    openAt(e.clientX, e.clientY);
  }

  /** Opens the menu at the given viewport coordinates — the button-triggered equivalent of a right-click. */
  export function openAt(x: number, y: number, trigger?: HTMLElement) {
    positionMenu(x, y);
    opener = trigger;
    menuVisible = true;
    void tick().then(focusFirstItem);
  }

  function close(returnFocus = false) {
    menuVisible = false;
    if (returnFocus) opener?.focus();
    opener = undefined;
  }

  function toggleFromTrigger(event: MouseEvent) {
    const triggerElement = event.currentTarget as HTMLElement;
    if (menuVisible && opener === triggerElement) {
      close();
      return;
    }
    const rect = triggerElement.getBoundingClientRect();
    openAt(rect.right - 160, rect.bottom, triggerElement);
  }

  function handleItemClick(item: ContextMenuItem) {
    if (item.disabled) return;
    close(true);
    // Handlers never reject (see resolveLibraryAction) — invoked fire-and-forget.
    void item.onclick();
  }

  function handleDocumentClick(e: MouseEvent) {
    if (opener?.contains(e.target as Node)) return;
    if (menuVisible && menuEl && !menuEl.contains(e.target as Node)) {
      close();
    }
  }

  function handleDocumentKeydown(e: KeyboardEvent) {
    if (!menuVisible) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const buttons = Array.from(
      menuEl?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [],
    );
    if (buttons.length === 0) return;
    e.preventDefault();
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const step = e.key === 'ArrowDown' ? 1 : -1;
    const next =
      current < 0
        ? step > 0
          ? 0
          : buttons.length - 1
        : (current + step + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }
</script>

<svelte:document onclick={handleDocumentClick} onkeydown={handleDocumentKeydown} />

<div oncontextmenu={handleContextMenu} role="presentation">
  {@render children(trigger)}
</div>

{#if menuVisible}
  <div bind:this={menuEl} class="context-menu" style="left: {menuX}px; top: {menuY}px;" role="menu">
    {#each items as item (item.label)}
      <button
        class="context-menu-item {item.variant === 'danger' ? 'danger' : ''}"
        onclick={() => handleItemClick(item)}
        onpointerdown={item.onpointerdown}
        role="menuitem"
        disabled={item.disabled}
        aria-busy={item.pending}
      >
        {#if item.icon}
          {@const Icon = item.icon}
          <span class="item-icon">
            <Icon size={14} />
          </span>
        {/if}
        <span>{item.label}</span>
      </button>
    {/each}
  </div>
{/if}

<style>
  .context-menu {
    position: fixed;
    z-index: 100;
    background: var(--apex-surface);
    border: 1px solid var(--apex-border);
    border-radius: 8px;
    padding: 4px;
    min-width: 140px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  }

  .context-menu-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 10px;
    border: none;
    background: transparent;
    border-radius: 5px;
    font-size: 13px;
    font-family: inherit;
    color: var(--apex-text);
    cursor: pointer;
    text-align: left;
    transition: background 0.1s;
  }

  .context-menu-item:hover {
    background: var(--apex-surface-hover);
  }

  .context-menu-item:focus-visible {
    outline: 2px solid var(--apex-accent);
    outline-offset: -2px;
  }

  .context-menu-item.danger {
    color: var(--apex-danger);
  }

  .context-menu-item:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .item-icon {
    display: flex;
    flex-shrink: 0;
  }
</style>
