<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';
  import {
    artistQueryOptions,
    deleteArtistMutationOptions,
    studioKeys,
    updateArtistMutationOptions,
  } from '$lib/queries/studio';
  import TagListInput from '$lib/components/shared/TagListInput.svelte';
  import ConfirmDeleteModal from '$lib/components/shared/ConfirmDeleteModal.svelte';
  import Spinner from '$lib/components/ui/Spinner.svelte';
  import { addToast } from '$lib/stores/toasts';
  import { fieldIssues, issueLabel, studioError, validationIssues } from '$lib/studio/formErrors';
  import { ROUTES } from '$lib/utils/routes';
  import type { components } from '$lib/api/types';
  import * as m from '$paraglide/messages';

  type Artist = components['schemas']['ArtistOut'];
  type ArtistPatch = components['schemas']['ArtistPatch'];

  const queryClient = useQueryClient();
  let artistId = $derived($page.params.id ?? '');
  const artistQuery = createQuery(() => ({ ...artistQueryOptions(artistId), enabled: !!artistId }));
  const updateMutation = createMutation(() => updateArtistMutationOptions(queryClient));
  const deleteMutation = createMutation(() => deleteArtistMutationOptions(queryClient));

  let loadedArtistId = $state('');
  let name = $state('');
  let persona = $state('');
  let voiceNotes = $state('');
  let defaultLanguage = $state('');
  let styleTags = $state<string[]>([]);
  let globalAvoid = $state<string[]>([]);
  let aestheticReferences = $state<string[]>([]);
  let showDelete = $state(false);
  let formMessage = $state('');
  let deleteMessage = $state('');

  $effect(() => {
    const artist = artistQuery.data;
    if (!artist || loadedArtistId === artist.id) return;
    loadedArtistId = artist.id;
    name = artist.name;
    persona = artist.persona ?? '';
    voiceNotes = artist.voice_notes ?? '';
    defaultLanguage = artist.default_language ?? '';
    styleTags = [...artist.style_tags];
    globalAvoid = [...artist.global_avoid];
    aestheticReferences = [...artist.aesthetic_references];
  });

  let issues = $derived(validationIssues(updateMutation.error));
  let nameIssues = $derived(fieldIssues(issues, 'name'));
  let personaIssues = $derived(fieldIssues(issues, 'persona'));
  let voiceIssues = $derived(fieldIssues(issues, 'voice_notes'));
  let tempoTags = $derived(
    styleTags.filter((tag) => {
      const match = tag.match(/^\s*(\d{2,3})\s*bpm\s*$/i);
      return match ? Number(match[1]) >= 40 && Number(match[1]) <= 240 : false;
    }),
  );

  function currentArtist(): Artist | undefined {
    return queryClient.getQueryData<Artist>(studioKeys.artist(artistId)) ?? artistQuery.data;
  }

  async function save(event: SubmitEvent) {
    event.preventDefault();
    const server = currentArtist();
    if (!server || updateMutation.isPending) return;
    formMessage = '';
    const patch: ArtistPatch = {};
    if (server.name !== name.trim()) patch.name = name.trim();
    if (server.persona !== (persona.trim() || null)) patch.persona = persona.trim() || null;
    if (server.voice_notes !== (voiceNotes.trim() || null))
      patch.voice_notes = voiceNotes.trim() || null;
    if (server.default_language !== (defaultLanguage.trim() || null)) {
      patch.default_language = defaultLanguage.trim() || null;
    }
    if (JSON.stringify(server.style_tags) !== JSON.stringify(styleTags))
      patch.style_tags = styleTags;
    if (JSON.stringify(server.global_avoid) !== JSON.stringify(globalAvoid))
      patch.global_avoid = globalAvoid;
    if (JSON.stringify(server.aesthetic_references) !== JSON.stringify(aestheticReferences)) {
      patch.aesthetic_references = aestheticReferences;
    }
    if (!Object.keys(patch).length) return;
    try {
      await updateMutation.mutateAsync({ id: artistId, patch });
      addToast({ type: 'success', message: m.common_save() });
    } catch (error) {
      const apiError = studioError(error);
      formMessage =
        apiError?.error === 'artist_name_conflict'
          ? m.artists_name_conflict()
          : apiError?.error === 'artist_limit_reached'
            ? m.artists_limit_reached()
            : m.artists_profile_save_error();
    }
  }

  async function removeArtist() {
    deleteMessage = '';
    try {
      await deleteMutation.mutateAsync(artistId);
      await goto(ROUTES.artists);
    } catch (error) {
      const apiError = studioError(error);
      if (apiError?.error === 'artist_in_use') {
        const detail = apiError.detail as { project_count?: number } | null;
        deleteMessage = m.artists_in_use({ count: String(detail?.project_count ?? 0) });
      } else {
        deleteMessage = m.artists_delete_error();
      }
      showDelete = false;
    }
  }
</script>

<svelte:head>
  <title>{m.artists_tab_profile()} — {m.artists_title()}</title>
</svelte:head>

