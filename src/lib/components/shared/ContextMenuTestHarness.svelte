<script lang="ts">
  import ContextMenu from './ContextMenu.svelte';

  let activated = $state(false);
  function activate() {
    activated = true;
  }
  const items = [{ label: 'Archive', onclick: activate }];
</script>

<ContextMenu {items}>
  {#snippet children(menu)}
    <button
      type="button"
      aria-label="Open actions"
      aria-haspopup="menu"
      aria-expanded={menu.expanded}
      onclick={menu.toggle}
    >
      Actions
    </button>
  {/snippet}
</ContextMenu>

{#if activated}<p>Action completed</p>{/if}
