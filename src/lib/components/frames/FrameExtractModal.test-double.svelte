<script lang="ts">
  import { onDestroy } from 'svelte';

  let {
    onclose,
    trigger = null,
  }: {
    onclose: () => void;
    trigger?: HTMLElement | null;
  } = $props();

  onDestroy(() => trigger?.focus());
</script>

<div role="dialog" aria-label="Frame extraction test double">
  <button type="button" onclick={onclose}>Close frame extraction</button>
</div>
