<script lang="ts">
  import { createInfiniteQuery, createQuery } from '@tanstack/svelte-query';
  import { projectsInfiniteQueryOptions } from '$lib/queries/studioProjects';
  import { artistsQueryOptions } from '$lib/queries/studio';
  import { studioNewProject, studioProject } from '$lib/studio/paths';
  import { ROUTES } from '$lib/utils/routes';
  import { artistMonogram } from '$lib/studio/artists';
  import InfiniteScrollSentinel from '$lib/components/shared/InfiniteScrollSentinel.svelte';
  import Spinner from '$lib/components/ui/Spinner.svelte';
  import * as m from '$paraglide/messages';
  import { locale } from '$lib/stores/locale';
  const projects = createInfiniteQuery(projectsInfiniteQueryOptions);
  const artists = createQuery(artistsQueryOptions);
  let items = $derived(projects.data?.pages.flatMap((page) => page.items) ?? []);
  let artistMap = $derived(
    new Map((artists.data?.items ?? []).map((artist) => [artist.id, artist.name])),
  );
  function kind(value: string) {
    return value === 'album'
      ? m.studio_album()
      : value === 'ep'
        ? m.studio_ep()
        : m.studio_single();
  }
  function relative(value: string) {
    const days = Math.round((new Date(value).getTime() - Date.now()) / 86400000);
    return new Intl.RelativeTimeFormat($locale, { numeric: 'auto' }).format(days, 'day');
  }
</script>

<svelte:head><title>{m.studio_title()}</title></svelte:head>
<section class="mx-auto max-w-6xl px-4 py-8 md:px-8">
  <header class="mb-10 flex flex-wrap items-end justify-between gap-4">
    <div>
      <h1 class="font-display text-4xl font-bold text-text">{m.studio_title()}</h1>
      <p class="mt-3 text-text-muted">{m.studio_subtitle()}</p>
    </div>
    <a class="rounded-xl bg-accent px-5 py-3 font-semibold text-bg" href={studioNewProject()}
      >{m.studio_new_project()}</a
    >
  </header>
  <h2 class="mb-4 font-display text-2xl font-semibold">{m.studio_projects()}</h2>
  {#if projects.isRefetchError || projects.isFetchNextPageError}<p
      role="status"
      class="mb-4 text-warning"
    >
      {m.studio_refresh_error()}
      <button
        class="text-accent underline"
        onclick={() =>
          projects.isFetchNextPageError ? void projects.fetchNextPage() : void projects.refetch()}
        >{m.studio_retry()}</button
      >
    </p>{/if}
  {#if projects.isPending}<div role="status"><Spinner label={m.common_loading()} /></div>
  {:else if projects.isLoadingError}<div role="alert">
      {m.studio_loading_error()}
      <button onclick={() => void projects.refetch()}>{m.studio_retry()}</button>
    </div>
  {:else if !items.length}<div class="rounded-2xl border border-border bg-surface p-10 text-center">
      <p>{m.studio_empty()}</p>
      <a class="mt-4 inline-block text-accent" href={studioNewProject()}>{m.studio_new_project()}</a
      >
    </div>
  {:else}<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each items as project (project.library_project_id)}<a
          class="rounded-2xl border border-border bg-surface p-5 hover:border-accent"
          href={studioProject(project.library_project_id)}
          ><h3 class="font-display text-xl font-semibold">{project.name}</h3>
          <p class="mt-2 text-sm text-text-muted">
            {kind(project.release_kind)} · {project.artist_id
              ? (artistMap.get(project.artist_id) ?? m.studio_no_artist())
              : m.studio_no_artist()}
          </p>
          <p class="mt-4 text-sm text-text-muted">
            {m.studio_track_count({ count: String(project.track_count) })} · {relative(
              project.updated_at,
            )}
          </p></a
        >{/each}
    </div>
    <InfiniteScrollSentinel
      disabled={!projects.hasNextPage || projects.isFetchingNextPage}
      onVisible={() => void projects.fetchNextPage()}
    />{/if}
  <div class="mt-12 flex items-center justify-between">
    <h2 class="font-display text-2xl font-semibold">{m.studio_artists()}</h2>
    <a class="text-accent" href={`${ROUTES.artists}/new`}>{m.studio_new_artist()}</a>
  </div>
  {#if artists.isRefetchError}<p role="status">
      {m.studio_refresh_error()}
      <button onclick={() => void artists.refetch()}>{m.studio_retry()}</button>
    </p>{/if}
  {#if artists.isLoadingError}<p role="alert">
      {m.studio_loading_error()}
      <button onclick={() => void artists.refetch()}>{m.studio_retry()}</button>
    </p>{/if}
  <div class="mt-4 flex flex-wrap gap-3">
    {#each (artists.data?.items ?? []).slice(0, 6) as artist (artist.id)}<a
        class="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-2"
        href={`${ROUTES.artists}/${artist.id}`}
        ><span class="font-bold text-accent">{artistMonogram(artist.name)}</span>{artist.name}</a
      >{/each}
  </div>
</section>
