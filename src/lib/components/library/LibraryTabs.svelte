<script module lang="ts">
  export type LibraryTab = 'all' | 'generated' | 'uploads' | 'favorites';
</script>

<script lang="ts">
  import * as m from '$paraglide/messages';

  let { active, onchange }: { active: LibraryTab; onchange: (tab: LibraryTab) => void } = $props();

  const tabs: { key: LibraryTab; label: () => string }[] = [
    { key: 'all', label: () => m.library_tab_all() },
    { key: 'generated', label: () => m.library_tab_generated() },
    { key: 'uploads', label: () => m.library_tab_uploads() },
    { key: 'favorites', label: () => m.library_tab_favorites() },
  ];
</script>

<div class="flex gap-1.5 overflow-x-auto" role="tablist">
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
