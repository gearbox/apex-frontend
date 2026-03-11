<script lang="ts">
  import { moreSheetOpen, closeMoreSheet } from '$lib/stores/ui';
  import { MORE_ITEMS } from '$lib/utils/constants';
  import { Coins, Activity, User, ChevronRight } from 'lucide-svelte';

  const iconMap: Record<string, typeof Coins> = {
    coins: Coins,
    activity: Activity,
    user: User,
  };

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') closeMoreSheet();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if $moreSheetOpen}
  <div class="sheet-backdrop" onclick={closeMoreSheet} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="sheet-panel" onclick={(e) => e.stopPropagation()} role="dialog" aria-label="More navigation" tabindex="-1">
      <!-- Handle bar -->
      <div class="sheet-handle"></div>

      <nav>
        {#each MORE_ITEMS as item (item.href)}
          {@const Icon = iconMap[item.icon]}
          <a href={item.href} onclick={closeMoreSheet} class="sheet-item">
            <span class="sheet-item-icon">
              {#if Icon}<Icon size={20} strokeWidth={1.75} />{/if}
            </span>
            <span class="sheet-item-label">{item.label}</span>
            <span class="sheet-item-chevron"><ChevronRight size={16} /></span>
          </a>
        {/each}
      </nav>

      <div class="sheet-cancel-wrap">
        <button onclick={closeMoreSheet} class="sheet-cancel">Cancel</button>
      </div>
    </div>
  </div>
{/if}

<style>
  @keyframes slideUp {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }

  .sheet-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    z-index: 200;
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }

  .sheet-panel {
    background: var(--apex-surface);
    border-radius: 20px 20px 0 0;
    width: 100%;
    max-width: 480px;
    padding: 12px 0 max(16px, env(safe-area-inset-bottom));
    animation: slideUp 0.25s ease-out;
  }

  .sheet-handle {
    width: 36px;
    height: 4px;
    border-radius: 2px;
    background: var(--apex-border);
    margin: 0 auto 16px;
  }

  .sheet-item {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    padding: 14px 24px;
    background: transparent;
    color: var(--apex-text);
    font-size: 15px;
    font-weight: 500;
    text-decoration: none;
    text-align: left;
  }
  .sheet-item-icon { color: var(--apex-text-muted); display: flex; flex-shrink: 0; }
  .sheet-item-label { flex: 1; }
  .sheet-item-chevron { color: var(--apex-text-dim); display: flex; }

  .sheet-cancel-wrap { padding: 8px 24px 0; }
  .sheet-cancel {
    width: 100%;
    padding: 12px 0;
    border-radius: 12px;
    border: 1px solid var(--apex-border);
    background: transparent;
    color: var(--apex-text-muted);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
  }
</style>
