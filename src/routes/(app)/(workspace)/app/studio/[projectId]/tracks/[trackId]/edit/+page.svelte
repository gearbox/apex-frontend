<script lang="ts">
  import { page } from '$app/stores';
  import SongEditorWorkspace from '$lib/components/studio/editor/SongEditorWorkspace.svelte';
  let projectId = $derived($page.params.projectId ?? '');
  let trackId = $derived($page.params.trackId ?? '');
</script>

{#key trackId}
  <SongEditorWorkspace {projectId} {trackId} />
{/key}
