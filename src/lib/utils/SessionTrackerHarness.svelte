<script lang="ts">
  import { untrack } from 'svelte';
  import { componentSession, type Session } from './sessionTracker';
  let { capture }: { capture: (session: Session) => void } = $props();
  const session = componentSession().capture();
  untrack(() => capture(session));
</script>