{#if artistQuery.isPending}
  <div class="flex min-h-72 items-center justify-center" role="status">
    <Spinner size="xl" label={m.common_loading()} />
  </div>
{:else if artistQuery.isError || !artistQuery.data}
  <p class="rounded-xl border border-danger/30 bg-danger/10 p-4 text-sm text-danger" role="alert">
    {m.artists_not_found_description()}
  </p>
{:else}
  <div class="space-y-6">
    <form class="space-y-6 rounded-2xl border border-border bg-surface p-5 md:p-7" onsubmit={save}>
      <header>
        <h2 class="font-display text-xl font-semibold text-text">{m.artists_profile_heading()}</h2>
        <p class="mt-1 text-sm text-text-muted">{m.artists_profile_description()}</p>
      </header>

      <div>
        <label for="profile-name" class="mb-2 block text-sm font-semibold text-text"
          >{m.artists_name_label()}</label
        >
        <input
          id="profile-name"
          bind:value={name}
          maxlength="100"
          required
          aria-invalid={nameIssues.length > 0 ||
            studioError(updateMutation.error)?.error === 'artist_name_conflict'}
          class="w-full rounded-xl border border-border bg-bg px-4 py-3 text-sm text-text outline-none focus:border-accent"
        />
        {#if studioError(updateMutation.error)?.error === 'artist_name_conflict'}<p
            class="mt-1 text-xs text-danger"
            role="alert"
          >
            {m.artists_name_conflict()}
          </p>{/if}
        {#each nameIssues as issue, index (`${issue.path}-${index}`)}<p
            class="mt-1 text-xs text-danger"
            role="alert"
          >
            {issueLabel(issue)}
          </p>{/each}
      </div>

      <div>
        <label for="profile-persona" class="mb-2 block text-sm font-semibold text-text"
          >{m.artists_persona_label()}</label
        >
        <textarea
          id="profile-persona"
          bind:value={persona}
          maxlength="4000"
          rows="4"
          class="w-full resize-y rounded-xl border border-border bg-bg px-4 py-3 text-sm leading-6 text-text outline-none focus:border-accent"
        ></textarea>
        {#each personaIssues as issue, index (`${issue.path}-${index}`)}<p
            class="mt-1 text-xs text-danger"
            role="alert"
          >
            {issueLabel(issue)}
          </p>{/each}
      </div>

      <div>
        <label for="profile-voice" class="mb-2 block text-sm font-semibold text-text"
          >{m.artists_voice_notes_label()}</label
        >
        <textarea
          id="profile-voice"
          bind:value={voiceNotes}
          maxlength="2000"
          rows="3"
          class="w-full resize-y rounded-xl border border-border bg-bg px-4 py-3 text-sm leading-6 text-text outline-none focus:border-accent"
        ></textarea>
        {#each voiceIssues as issue, index (`${issue.path}-${index}`)}<p
            class="mt-1 text-xs text-danger"
            role="alert"
          >
            {issueLabel(issue)}
          </p>{/each}
      </div>

      <div>
        <label for="profile-language" class="mb-2 block text-sm font-semibold text-text"
          >{m.artists_language_label()}</label
        >
        <input
          id="profile-language"
          bind:value={defaultLanguage}
          maxlength="35"
          placeholder={m.artists_language_custom_placeholder()}
          class="w-full rounded-xl border border-border bg-bg px-4 py-3 text-sm text-text outline-none focus:border-accent"
        />
        {#each fieldIssues(issues, 'default_language') as issue, index (`${issue.path}-${index}`)}<p
            class="mt-1 text-xs text-danger"
            role="alert"
          >
            {issueLabel(issue)}
          </p>{/each}
      </div>

      <div class="grid gap-6 lg:grid-cols-2">
        <TagListInput
          id="profile-style-tags"
          label={m.artists_style_tags()}
          bind:values={styleTags}
          maxItems={40}
          maxLength={60}
          hint={m.artists_style_hint()}
        />
        <TagListInput
          id="profile-global-avoid"
          label={m.artists_global_avoid()}
          bind:values={globalAvoid}
          maxItems={40}
          maxLength={60}
          hint={m.artists_avoid_hint()}
        />
        <TagListInput
          id="profile-aesthetic-references"
          label={m.artists_aesthetic_references()}
          bind:values={aestheticReferences}
          maxItems={20}
          maxLength={200}
          hint={m.artists_aesthetic_hint()}
        />
      </div>
      {#if tempoTags.length > 0}
        <p
          class="rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-warning"
          role="alert"
        >
          {m.artists_reserved_tempo_tag({ tags: tempoTags.join(', ') })}
        </p>
      {/if}
      {#each issues.filter((issue) => !['name', 'persona', 'voice_notes', 'default_language'].includes(issue.path.split('[')[0])) as issue, index (`${issue.path}-${index}`)}
        <p class="text-xs text-danger" role="alert">
          {issue.path || 'form'}: {issue.code.replaceAll('_', ' ')}
        </p>
      {/each}
      {#if formMessage}<p
          class="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger"
          role="alert"
        >
          {formMessage}
        </p>{/if}

      <div class="flex justify-end border-t border-border pt-5">
        <button
          type="submit"
          disabled={updateMutation.isPending}
          class="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-bg disabled:opacity-50"
          >{updateMutation.isPending ? m.studio_saving() : m.common_save()}</button
        >
      </div>
    </form>

    <section class="rounded-2xl border border-danger/30 bg-surface p-5 md:p-7">
      <h2 class="font-display text-lg font-semibold text-danger">{m.artists_danger_heading()}</h2>
      <p class="mt-2 max-w-2xl text-sm leading-6 text-text-muted">{m.artists_delete_warning()}</p>
      {#if deleteMessage}<p
          class="mt-4 rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger"
          role="alert"
        >
          {deleteMessage}
        </p>{/if}
      <button
        type="button"
        class="mt-5 rounded-xl border border-danger px-4 py-2.5 text-sm font-semibold text-danger transition hover:bg-danger/10"
        onclick={() => (showDelete = true)}>{m.artists_delete_button()}</button
      >
    </section>
  </div>
{/if}

{#if showDelete}
  <ConfirmDeleteModal
    title={m.artists_delete_confirm_title()}
    message={m.artists_delete_confirm_copy({ name: artistQuery.data?.name ?? '' })}
    isPending={deleteMutation.isPending}
    onconfirm={removeArtist}
    oncancel={() => (showDelete = false)}
  />
{/if}
