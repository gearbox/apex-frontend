<script lang="ts">
  import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import {
    artistsQueryOptions,
    createArtistMutationOptions,
    studioKeys,
  } from '$lib/queries/studio';
  import {
    createStudioProjectMutationOptions,
    StudioProjectSetupError,
  } from '$lib/queries/studioProjects';
  import { studioProject } from '$lib/studio/paths';
  import { codePointLength } from '$lib/studio/text';
  import { STUDIO_LIMITS } from '$lib/studio/limits';
  import {
    artistCreateError,
    studioError,
    validationIssues,
    fieldIssues,
    issueMessage,
    projectCreateError,
    describedBy,
    issueId,
  } from '$lib/studio/formErrors';
  import { componentSession } from '$lib/utils/sessionTracker';
  import { addToast } from '$lib/stores/toasts';
  import { ROUTES } from '$lib/utils/routes';
  import * as m from '$paraglide/messages';
  import Sheet from '$lib/components/shared/Sheet.svelte';
  import SheetActions from '$lib/components/shared/SheetActions.svelte';
  import type { components } from '$lib/api/types';
  const qc = useQueryClient();
  const artists = createQuery(artistsQueryOptions);
  const createArtist = createMutation(() => createArtistMutationOptions(qc));
  const mutation = createMutation(() => createStudioProjectMutationOptions(qc));
  const session = componentSession();
  let name = $state('');
  let concept = $state('');
  let release = $state<'single' | 'ep' | 'album'>('single');
  let artist = $state('');
  let existingId = $state<string | undefined>();
  let previousName = $state<string | undefined>();
  let artistSheetOpen = $state(false);
  let artistName = $state('');
  let artistForm = $state<HTMLFormElement | undefined>();
  type ArtistPage = components['schemas']['CursorPage_src.api.schemas.studio.ArtistOut_'];
  let artistIssues = $derived(fieldIssues(validationIssues(createArtist.error), 'name'));
  let artistNameLength = $derived(codePointLength(artistName));
  let artistNameTooLong = $derived(artistNameLength > STUDIO_LIMITS.artistName);
  let showArtistNameCount = $derived(artistNameLength > STUDIO_LIMITS.artistName * 0.8);
  let artistNameConflict = $derived(
    studioError(createArtist.error)?.error === 'artist_name_conflict',
  );
  let artistApiError = $derived(artistCreateError(createArtist.error));
  let artistLimitReached = $derived(
    (artists.data?.items.length ?? 0) >= STUDIO_LIMITS.artistsPerUser ||
      studioError(createArtist.error)?.error === 'artist_limit_reached',
  );
  let preselected = false;
  $effect(() => {
    const requested = $page.url.searchParams.get('artist');
    if (
      !preselected &&
      artists.data &&
      requested &&
      artists.data.items.some((item) => item.id === requested)
    ) {
      artist = requested;
      preselected = true;
    }
  });
  let issues = $derived(
    validationIssues(
      mutation.error instanceof StudioProjectSetupError ? mutation.error.cause : mutation.error,
    ),
  );
  let conflict = $derived(studioError(mutation.error)?.error === 'project_name_conflict');
  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (
      !name.trim() ||
      codePointLength(name) > STUDIO_LIMITS.projectName ||
      codePointLength(concept) > STUDIO_LIMITS.concept ||
      mutation.isPending
    )
      return;
    const captured = session.capture();
    const submittedName = name.trim();
    try {
      const project = await mutation.mutateAsync({
        name: submittedName,
        profile: {
          release_kind: release,
          artist_id: artist || null,
          concept: concept.trim() || null,
        },
        existingLibraryProjectId: existingId,
        previousName,
      });
      const url = studioProject(project.library_project_id);
      if (!captured.active) {
        addToast({
          type: 'success',
          message: m.studio_created({ name: submittedName }),
          durationMs: 8000,
          action: { label: m.common_open(), href: url },
        });
        return;
      }
      await goto(url);
    } catch (error) {
      if (!captured.active) {
        let message = projectCreateError(error);
        if (error instanceof StudioProjectSetupError) {
          message = [message, m.studio_project_in_library()].filter(Boolean).join(' ');
        }
        if (message) addToast({ type: 'error', message });
        return;
      }
      if (error instanceof StudioProjectSetupError) {
        existingId = error.libraryProjectId;
        previousName = submittedName;
      }
    }
  }
  function openArtistSheet() {
    artistName = '';
    createArtist.reset();
    artistSheetOpen = true;
  }
  function closeArtistSheet() {
    artistSheetOpen = false;
    artistName = '';
    createArtist.reset();
  }
  async function addArtist(event: SubmitEvent) {
    event.preventDefault();
    const submittedName = artistName.trim();
    if (!submittedName || artistNameTooLong || artistLimitReached || createArtist.isPending) return;
    try {
      const created = await createArtist.mutateAsync({ name: submittedName, persona: null });
      const current = qc.getQueryData<ArtistPage>(studioKeys.artists());
      qc.setQueryData<ArtistPage>(studioKeys.artists(), {
        ...(current ?? {
          limit: STUDIO_LIMITS.artistsPerUser,
          has_more: false,
          next_cursor: null,
        }),
        items: current?.items.some((item) => item.id === created.id)
          ? current.items
          : [...(current?.items ?? []), created],
      });
      const updated = qc.getQueryData<ArtistPage>(studioKeys.artists());
      if (updated?.items.some((item) => item.id === created.id)) artist = created.id;
      closeArtistSheet();
    } catch {
      // The mutation state supplies the field and form error below.
    }
  }
