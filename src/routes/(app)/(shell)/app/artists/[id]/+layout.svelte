<script lang="ts">
  import { createQuery } from '@tanstack/svelte-query';
  import { page } from '$app/stores';
  import { artistQueryOptions, artistsQueryOptions } from '$lib/queries/studio';
  import { ROUTES } from '$lib/utils/routes';
  import { studioNewProject } from '$lib/studio/paths';
  import { ArrowLeft } from '@lucide/svelte';
  import Spinner from '$lib/components/ui/Spinner.svelte';
  import { artistMonogram } from '$lib/studio/artists';
  import { ApiRequestError } from '$lib/api/errors';
  import * as m from '$paraglide/messages';
  import type { Snippet } from 'svelte';

  let { children }: { children: Snippet } = $props();
  let artistId = $derived($page.params.id ?? '');
  const artistQuery = createQuery(() => ({ ...artistQueryOptions(artistId), enabled: !!artistId }));
  const artistsQuery = createQuery(artistsQueryOptions);
  let artist = $derived(artistQuery.data);
  let isProfile = $derived($page.url.pathname.endsWith('/profile'));
  let artistNotFound = $derived(
    artistQuery.isError &&
      artistQuery.error instanceof ApiRequestError &&
      artistQuery.error.status_code === 404 &&
      artistQuery.error.error === 'artist_not_found',
  );
</script>

{#if artistQuery.isPending}
  <div class="flex min-h-96 items-center justify-center" role="status" aria-live="polite">
    <Spinner size="2xl" label={m.common_loading()} />
  </div>
{:else if artistQuery.isLoadingError && artistNotFound}
  <section
    class="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-5 text-center"
  >
    <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface text-accent">
      <ArrowLeft size={24} aria-hidden="true" />
    </div>
    <h1 class="mt-5 font-display text-2xl font-semibold text-text">
      {m.artists_not_found_title()}
    </h1>
    <p class="mt-2 text-sm text-text-muted">{m.artists_not_found_description()}</p>
    <a
      href={ROUTES.artists}
      class="mt-5 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-bg"
      >{m.artists_back_to_all()}</a
    >
  </section>
{:else if artistQuery.isLoadingError || !artist}
  <section
    class="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-5 text-center"
    role="alert"
  >
    <h1 class="font-display text-2xl font-semibold text-text">
      {m.artists_load_error_title()}
    </h1>
    <p class="mt-2 text-sm text-text-muted">{m.artists_load_error()}</p>
    <button
      type="button"
      class="mt-5 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-bg"
      onclick={() => void artistQuery.refetch()}
    >
      {m.common_retry()}
    </button>
  </section>
{:else}
  <div class="mx-auto w-full max-w-7xl px-4 py-4 pb-28 md:px-8 md:py-8 md:pb-10">
    <div class="grid gap-6 lg:grid-cols-[230px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)]">
      <aside class="hidden lg:block">
        <div class="sticky top-6 rounded-2xl border border-border bg-surface p-4">
          <div class="mb-4 flex items-center justify-between gap-2">
            <h2 class="text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
              {m.artists_switcher_title()}
            </h2>
            <a
              href={`${ROUTES.artists}/new`}
              class="rounded-lg px-2 py-1 text-xs font-semibold text-accent hover:bg-accent-glow"
              >{m.artists_new_short()}</a
            >
          </div>
          {#if artistsQuery.isPending}
            <div class="flex justify-center py-5"><Spinner size="sm" /></div>
          {:else if artistsQuery.data?.items}
            <nav aria-label={m.artists_switcher_title()} class="space-y-1">
              {#each artistsQuery.data.items as item (item.id)}
                <a
                  href={`${ROUTES.artists}/${item.id}`}
                  aria-current={item.id === artist.id ? 'page' : undefined}
                  class="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition {item.id ===
                  artist.id
                    ? 'bg-accent-glow font-semibold text-accent'
                    : 'text-text-muted hover:bg-surface-hover hover:text-text'}"
                >
                  <span
                    class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bg font-display text-xs font-bold text-accent"
                    aria-hidden="true">{artistMonogram(item.name)}</span
                  >
                  <span class="truncate">{item.name}</span>
                </a>
              {/each}
            </nav>
          {/if}
        </div>
      </aside>

      <div class="min-w-0">
        {#if artistQuery.isRefetchError}
          <div
            role="status"
            class="mb-4 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-text"
          >
            {artistNotFound ? m.artists_deleted_elsewhere() : m.artists_refresh_error()}
            {#if artistNotFound}
              <a href={ROUTES.artists} class="ml-2 font-semibold text-accent"
                >{m.artists_back_to_all()}</a
              >
            {:else}
              <button
                type="button"
                class="ml-2 font-semibold text-accent"
                onclick={() => void artistQuery.refetch()}>{m.common_retry()}</button
              >
            {/if}
          </div>
        {/if}
        <header class="mb-5 rounded-2xl border border-border bg-surface p-4 md:p-6">
          <div class="flex items-start gap-4">
            <span
              class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent-glow font-display text-xl font-bold text-accent md:h-16 md:w-16 md:text-2xl"
              aria-hidden="true">{artistMonogram(artist.name)}</span
            >
            <div class="min-w-0 flex-1">
              <p class="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
                {m.artists_profile_eyebrow()}
              </p>
              <h1
                class="mt-1 truncate font-display text-2xl font-semibold tracking-tight text-text md:text-3xl"
              >
                {artist.name}
              </h1>
              {#if artist.style_tags.length > 0}
                <ul class="mt-2 flex flex-wrap gap-1.5" aria-label={m.artists_style_tags()}>
                  {#each artist.style_tags.slice(0, 5) as tag, index (`${tag}-${index}`)}
                    <li
                      class="rounded-full border border-border px-2 py-0.5 text-xs text-text-muted"
                    >
                      {tag}
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>
            <a
              class="shrink-0 rounded-lg bg-accent px-3 py-2 text-center text-sm font-semibold text-bg"
              href={studioNewProject(artist.id)}>{m.studio_new_project()}</a
            >
          </div>
          <nav
            class="mt-5 flex gap-1 border-t border-border pt-3"
            aria-label={m.artists_tabs_label()}
          >
            <a
              href={`${ROUTES.artists}/${artist.id}`}
              aria-current={!isProfile ? 'page' : undefined}
              class="rounded-lg px-4 py-2 text-sm font-semibold transition {isProfile
                ? 'text-text-muted hover:bg-surface-hover'
                : 'bg-accent-glow text-accent'}">{m.artists_tab_diary()}</a
            >
            <a
              href={`${ROUTES.artists}/${artist.id}/profile`}
              aria-current={isProfile ? 'page' : undefined}
              class="rounded-lg px-4 py-2 text-sm font-semibold transition {isProfile
                ? 'bg-accent-glow text-accent'
                : 'text-text-muted hover:bg-surface-hover'}">{m.artists_tab_profile()}</a
            >
          </nav>
        </header>
        {#key artist.id}
          {@render children()}
        {/key}
      </div>
    </div>
  </div>
{/if}
