<script lang="ts">
  import type { Snippet } from 'svelte';
  import CapabilityGate from '$lib/components/product/CapabilityGate.svelte';

  let { children }: { children: Snippet } = $props();
</script>

<CapabilityGate capability="studio">
  {@render children()}
</CapabilityGate>
