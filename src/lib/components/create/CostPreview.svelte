<script lang="ts">
  let { estimatedCost }: { estimatedCost: number | null } = $props();
</script>

<span class="font-mono text-xs opacity-70">◈ {estimatedCost ?? '?'}</span>
