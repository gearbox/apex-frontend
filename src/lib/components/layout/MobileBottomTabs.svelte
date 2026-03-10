<script lang="ts">
  import { page } from '$app/stores';
  import { openMoreSheet } from '$lib/stores/ui';
  import { TAB_ITEMS } from '$lib/utils/constants';
  import { Plus, Image, MoreVertical } from 'lucide-svelte';

  const iconMap: Record<string, typeof Plus> = {
    plus: Plus,
    image: Image,
  };
</script>

<nav class="btm-tabs">
  {#each TAB_ITEMS as item}
    {@const Icon = iconMap[item.icon]}
    {@const isActive = $page.url.pathname.startsWith(item.href)}
    <a href={item.href} class="btm-tab" class:active={isActive}>
      <span class="btm-tab-icon">
        {#if Icon}<Icon size={22} strokeWidth={isActive ? 2.25 : 1.75} />{/if}
      </span>
      <span class="btm-tab-label">{item.label}</span>
    </a>
  {/each}

  <button onclick={openMoreSheet} class="btm-tab">
    <span class="btm-tab-icon">
      <MoreVertical size={22} strokeWidth={1.75} />
    </span>
    <span class="btm-tab-label">More</span>
  </button>
</nav>

<style>
  .btm-tabs {
    display: flex;
    border-top: 1px solid var(--apex-border);
    background: var(--apex-bg);
    padding: 6px 0 max(6px, env(safe-area-inset-bottom));
    position: relative;
    z-index: 50;
  }

  .btm-tab {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 6px 0;
    border: none;
    cursor: pointer;
    background: transparent;
    color: var(--apex-text-dim);
    font-family: inherit;
    font-size: 10px;
    font-weight: 500;
    transition: color 0.15s;
    text-decoration: none;
  }

  .btm-tab.active {
    color: var(--apex-accent);
    font-weight: 700;
  }

  .btm-tab-icon {
    position: relative;
    display: flex;
  }

  .btm-tab-label {
    line-height: 1;
  }
</style>
