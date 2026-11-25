<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
  import {
    projectQueryOptions,
    updateProjectProfileMutationOptions,
    renameStudioProjectMutationOptions,
    disableStudioProjectMutationOptions,
  } from '$lib/queries/studioProjects';
  import { tracksQueryOptions } from '$lib/queries/studioTracks';
  import { artistsQueryOptions } from '$lib/queries/studio';
  import { addToast } from '$lib/stores/toasts';
  import { ROUTES } from '$lib/utils/routes';
  import { studioProject } from '$lib/studio/paths';
  import { codePointLength } from '$lib/studio/text';
  import { STUDIO_LIMITS } from '$lib/studio/limits';
  import {
    projectDisableError,
    projectSaveError,
    studioError,
    validationIssues,
    fieldIssues,
    describedBy,
    issueId,
    issueMessage,
  } from '$lib/studio/formErrors';
  import Sheet from '$lib/components/shared/Sheet.svelte';
  import SheetActions from '$lib/components/shared/SheetActions.svelte';
  import * as m from '$paraglide/messages';
  let id = $derived($page.params.projectId ?? '');
  const qc = useQueryClient();
  const project = createQuery(() => projectQueryOptions(id));
  const tracks = createQuery(() => tracksQueryOptions(id));
  const artists = createQuery(artistsQueryOptions);
  const rename = createMutation(() => renameStudioProjectMutationOptions(qc, id));
  const update = createMutation(() => updateProjectProfileMutationOptions(qc, id));
  const disable = createMutation(() => disableStudioProjectMutationOptions(qc, id));
  let name = $state('');
  let release = $state<'single' | 'ep' | 'album'>('single');
  let artist = $state('');
  let concept = $state('');
  let initialized = false;
  let error = $state('');
  let submitted = $state(false);
  let saved = $state(false);
  let saving = $state(false);
  let confirmRemove = $state(false);
  let nameIssues = $derived(fieldIssues(validationIssues(rename.error), 'name'));
  let conceptIssues = $derived(fieldIssues(validationIssues(update.error), 'concept'));
  let nameConflict = $derived(studioError(rename.error)?.error === 'project_name_conflict');
  let nameEmpty = $derived(submitted && !name.trim());
  let nameTooLong = $derived(submitted && codePointLength(name) > STUDIO_LIMITS.projectName);
  let conceptTooLong = $derived(submitted && codePointLength(concept) > STUDIO_LIMITS.concept);
  $effect(() => {
    if (!initialized && project.data) {
      name = project.data.name;
      release = project.data.release_kind;
      artist = project.data.artist_id ?? '';
      concept = project.data.concept ?? '';
      initialized = true;
    }
  });
  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (saving) return;
    submitted = true;
    const projectId = id;
    const snapshot = {
      name: name.trim(),
      profile: {
        release_kind: release,
        artist_id: artist || null,
        concept: concept.trim() || null,
      },
    };
    if (
      !snapshot.name ||
      codePointLength(snapshot.name) > STUDIO_LIMITS.projectName ||
      codePointLength(snapshot.profile.concept ?? '') > STUDIO_LIMITS.concept
    )
      return;
    saving = true;
    error = '';
    saved = false;
    try {
      let fullySaved = true;
      if (snapshot.name !== project.data?.name) {
        try {
          await rename.mutateAsync({ id: projectId, name: snapshot.name });
        } catch (e) {
          fullySaved = false;
          error = [m.studio_partial_name(), projectSaveError(e)].filter(Boolean).join(' ');
        }
      }
      try {
        await update.mutateAsync({
          id: projectId,
          profile: snapshot.profile,
        });
      } catch (e) {
        fullySaved = false;
        error = [error, m.studio_partial_profile(), projectSaveError(e)].filter(Boolean).join(' ');
      }
      saved = fullySaved && formMatches(snapshot);
    } finally {
      saving = false;
    }
  }
  function formMatches(snapshot: {
    name: string;
    profile: {
      release_kind: 'single' | 'ep' | 'album';
      artist_id: string | null;
      concept: string | null;
    };
  }) {
    return (
      name.trim() === snapshot.name &&
      release === snapshot.profile.release_kind &&
      (artist || null) === snapshot.profile.artist_id &&
      (concept.trim() || null) === snapshot.profile.concept
    );
  }
  async function remove() {
    if ((tracks.data?.length ?? 1) > 0) return;
    try {
      await disable.mutateAsync(id);
      confirmRemove = false;
      addToast({ type: 'success', message: m.studio_removed() });
      await goto(ROUTES.studio);
    } catch (e) {
      error = projectDisableError(e);
    }
  }
</script>