</script>

<section class="mx-auto max-w-3xl px-4 py-8">
  <a href={ROUTES.studio} class="text-accent">← {m.studio_back()}</a>
  <h1 class="mt-5 font-display text-3xl font-semibold">{m.studio_new_project()}</h1>
  <form class="mt-6 space-y-6 rounded-2xl border border-border bg-surface p-6" onsubmit={submit}>
    <label class="block"
      >{m.studio_name()}
      <input
        class="mt-2 w-full rounded-lg border border-border bg-bg p-3"
        bind:value={name}
        id="studio-project-name"
        aria-describedby={describedBy('studio-project-name', fieldIssues(issues, 'name'), [
          'studio-project-name-count',
          ...(conflict ? ['studio-project-name-conflict'] : []),
        ])}
        aria-invalid={conflict || fieldIssues(issues, 'name').length > 0}
        required
      /><span id="studio-project-name-count" class="block text-sm text-text-muted"
        >{codePointLength(name)}/{STUDIO_LIMITS.projectName}</span
      ></label
    >
    {#if conflict}<p id="studio-project-name-conflict" role="alert" class="text-danger">
        {m.studio_name_conflict()}
      </p>{/if}{#each fieldIssues(issues, 'name') as issue, index (index)}<p
        id={issueId('studio-project-name', index)}
        role="alert"
      >
        {issueMessage(issue)}
      </p>{/each}
    <fieldset>
      <legend>{m.studio_release()}</legend>
      <div class="mt-2 flex gap-4">
        {#each [{ id: 'single', label: m.studio_single() }, { id: 'ep', label: m.studio_ep() }, { id: 'album', label: m.studio_album() }] as option (option.id)}<label
            ><input type="radio" name="release" value={option.id} bind:group={release} />
            {option.label}</label
          >{/each}
      </div>
    </fieldset>
    <label class="block"
      >{m.studio_artists()}<select
        class="mt-2 w-full rounded-lg border border-border bg-bg p-3"
        bind:value={artist}
        ><option value="">{m.studio_no_artist()}</option
        >{#each artists.data?.items ?? [] as item (item.id)}<option value={item.id}
            >{item.name}</option
          >{/each}</select
      ></label
    ><button type="button" class="text-accent" onclick={openArtistSheet}
      >{m.studio_new_artist_link()}</button
    >
    <label class="block"
      >{m.studio_concept()}<textarea
        class="mt-2 w-full rounded-lg border border-border bg-bg p-3"
        rows="5"
        bind:value={concept}
        id="studio-project-concept"
        aria-describedby={describedBy('studio-project-concept', fieldIssues(issues, 'concept'), [
          'studio-project-concept-count',
        ])}
        aria-invalid={fieldIssues(issues, 'concept').length > 0}></textarea><span
        id="studio-project-concept-count"
        class="block text-sm text-text-muted"
        >{codePointLength(concept)}/{STUDIO_LIMITS.concept}</span
      ></label
    >{#each fieldIssues(issues, 'concept') as issue, index (index)}<p
        id={issueId('studio-project-concept', index)}
        role="alert"
      >
        {issueMessage(issue)}
      </p>{/each}
    {#if mutation.error && !conflict}<p role="alert" class="text-danger">
        {projectCreateError(mutation.error)}
      </p>{/if}
    <button
      class="rounded-xl bg-accent px-5 py-3 font-semibold text-bg"
      disabled={mutation.isPending ||
        !name.trim() ||
        codePointLength(name) > STUDIO_LIMITS.projectName ||
        codePointLength(concept) > STUDIO_LIMITS.concept}>{m.studio_create()}</button
    >
  </form>
</section>
{#if artistSheetOpen}<Sheet ariaLabel={m.studio_new_artist_link()} onclose={closeArtistSheet}
    ><form bind:this={artistForm} class="space-y-4 p-5" onsubmit={addArtist}>
      <h2 class="font-display text-xl font-semibold">{m.studio_new_artist_link()}</h2>
      <label class="block"
        >{m.artists_name_label()}<input
          id="studio-new-artist-name"
          class="mt-2 w-full rounded-lg border border-border bg-bg p-3"
          bind:value={artistName}
          autocomplete="off"
          required
          aria-invalid={artistNameTooLong ||
            artistNameConflict ||
            artistIssues.length > 0 ||
            !!artistApiError}
          aria-describedby={describedBy('studio-new-artist-name', artistIssues, [
            ...(showArtistNameCount ? ['studio-new-artist-name-count'] : []),
            ...(artistNameTooLong ? ['studio-new-artist-name-long'] : []),
            ...(artistNameConflict || artistApiError ? ['studio-new-artist-error'] : []),
          ])}
        /></label
      >{#if showArtistNameCount}<p
          id="studio-new-artist-name-count"
          class="text-sm text-text-muted"
        >
          {artistNameLength}/{STUDIO_LIMITS.artistName}
        </p>{/if}{#if artistNameTooLong}<p id="studio-new-artist-name-long" role="alert">
          {m.studio_issue_too_long()}
        </p>{/if}{#if artistNameConflict}<p id="studio-new-artist-error" role="alert">
          {m.artists_name_conflict()}
        </p>{:else if artistApiError}<p id="studio-new-artist-error" role="alert">
          {artistApiError}
        </p>{/if}{#each artistIssues as issue, index (index)}<p
          id={issueId('studio-new-artist-name', index)}
          role="alert"
        >
          {issueMessage(issue)}
        </p>{/each}
      {#if artistLimitReached && !artistApiError}<p role="alert">
          {m.artists_limit_reached()}
        </p>{/if}
      <p class="text-sm text-text-muted">{m.studio_artist_persona_later()}</p>
      <SheetActions
        primaryLabel={m.studio_create_artist()}
        pending={createArtist.isPending}
        primaryDisabled={artistLimitReached || !artistName.trim() || artistNameTooLong}
        oncancel={closeArtistSheet}
        onprimary={() => artistForm?.requestSubmit()}
      />
    </form></Sheet
  >{/if}
