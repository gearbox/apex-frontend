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
  import { projectDisableError, projectSaveError } from '$lib/studio/formErrors';
  import * as m from '$paraglide/messages';
  let id = $derived($page.params.projectId ?? '');
  const qc = useQueryClient();
  const project = createQuery(() => projectQueryOptions(id));
  const tracks = createQuery(() => tracksQueryOptions(id));
  const artists = createQuery(artistsQueryOptions);
  const rename = createMutation(() => renameStudioProjectMutationOptions(qc));
  const update = createMutation(() => updateProjectProfileMutationOptions(qc));
  const disable = createMutation(() => disableStudioProjectMutationOptions(qc));
  let name = $state('');
  let originalName = $state('');
  let release = $state<'single' | 'ep' | 'album'>('single');
  let artist = $state('');
  let concept = $state('');
  let initialized = false;
  let error = $state('');
  $effect(() => {
    if (!initialized && project.data) {
      name = originalName = project.data.name;
      release = project.data.release_kind;
      artist = project.data.artist_id ?? '';
      concept = project.data.concept ?? '';
      initialized = true;
    }
  });
  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (
      !name.trim() ||
      codePointLength(name) > STUDIO_LIMITS.projectName ||
      codePointLength(concept) > STUDIO_LIMITS.concept
    )
      return;
    error = '';
    if (name.trim() !== originalName) {
      try {
        await rename.mutateAsync({ id, name: name.trim() });
        originalName = name.trim();
      } catch (e) {
        error = [m.studio_partial_name(), projectSaveError(e)].filter(Boolean).join(' ');
      }
    }
    try {
      await update.mutateAsync({
        id,
        profile: {
          release_kind: release,
          artist_id: artist || null,
          concept: concept.trim() || null,
        },
      });
    } catch (e) {
      error = [error, m.studio_partial_profile(), projectSaveError(e)].filter(Boolean).join(' ');
    }
  }
  async function remove() {
    if ((tracks.data?.length ?? 1) > 0 || !window.confirm(m.studio_confirm_remove())) return;
    try {
      await disable.mutateAsync(id);
      addToast({ type: 'success', message: m.studio_removed() });
      await goto(ROUTES.studio);
    } catch (e) {
      error = projectDisableError(e);
    }
  }
</script>

<section class="mx-auto max-w-3xl p-6">
  <a class="text-accent" href={studioProject(id)}>← {m.studio_back()}</a>
  <h1 class="mt-4 font-display text-3xl">{m.studio_settings()}</h1>
  <form class="mt-6 space-y-5" onsubmit={save}>
    <label class="block"
      >{m.studio_name()}<input
        class="mt-2 w-full rounded-lg border border-border bg-surface p-3"
        bind:value={name}
        required
      /></label
    >
    <fieldset>
      <legend>{m.studio_release()}</legend>
      <div class="flex gap-4">
        {#each [{ id: 'single', label: m.studio_single() }, { id: 'ep', label: m.studio_ep() }, { id: 'album', label: m.studio_album() }] as option (option.id)}<label
            ><input type="radio" name="release" value={option.id} bind:group={release} />
            {option.label}</label
          >{/each}
      </div>
    </fieldset>
    <label class="block"
      >{m.studio_artists()}<select
        class="mt-2 w-full rounded-lg border border-border bg-surface p-3"
        bind:value={artist}
        ><option value="">{m.studio_no_artist()}</option
        >{#each artists.data?.items ?? [] as item (item.id)}<option value={item.id}
            >{item.name}</option
          >{/each}</select
      ></label
    ><label class="block"
      >{m.studio_concept()}<textarea
        class="mt-2 w-full rounded-lg border border-border bg-surface p-3"
        rows="6"
        bind:value={concept}></textarea></label
    >{#if error}<p role="alert" class="text-danger">{error}</p>{/if}<button
      class="rounded-lg bg-accent px-4 py-2 text-bg"
      disabled={rename.isPending || update.isPending}>{m.studio_save()}</button
    >
  </form>
  <div class="mt-10 border-t border-border pt-6">
    <button
      class="rounded-lg border border-danger px-4 py-2 text-danger disabled:opacity-50"
      disabled={!tracks.data || tracks.data.length > 0 || disable.isPending}
      onclick={() => void remove()}>{m.studio_remove()}</button
    >{#if tracks.data?.length}<p class="mt-2 text-sm text-text-muted">
        {m.studio_remove_tracks()}
      </p>{/if}
  </div>
</section>
