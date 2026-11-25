<script lang="ts">
  import { page } from '$app/stores';
  import { createQuery } from '@tanstack/svelte-query';
  import { projectQueryOptions } from '$lib/queries/studioProjects';
  import { artistsQueryOptions } from '$lib/queries/studio';
  import TrackColumn from '$lib/components/studio/TrackColumn.svelte';
  import * as m from '$paraglide/messages';
  let id = $derived($page.params.projectId ?? '');
  const project = createQuery(() => projectQueryOptions(id));
  const artists = createQuery(artistsQueryOptions);
  let artist = $derived(artists.data?.items.find((item) => item.id === project.data?.artist_id));
  let conceptExpanded = $state(false);
</script>

{#if project.data}<section class="max-w-3xl px-4 py-6 md:p-8">
    <h1 class="font-display text-2xl font-semibold md:text-3xl">{project.data.name}</h1>
    <p class="mt-3 text-text-muted">
      {project.data.release_kind === 'album'
        ? m.studio_album()
        : project.data.release_kind === 'ep'
          ? m.studio_ep()
          : m.studio_single()} · {artist?.name ?? m.studio_no_artist()}
    </p>
    {#if project.data.concept}<p
        class="mt-4 whitespace-pre-wrap md:mt-6 md:line-clamp-none"
        class:line-clamp-3={!conceptExpanded}
      >
        {project.data.concept}
      </p>
      <button
        class="mt-1 text-sm text-accent md:hidden"
        aria-expanded={conceptExpanded}
        onclick={() => (conceptExpanded = !conceptExpanded)}
        >{conceptExpanded ? m.studio_show_less() : m.studio_show_more()}</button
      >{/if}
    <p class="mt-10 hidden text-text-muted md:block">{m.studio_pick_track()}</p>
  </section>{/if}
<div class="md:hidden"><TrackColumn projectId={id} instance="mobile" /></div>
