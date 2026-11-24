<script lang="ts">
  import Sheet from './Sheet.svelte';

  let open = $state(false);
  let opener: HTMLButtonElement | undefined = $state();

  function close() {
    open = false;
  }
</script>

<button bind:this={opener} type="button" onclick={() => (open = true)}>Open sheet</button>
{#if open}
  <Sheet ariaLabel="Test sheet" initialFocusSelector="#sheet-first" onclose={close}>
    <button id="sheet-first" type="button">First</button>
    <button type="button">Last</button>
  </Sheet>
{/if}
