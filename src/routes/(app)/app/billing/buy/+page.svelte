<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';

  onMount(() => goto('/app/billing?tab=buy', { replaceState: true }));
</script>
