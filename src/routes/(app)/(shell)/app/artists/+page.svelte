<script lang="ts">
  import { createQuery } from '@tanstack/svelte-query';
  import { ArrowUpRight, Plus, UsersRound } from '@lucide/svelte';
  import { artistsQueryOptions } from '$lib/queries/studio';
  import { ROUTES } from '$lib/utils/routes';
  import Spinner from '$lib/components/ui/Spinner.svelte';
  import * as m from '$paraglide/messages';

  const artistsQuery = createQuery(artistsQueryOptions);
  let artists = $derived(artistsQuery.data?.items ?? []);

  function monogram(name: string): string {
    const initials = name
      .trim()
      .split(/\s+/u)
      .slice(0, 2)
      .map((word) => Array.from(word)[0] ?? '')
      .join('')
      .toLocaleUpperCase();
    return Array.from(initials).slice(0, 2).join('');
  }
</script>

<svelte:head>
  <title>{m.artists_title()}</title>
</svelte:head>

<section class="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-10">
  {#if artistsQuery.isPending}
    <div class="flex min-h-64 items-center justify-center" role="status" aria-live="polite">
      <Spinner size="2xl" label={m.common_loading()} />
    </div>
  {:else if artistsQuery.isError}
    <div
      class="mx-auto max-w-lg rounded-2xl border border-border bg-surface p-6 text-center"
      role="alert"
    >
      <h1 class="font-display text-2xl font-semibold text-text">{m.artists_load_error_title()}</h1>
      <p class="mt-2 text-sm text-text-muted">{m.artists_load_error()}</p>
      <button
        type="button"
        class="mt-5 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-bg"
        onclick={() => void artistsQuery.refetch()}
      >
        {m.common_retry()}
      </button>
    </div>
  {:else if artists.length === 0}
    <div
      class="mx-auto flex min-h-[55vh] max-w-2xl flex-col items-center justify-center py-10 text-center"
    >
      <div
        class="mb-5 flex h-16 w-16 items-center justify-center rounded-3xl border border-border bg-surface text-accent"
      >
        <UsersRound size={28} aria-hidden="true" />
      </div>
      <h1 class="font-display text-3xl font-semibold tracking-tight text-text md:text-4xl">
        {m.artists_empty_title()}
      </h1>
      <p class="mt-3 max-w-md text-sm leading-6 text-text-muted">{m.artists_empty_description()}</p>
      <a
        href={`${ROUTES.artists}/new`}
        class="mt-7 inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-bg shadow-sm transition hover:brightness-110"
      >
        <Plus size={17} aria-hidden="true" />
        {m.artists_new_cta()}
      </a>
    </div>
  {:else}
    <header class="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p class="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
          {m.artists_eyebrow()}
        </p>
        <h1 class="font-display text-3xl font-semibold tracking-tight text-text md:text-4xl">
          {m.artists_title()}
        </h1>
        <p class="mt-2 text-sm text-text-muted">{m.artists_index_description()}</p>
      </div>
      {#if artists.length < 50}
        <a
          href={`${ROUTES.artists}/new`}
          class="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-bg transition hover:brightness-110"
        >
          <Plus size={17} aria-hidden="true" />{m.artists_new_cta()}
        </a>
      {/if}
    </header>

    <div class="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
      {#each artists as artist (artist.id)}
        <a
          href={`${ROUTES.artists}/${artist.id}`}
          class="group rounded-2xl border border-border bg-surface p-5 transition hover:-translate-y-0.5 hover:border-border-active hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <div class="flex items-center gap-4">
            <span
              class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-accent-glow font-display text-xl font-bold text-accent"
              aria-hidden="true">{monogram(artist.name)}</span
            >
            <div class="min-w-0 flex-1">
              <h2 class="truncate font-display text-xl font-semibold text-text">{artist.name}</h2>
              {#if artist.style_tags.length > 0}
                <ul class="mt-2 flex flex-wrap gap-1.5" aria-label={m.artists_style_tags()}>
                  {#each artist.style_tags.slice(0, 3) as tag, index (`${tag}-${index}`)}
                    <li
                      class="max-w-full truncate rounded-full border border-border px-2 py-0.5 text-xs text-text-muted"
                    >
                      {tag}
                    </li>
                  {/each}
                </ul>
              {/if}
            </div>
            <ArrowUpRight
              size={17}
              class="shrink-0 text-text-dim transition group-hover:text-accent"
              aria-hidden="true"
            />
          </div>
          {#if artist.persona}
            <p class="mt-4 line-clamp-2 text-sm leading-5 text-text-muted">{artist.persona}</p>
          {/if}
        </a>
      {/each}

      {#if artists.length < 50}
        <a
          href={`${ROUTES.artists}/new`}
          class="flex min-h-32 items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-transparent p-5 text-sm font-semibold text-text-muted transition hover:border-accent hover:bg-accent-glow hover:text-accent"
        >
          <Plus size={18} aria-hidden="true" />{m.artists_new_card()}
        </a>
      {/if}
    </div>
    {#if artists.length >= 50}
      <p class="mt-5 text-center text-sm text-text-muted">{m.artists_limit_hint()}</p>
    {/if}
  {/if}
</section>
