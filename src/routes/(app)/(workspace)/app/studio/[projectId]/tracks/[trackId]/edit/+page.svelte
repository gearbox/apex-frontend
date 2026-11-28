<script lang="ts">
  import { page } from '$app/stores';
  import SongEditorWorkspace from '$lib/components/studio/editor/SongEditorWorkspace.svelte';
  import { currentUser } from '$lib/stores/auth';
  import * as m from '$paraglide/messages';
  let projectId = $derived($page.params.projectId ?? '');
  let trackId = $derived($page.params.trackId ?? '');
  let userId = $derived($currentUser?.id);
</script>

<!-- Drafts are filed per user, so the editor waits for one rather than use an empty id. -->
{#if userId}
  {#key `${userId}:${trackId}`}
    <SongEditorWorkspace {projectId} {trackId} {userId} />
  {/key}
{:else}
  <p role="status" class="py-10 text-center">{m.common_loading()}</p>
{/if}
