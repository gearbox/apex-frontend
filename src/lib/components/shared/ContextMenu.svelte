<script lang="ts">
  import { isDesktop } from '$lib/utils/breakpoints';
  import type { ComponentType, SvelteComponent, Snippet } from 'svelte';

  interface ContextMenuItem {
    label: string;
    icon?: ComponentType<SvelteComponent>;
    variant?: 'default' | 'danger';
    onclick: () => void;
  }

  interface Props {
    items: ContextMenuItem[];
    children: Snippet;
  }

  let { items, children }: Props = $props();

  let menuVisible = $state(false);
  let menuX = $state(0);
  let menuY = $state(0);

  let menuEl: HTMLDivElement | undefined = $state();

  function handleContextMenu(e: MouseEvent) {
    if (!$isDesktop) return;
    e.preventDefault();

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const menuW = 160;
    const menuH = items.length * 40 + 8; // approx

    menuX = e.clientX + menuW > vw ? e.clientX - menuW : e.clientX;
    menuY = e.clientY + menuH > vh ? e.clientY - menuH : e.clientY;
    menuVisible = true;
  }

  function close() {
    menuVisible = false;
  }

  function handleItemClick(item: ContextMenuItem) {
    close();
    item.onclick();
  }

  function handleDocumentClick(e: MouseEvent) {
    if (menuVisible && menuEl && !menuEl.contains(e.target as Node)) {
      close();
    }
  }

  function handleDocumentKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }
</script>

<svelte:document
  onclick={handleDocumentClick}
  onkeydown={handleDocumentKeydown}
/>

<div
  oncontextmenu={handleContextMenu}
  role="presentation"
>
  {@render children()}
</div>

{#if menuVisible && $isDesktop}
  <div
    bind:this={menuEl}
    class="context-menu"
    style="left: {menuX}px; top: {menuY}px;"
    role="menu"
  >
    {#each items as item (item.label)}
      <button
        class="context-menu-item {item.variant === 'danger' ? 'danger' : ''}"
        onclick={() => handleItemClick(item)}
        role="menuitem"
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

  .context-menu-item.danger {
    color: var(--apex-danger);
  }

  .item-icon {
    display: flex;
    flex-shrink: 0;
  }
</style>
