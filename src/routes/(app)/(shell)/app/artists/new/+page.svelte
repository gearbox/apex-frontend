<script lang="ts">
  import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';
  import { goto } from '$app/navigation';
  import { ArrowLeft, Check } from '@lucide/svelte';
  import { createArtistMutationOptions, artistsQueryOptions } from '$lib/queries/studio';
  import { ARTIST_KINDS, ARTIST_KIND_COPY, type ArtistKind } from '$lib/studio/artistKinds';
  import { MAX_ARTISTS } from '$lib/studio/artists';
  import {
    artistCreateError,
    describedBy,
    issueId,
    fieldIssues,
    issueMessage,
    studioError,
    validationIssues,
  } from '$lib/studio/formErrors';
  import { codePointLength } from '$lib/studio/text';
  import { STUDIO_LIMITS } from '$lib/studio/limits';
  import { addToast } from '$lib/stores/toasts';
  import { componentSession } from '$lib/utils/sessionTracker';
  import { ROUTES } from '$lib/utils/routes';
  import Spinner from '$lib/components/ui/Spinner.svelte';
  import * as m from '$paraglide/messages';

  const queryClient = useQueryClient();
  const pageSession = componentSession();
  const artistsQuery = createQuery(artistsQueryOptions);
  const createArtistMutation = createMutation(() => createArtistMutationOptions(queryClient));
  let selectedKind = $state<ArtistKind | null>(null);
  let previousTemplate = $state('');
  let name = $state('');
  let persona = $state('');
  let language = $state('');
  let otherLanguage = $state('');
  let hasArtistLimitError = $state(false);

  let artistLimitReached = $derived(
    hasArtistLimitError || (artistsQuery.data?.items.length ?? 0) >= MAX_ARTISTS,
  );
  let issues = $derived(validationIssues(createArtistMutation.error));
  let nameIssues = $derived(fieldIssues(issues, 'name'));
  let personaIssues = $derived(fieldIssues(issues, 'persona'));
  let languageIssues = $derived(fieldIssues(issues, 'default_language'));
  let nameLength = $derived(codePointLength(name));
  let personaLength = $derived(codePointLength(persona));
  let nameConflict = $derived(
    studioError(createArtistMutation.error)?.error === 'artist_name_conflict',
  );
  let formTooLong = $derived(
    nameLength > STUDIO_LIMITS.artistName || personaLength > STUDIO_LIMITS.persona,
  );

  function selectKind(kind: ArtistKind) {
    if (persona.trim() === '' || (selectedKind !== null && persona === previousTemplate)) {
      persona = ARTIST_KIND_COPY[kind].template();
    }
    selectedKind = kind;
    previousTemplate = ARTIST_KIND_COPY[kind].template();
  }

  function handleChipKeydown(event: KeyboardEvent) {
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key))
      return;
    event.preventDefault();
    const buttons = Array.from(
      (event.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('[data-kind]'),
    );
    const active = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? buttons.length - 1
          : (active +
              (event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : -1) +
              buttons.length) %
            buttons.length;
    buttons[next]?.focus();
    selectKind(ARTIST_KINDS[next]);
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (artistLimitReached || createArtistMutation.isPending || !name.trim() || formTooLong) return;
    const session = pageSession.capture();
    const submittedName = name.trim();
    const defaultLanguage = language === 'other' ? otherLanguage.trim() : language;
    try {
      const artist = await createArtistMutation.mutateAsync({
        name: submittedName,
        persona: persona.trim() || null,
        ...(defaultLanguage ? { default_language: defaultLanguage } : {}),
      });
      const artistUrl = `${ROUTES.artists}/${artist.id}?compose=1`;
      if (!session.active) {
        addToast({
          type: 'success',
          message: m.artists_created_named({ name: submittedName }),
          action: { label: m.common_open(), href: artistUrl },
        });
        return;
      }
      await goto(artistUrl);
    } catch (error) {
      if (!session.active) {
        const message = artistCreateError(error);
        if (message) addToast({ type: 'error', message });
        return;
      }
      if (artistCreateError(error) === m.artists_limit_reached()) hasArtistLimitError = true;
    }
  }

  let formError = $derived(artistCreateError(createArtistMutation.error));
</script>

<svelte:head>
  <title>{m.artists_new_title()}</title>
</svelte:head>

