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
</script>

<div class="md:hidden"><TrackColumn projectId={id} instance="mobile" /></div>
{#if project.data}<div class="hidden max-w-3xl p-8 md:block">
    <h1 class="font-display text-3xl">{project.data.name}</h1>
    <p class="mt-3 text-text-muted">
      {project.data.release_kind === 'album'
        ? m.studio_album()
        : project.data.release_kind === 'ep'
          ? m.studio_ep()
          : m.studio_single()} · {artist?.name ?? m.studio_no_artist()}
    </p>
    {#if project.data.concept}<p class="mt-6 whitespace-pre-wrap">{project.data.concept}</p>{/if}
    <p class="mt-10 text-text-muted">{m.studio_pick_track()}</p>
  </div>{/if}
