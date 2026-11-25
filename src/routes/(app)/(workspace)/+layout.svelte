<script lang="ts">
  import type { Snippet } from 'svelte';
  import WorkspaceShell from '$lib/components/layout/WorkspaceShell.svelte';
  import CapabilityGate from '$lib/components/product/CapabilityGate.svelte';
  let { children }: { children: Snippet } = $props();
</script>

<CapabilityGate capability="studio"
  ><WorkspaceShell>{@render children()}</WorkspaceShell></CapabilityGate
>
