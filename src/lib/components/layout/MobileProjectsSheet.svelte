<script lang="ts">
  import { projectsSheetOpen, closeMobileNavSheet } from '$lib/stores/ui';
  import ProjectNav from '$lib/components/library/ProjectNav.svelte';
  import MobileNavSheet from './MobileNavSheet.svelte';
  import * as m from '$paraglide/messages';
</script>

{#if $projectsSheetOpen}
  <MobileNavSheet
    id="mobile-projects-sheet"
    label={m.library_projects()}
    tall={true}
    onclose={closeMobileNavSheet}
  >
    <ProjectNav surface="mobile" onclose={closeMobileNavSheet} />
  </MobileNavSheet>
{/if}
