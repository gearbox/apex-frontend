<script lang="ts">
  import type { Snippet } from 'svelte';
  import { page } from '$app/stores';
  import { createQuery } from '@tanstack/svelte-query';
  import { projectQueryOptions } from '$lib/queries/studioProjects';
  import { artistsQueryOptions } from '$lib/queries/studio';
  import { ApiRequestError } from '$lib/api/errors';
  import { ROUTES } from '$lib/utils/routes';
  import { studioProjectSettings, workspaceBack } from '$lib/studio/paths';
  import WorkspaceTopBar from '$lib/components/layout/WorkspaceTopBar.svelte';
  import TrackColumn from '$lib/components/studio/TrackColumn.svelte';
  import Spinner from '$lib/components/ui/Spinner.svelte';
  import * as m from '$paraglide/messages';
  let { children }: { children: Snippet } = $props();
  let id = $derived($page.params.projectId ?? '');
  const project = createQuery(() => ({ ...projectQueryOptions(id), enabled: !!id }));
  const artists = createQuery(artistsQueryOptions);
  let routeId = $derived($page.route.id ?? '');
  let isSettings = $derived(routeId.endsWith('/settings'));
  let isOverview = $derived(routeId === '/(app)/(workspace)/app/studio/[projectId]');
  let backHref = $derived(workspaceBack(routeId, id));
  let backLabel = $derived(isOverview ? m.studio_back() : m.studio_back_to_project());
  let workspaceTitle = $derived(isSettings ? m.studio_settings() : (project.data?.name ?? ''));
  let artist = $derived(artists.data?.items.find((item) => item.id === project.data?.artist_id));
</script>

{#if project.isPending}<div class="flex flex-1 items-center justify-center" role="status">
    <Spinner label={m.common_loading()} />
  </div>
{:else if project.isLoadingError || !project.data}<div
    class="flex flex-1 flex-col items-center justify-center gap-4 p-6"
    role="alert"
  >
    <h1 class="font-display text-2xl">
      {project.error instanceof ApiRequestError && project.error.status_code === 404
        ? m.studio_not_found()
        : m.studio_loading_error()}
    </h1>
    <a class="text-accent" href={ROUTES.studio}>{m.studio_back()}</a
    >{#if !(project.error instanceof ApiRequestError && project.error.status_code === 404)}<button
        onclick={() => void project.refetch()}>{m.studio_retry()}</button
      >{/if}
  </div>
{:else}
  <WorkspaceTopBar title={workspaceTitle} {backHref} {backLabel}
    >{#snippet actions()}{#if !isSettings}<a href={studioProjectSettings(id)}
          >{m.studio_settings()}</a
        >{/if}{/snippet}</WorkspaceTopBar
  >
  <header class="hidden items-center gap-3 border-b border-border px-6 py-4 md:flex">
    <a href={ROUTES.studio} class="text-accent">{m.studio_title()}</a><span>/</span><strong
      >{project.data.name}</strong
    >{#if artist}<a class="ml-4 text-text-muted" href={`${ROUTES.artists}/${artist.id}`}
        >{artist.name}</a
      >{/if}<a class="ml-auto text-accent" href={studioProjectSettings(id)}>{m.studio_settings()}</a
    >
  </header>
  {#if project.isRefetchError}<p role="status" class="px-4 py-2 text-warning">
      {m.studio_refresh_error()}
      <button onclick={() => void project.refetch()}>{m.studio_retry()}</button>
    </p>{/if}
  <div class="flex min-h-0 flex-1">
    <aside class="hidden w-80 shrink-0 overflow-y-auto border-r border-border md:block">
      <TrackColumn projectId={id} instance="desktop" />
    </aside>
    <div class="workspace-scroll min-w-0 flex-1 overflow-y-auto">
      {#key id}{@render children()}{/key}
    </div>
  </div>
{/if}
