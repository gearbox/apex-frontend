<script module lang="ts">
  export type LibraryTab = 'all' | 'generated' | 'uploads' | 'favorites';
</script>

<script lang="ts">
  import * as m from '$paraglide/messages';
  import { Square, SquareCheckBig } from 'lucide-svelte';

  let {
    active,
    onchange,
    expiring,
    onExpiringChange,
  }: {
    active: LibraryTab;
    onchange: (tab: LibraryTab) => void;
    expiring: boolean;
    onExpiringChange: (checked: boolean) => void;
  } = $props();

  const tabs: { key: LibraryTab; label: () => string }[] = [
    { key: 'all', label: () => m.library_tab_all() },
    { key: 'generated', label: () => m.library_tab_generated() },
    { key: 'uploads', label: () => m.library_tab_uploads() },
    { key: 'favorites', label: () => m.library_tab_favorites() },
  ];
</script>

<div class="flex items-center gap-1.5 overflow-x-auto">
  <div class="flex gap-1.5" role="tablist">
    {#each tabs as tab (tab.key)}
      <button
        onclick={() => onchange(tab.key)}
        role="tab"
        aria-selected={active === tab.key}
        class="shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors
          {active === tab.key ? 'bg-accent/15 text-accent' : 'text-text-muted hover:text-text'}"
      >
        {tab.label()}
      </button>
    {/each}
  </div>

  <label
    class="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors
      {expiring
      ? 'bg-warning/15 text-warning'
      : 'text-text-muted hover:bg-surface-hover hover:text-text'}"
  >
    <input
      type="checkbox"
      checked={expiring}
      onchange={(event) => onExpiringChange((event.currentTarget as HTMLInputElement).checked)}
      class="sr-only"
    />
    {#if expiring}
      <SquareCheckBig size={14} strokeWidth={1.5} aria-hidden="true" />
    {:else}
      <Square size={14} strokeWidth={1.5} aria-hidden="true" />
    {/if}
    <span>{m.library_expiring_filter()}</span>
  </label>
</div>