<section class="mx-auto w-full max-w-3xl px-4 py-6 md:px-8 md:py-10">
  <a
    href={ROUTES.artists}
    class="mb-6 inline-flex items-center gap-2 text-sm font-medium text-text-muted hover:text-accent"
  >
    <ArrowLeft size={16} aria-hidden="true" />{m.artists_back_to_all()}
  </a>

  <div class="rounded-3xl border border-border bg-surface p-5 shadow-sm md:p-9">
    <p class="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
      {m.artists_setup_eyebrow()}
    </p>
    <h1 class="font-display text-3xl font-semibold tracking-tight text-text md:text-4xl">
      {m.artists_new_title()}
    </h1>
    <p class="mt-2 text-sm leading-6 text-text-muted">{m.artists_new_description()}</p>

    {#if artistsQuery.isPending}
      <div class="mt-6 flex items-center gap-3 text-sm text-text-muted" role="status">
        <Spinner size="sm" />{m.artists_checking_limit()}
      </div>
    {:else if artistLimitReached}
      <p
        class="mt-6 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-warning"
        role="alert"
      >
        {m.artists_limit_reached()}
      </p>
    {:else}
      <form class="mt-7 space-y-6" onsubmit={submit}>
        <fieldset>
          <legend class="mb-3 text-sm font-semibold text-text">{m.artists_kind_label()}</legend>
          <div
            role="radiogroup"
            tabindex="-1"
            aria-label={m.artists_kind_label()}
            class="flex flex-wrap gap-2"
            onkeydown={handleChipKeydown}
          >
            {#each ARTIST_KINDS as kind (kind)}
              <button
                type="button"
                role="radio"
                data-kind={kind}
                aria-checked={selectedKind === kind}
                class="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent {selectedKind ===
                kind
                  ? 'border-accent bg-accent-glow text-accent'
                  : 'border-border bg-bg text-text-muted hover:border-border-active hover:text-text'}"
                onclick={() => selectKind(kind)}
              >
                {#if selectedKind === kind}<Check size={14} aria-hidden="true" />{/if}
                {ARTIST_KIND_COPY[kind].label()}
              </button>
            {/each}
          </div>
        </fieldset>

        <div>
          <label for="artist-name" class="mb-2 block text-sm font-semibold text-text"
            >{m.artists_name_label()}</label
          >
          <input
            id="artist-name"
            bind:value={name}
            required
            autocomplete="off"
            placeholder={selectedKind
              ? ARTIST_KIND_COPY[selectedKind].namePlaceholder()
              : m.artists_name_placeholder()}
            aria-invalid={nameIssues.length > 0 ||
              nameConflict ||
              nameLength > STUDIO_LIMITS.artistName}
            aria-describedby={describedBy('artist-name', nameIssues, [
              ...(nameConflict ? ['artist-name-error'] : []),
              'artist-name-count',
            ])}
            class="w-full rounded-xl border border-border bg-bg px-4 py-3 text-sm text-text outline-none placeholder:text-text-dim focus:border-accent"
          />
          <p
            id="artist-name-count"
            class="mt-1.5 text-xs {nameLength > STUDIO_LIMITS.artistName
              ? 'text-danger'
              : 'text-text-dim'}"
          >
            {nameLength} / {STUDIO_LIMITS.artistName}
          </p>
          {#if nameConflict}
            <p id="artist-name-error" class="mt-1.5 text-xs text-danger" role="alert">
              {m.artists_name_conflict()}
            </p>
          {:else if nameIssues.length > 0}
            <ul class="mt-1.5 space-y-1 text-xs text-danger" role="alert">
              {#each nameIssues as issue, index (`${issue.path}-${index}`)}<li
                  id={issueId('artist-name', index)}
                >
                  {issueMessage(issue)}
                </li>{/each}
            </ul>
          {/if}
        </div>

        <div>
          <label for="artist-persona" class="mb-2 block text-sm font-semibold text-text"
            >{m.artists_persona_label()}</label
          >
          <textarea
            id="artist-persona"
            bind:value={persona}
            rows="5"
            aria-invalid={personaIssues.length > 0 || personaLength > STUDIO_LIMITS.persona}
            aria-describedby={describedBy('artist-persona', personaIssues, [
              'artist-persona-count',
            ])}
            placeholder={selectedKind
              ? ARTIST_KIND_COPY[selectedKind].template()
              : m.artists_persona_placeholder()}
            class="w-full resize-y rounded-xl border border-border bg-bg px-4 py-3 text-sm leading-6 text-text outline-none placeholder:text-text-dim focus:border-accent"
          ></textarea>
          <p
            id="artist-persona-count"
            class="mt-1.5 text-xs {personaLength > STUDIO_LIMITS.persona
              ? 'text-danger'
              : 'text-text-dim'}"
          >
            {personaLength} / {STUDIO_LIMITS.persona}
          </p>
          {#if personaIssues.length > 0}
            <ul class="mt-1.5 space-y-1 text-xs text-danger" role="alert">
              {#each personaIssues as issue, index (`${issue.path}-${index}`)}<li
                  id={issueId('artist-persona', index)}
                >
                  {issueMessage(issue)}
                </li>{/each}
            </ul>
          {/if}
        </div>

        <div>
          <label for="artist-language" class="mb-2 block text-sm font-semibold text-text"
            >{m.artists_language_label()}
            <span class="font-normal text-text-dim">({m.common_optional()})</span></label
          >
          <select
            id="artist-language"
            bind:value={language}
            class="w-full rounded-xl border border-border bg-bg px-4 py-3 text-sm text-text outline-none focus:border-accent"
          >
            <option value="">{m.artists_language_unspecified()}</option>
            <option value="en">{m.profile_language_en()}</option>
            <option value="ru">{m.profile_language_ru()}</option>
            <option value="sr">{m.profile_language_sr()}</option>
            <option value="other">{m.artists_language_other()}</option>
          </select>
          {#each languageIssues as issue, index (issue.path + '-' + index)}
            <p class="mt-1.5 text-xs text-danger" role="alert">{issueMessage(issue)}</p>
          {/each}
          {#if language === 'other'}
            <input
              class="mt-3 w-full rounded-xl border border-border bg-bg px-4 py-3 text-sm text-text outline-none placeholder:text-text-dim focus:border-accent"
              bind:value={otherLanguage}
              maxlength="35"
              placeholder={m.artists_language_custom_placeholder()}
              aria-label={m.artists_language_custom_label()}
            />
          {/if}
        </div>

        {#if formError}
          <p
            class="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger"
            role="alert"
          >
            {formError}
          </p>
        {/if}

        <button
          type="submit"
          disabled={createArtistMutation.isPending || artistLimitReached || formTooLong}
          class="w-full rounded-xl bg-accent px-5 py-3.5 text-sm font-semibold text-bg shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {createArtistMutation.isPending ? m.studio_saving() : m.artists_create_and_write()}
        </button>
      </form>
    {/if}
  </div>
</section>