<section class="mx-auto max-w-3xl p-6">
  <a class="hidden text-accent md:inline" href={studioProject(id)}>← {m.studio_back()}</a>
  <h1 class="mt-4 font-display text-3xl">{m.studio_settings()}</h1>
  <form class="mt-6 space-y-5" onsubmit={save}>
    <label class="block"
      >{m.studio_name()}<input
        class="mt-2 w-full rounded-lg border border-border bg-surface p-3"
        id="settings-project-name"
        bind:value={name}
        oninput={() => {
          if (!rename.isPending) rename.reset();
          saved = false;
        }}
        aria-invalid={nameEmpty || nameTooLong || nameConflict || nameIssues.length > 0}
        aria-describedby={describedBy('settings-project-name', nameIssues, [
          'settings-project-name-count',
          ...(nameEmpty ? ['settings-project-name-empty'] : []),
          ...(nameTooLong ? ['settings-project-name-long'] : []),
          ...(nameConflict ? ['settings-project-name-conflict'] : []),
        ])}
      /><span id="settings-project-name-count" class="block text-sm text-text-muted"
        >{codePointLength(name)}/{STUDIO_LIMITS.projectName}</span
      ></label
    >
    {#if nameEmpty}<p id="settings-project-name-empty" role="alert">
        {m.studio_issue_empty()}
      </p>{/if}
    {#if nameTooLong}<p id="settings-project-name-long" role="alert">
        {m.studio_issue_too_long()}
      </p>{/if}
    {#if nameConflict}<p id="settings-project-name-conflict" role="alert">
        {m.studio_name_conflict()}
      </p>{/if}
    {#each nameIssues as issue, index (index)}<p
        id={issueId('settings-project-name', index)}
        role="alert"
      >
        {issueMessage(issue)}
      </p>{/each}
    <fieldset>
      <legend>{m.studio_release()}</legend>
      <div class="flex gap-4">
        {#each [{ id: 'single', label: m.studio_single() }, { id: 'ep', label: m.studio_ep() }, { id: 'album', label: m.studio_album() }] as option (option.id)}<label
            ><input
              type="radio"
              name="release"
              value={option.id}
              bind:group={release}
              onchange={() => (saved = false)}
            />
            {option.label}</label
          >{/each}
      </div>
    </fieldset>
    <label class="block"
      >{m.studio_artists()}<select
        class="mt-2 w-full rounded-lg border border-border bg-surface p-3"
        bind:value={artist}
        onchange={() => (saved = false)}
        ><option value="">{m.studio_no_artist()}</option
        >{#each artists.data?.items ?? [] as item (item.id)}<option value={item.id}
            >{item.name}</option
          >{/each}</select
      ></label
    ><label class="block"
      >{m.studio_concept()}<textarea
        class="mt-2 w-full rounded-lg border border-border bg-surface p-3"
        id="settings-project-concept"
        rows="6"
        bind:value={concept}
        oninput={() => {
          if (!update.isPending) update.reset();
          saved = false;
        }}
        aria-invalid={conceptTooLong || conceptIssues.length > 0}
        aria-describedby={describedBy('settings-project-concept', conceptIssues, [
          'settings-project-concept-count',
          ...(conceptTooLong ? ['settings-project-concept-long'] : []),
        ])}></textarea><span
        id="settings-project-concept-count"
        class="block text-sm text-text-muted"
        >{codePointLength(concept)}/{STUDIO_LIMITS.concept}</span
      ></label
    >
    {#if conceptTooLong}<p id="settings-project-concept-long" role="alert">
        {m.studio_issue_too_long()}
      </p>{/if}
    {#each conceptIssues as issue, index (index)}<p
        id={issueId('settings-project-concept', index)}
        role="alert"
      >
        {issueMessage(issue)}
      </p>{/each}
    {#if error}<p role="alert" class="text-danger">{error}</p>{/if}
    <div class="flex items-center gap-3">
      <button
        class="rounded-lg bg-accent px-4 py-2 text-bg"
        disabled={saving || rename.isPending || update.isPending}>{m.studio_save()}</button
      >
      {#if saved}<p class="text-sm text-success" role="status">{m.studio_saved()}</p>{/if}
    </div>
  </form>
  <div class="mt-10 border-t border-border pt-6">
    <button
      class="rounded-lg border border-danger px-4 py-2 text-danger disabled:opacity-50"
      disabled={!tracks.data || tracks.data.length > 0 || disable.isPending}
      onclick={() => (confirmRemove = true)}>{m.studio_remove()}</button
    >{#if tracks.data?.length}<p class="mt-2 text-sm text-text-muted">
        {m.studio_remove_tracks()}
      </p>{/if}
  </div>
</section>
{#if confirmRemove}<Sheet ariaLabel={m.studio_remove()} onclose={() => (confirmRemove = false)}
    ><div class="space-y-4 p-5">
      <p>{m.studio_confirm_remove()}</p>
      {#if error}<p role="alert" class="text-danger">{error}</p>{/if}
      <SheetActions
        primaryLabel={m.studio_remove()}
        primaryVariant="danger"
        pending={disable.isPending}
        oncancel={() => (confirmRemove = false)}
        onprimary={() => void remove()}
      />
    </div></Sheet
  >{/if}
