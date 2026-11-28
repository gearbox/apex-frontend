<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
  import { trackQueryOptions, renameTrackMutationOptions } from '$lib/queries/studioTracks';
  import { codePointLength } from '$lib/studio/text';
  import { STUDIO_LIMITS } from '$lib/studio/limits';
  import { studioProject, studioTrack, studioTrackEdit } from '$lib/studio/paths';
  import { ApiRequestError } from '$lib/api/errors';
  import { componentSession } from '$lib/utils/sessionTracker';
  import { addToast } from '$lib/stores/toasts';
  import TrackDocumentView from '$lib/components/studio/TrackDocumentView.svelte';
  import SunoExportSheet from '$lib/components/studio/SunoExportSheet.svelte';
  import { studioTrackHistory, studioTrackImport } from '$lib/studio/paths';
  import {
    trackSaveError,
    validationIssues,
    fieldIssues,
    describedBy,
    issueId,
    issueMessage,
  } from '$lib/studio/formErrors';
  import * as m from '$paraglide/messages';
  import { currentUser } from '$lib/stores/auth';
  import { songDraftStore } from '$lib/studio/songDraftStore';
  import { formatRelativeDate } from '$lib/utils/format';
  let id = $derived($page.params.trackId ?? '');
  let projectId = $derived($page.params.projectId ?? '');
  let userId = $derived($currentUser?.id ?? '');
  const track = createQuery(() => trackQueryOptions(id));
  const qc = useQueryClient();
  const rename = createMutation(() => renameTrackMutationOptions(qc, projectId));
  const pageSession = componentSession();
  let editing = $state(false);
  let title = $state('');
  let error = $state('');
  let renaming = $state(false);
  let titleInput = $state<HTMLInputElement | undefined>();
  let renameButton = $state<HTMLButtonElement | undefined>();
  let titleIssues = $derived(fieldIssues(validationIssues(rename.error), 'title'));
  let titleTooLong = $derived(codePointLength(title) > STUDIO_LIMITS.trackTitle);
  let plan = $derived(track.data?.current_plan?.content ?? null);
  let lyrics = $derived(track.data?.current_lyrics?.content ?? null);
  let exportOpen = $state(false);
  let localDraft = $state<{ savedAt: string } | null>(null);
  function readLocalDraft(): void {
    localDraft = userId && id ? songDraftStore.load(userId, id) : null;
  }
  $effect(() => {
    const currentId = id;
    const currentUserId = userId;
    if (currentId && currentUserId) readLocalDraft();
  });
  onMount(() => {
    const refresh = () => readLocalDraft();
    document.addEventListener('visibilitychange', refresh);
    return () => document.removeEventListener('visibilitychange', refresh);
  });
  $effect(() => {
    const loaded = track.data;
    if (loaded && loaded.library_project_id !== projectId) {
      void goto(studioTrack(loaded.library_project_id, id), { replaceState: true });
    }
  });
  async function startRename() {
    title = track.data?.title ?? '';
    error = '';
    if (!rename.isPending) rename.reset();
    editing = true;
    await tick();
    titleInput?.focus();
    titleInput?.select();
  }
  async function cancelRename() {
    editing = false;
    title = track.data?.title ?? '';
    error = '';
    if (!rename.isPending) rename.reset();
    await tick();
    renameButton?.focus();
  }
  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (!title.trim() || titleTooLong || renaming) return;
    const captured = pageSession.capture();
    const submittedTitle = title;
    renaming = true;
    try {
      await rename.mutateAsync({ id, title: submittedTitle.trim() });
      if (!captured.active) return;
      if (title === submittedTitle) await cancelRename();
    } catch (e) {
      if (!captured.active) {
        const message = trackSaveError(e);
        if (message) addToast({ type: 'error', message });
        return;
      }
      error = trackSaveError(e);
    } finally {
      renaming = false;
    }
  }
</script>

<section class="mx-auto max-w-3xl p-6">
  {#if track.isRefetchError}<p role="status" class="text-warning">
      {m.studio_refresh_error()}
      <button onclick={() => void track.refetch()}>{m.studio_retry()}</button>
    </p>{/if}
  {#if track.isPending}<p role="status">
      {m.common_loading()}
    </p>{:else if track.isLoadingError || !track.data}<div role="alert">
      {#if track.error instanceof ApiRequestError && track.error.status_code === 404}
        <h1 class="font-display text-2xl">{m.studio_track_not_found()}</h1>
        <a class="mt-3 inline-block text-accent" href={studioProject(projectId)}
          >{m.studio_back_to_project()}</a
        >
      {:else}
        <h1 class="font-display text-2xl">{m.studio_loading_error()}</h1>
        <button onclick={() => void track.refetch()}>{m.studio_retry()}</button>
      {/if}
    </div>{:else}
    {#if editing}<form class="flex flex-wrap items-center gap-2" onsubmit={save}>
        <h1 class="sr-only">{track.data.title}</h1>
        <label class="sr-only" for="track-title">{m.studio_rename()}</label><input
          bind:this={titleInput}
          id="track-title"
          class="rounded-lg border border-border bg-surface p-2"
          bind:value={title}
          oninput={() => {
            if (!rename.isPending) rename.reset();
            error = '';
          }}
          onkeydown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              void cancelRename();
            }
          }}
          aria-describedby={describedBy('track-title', titleIssues, [
            ...(titleTooLong ? ['track-title-too-long'] : []),
          ])}
          aria-invalid={titleTooLong || titleIssues.length > 0}
        /><button class="text-accent" disabled={titleTooLong || !title.trim() || renaming}
          >{m.studio_save()}</button
        >
        <button type="button" class="text-text-muted" onclick={() => void cancelRename()}
          >{m.common_cancel()}</button
        >
      </form>
      {#each titleIssues as issue, index (index)}<p id={issueId('track-title', index)} role="alert">
          {issueMessage(issue)}
        </p>{/each}
      {#if titleTooLong}<p role="alert" id="track-title-too-long">
          {m.studio_issue_too_long()}
        </p>{/if}
      {#if error}<p role="alert">{error}</p>{/if}{:else}<div class="flex items-center gap-4">
        <h1 class="font-display text-3xl">{track.data.title}</h1>
        <button bind:this={renameButton} class="text-accent" onclick={() => void startRename()}
          >{m.studio_rename()}</button
        >
      </div>{/if}
    <nav
      aria-label={m.studio_track_actions({ title: track.data.title })}
      class="mt-5 flex flex-wrap gap-2"
    >
      <a class="rounded-lg border border-border px-3 py-2" href={studioTrackEdit(projectId, id)}>
        {plan ? m.studio_editor_edit() : m.studio_editor_write_song()}
      </a>
      <button
        class="rounded-lg border border-border px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!plan}
        title={!plan ? m.studio_export_plan_required() : undefined}
        onclick={() => (exportOpen = true)}>{m.studio_export()}</button
      >
      <a class="rounded-lg border border-border px-3 py-2" href={studioTrackImport(projectId, id)}
        >{m.studio_import_from_suno()}</a
      >
      <a class="rounded-lg border border-border px-3 py-2" href={studioTrackHistory(projectId, id)}
        >{m.studio_history()}</a
      >
    </nav>
    {#if localDraft}
      <aside
        class="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4"
        aria-label={m.studio_editor_restore_banner()}
      >
        <p class="text-sm">
          {m.studio_editor_unsaved_banner({ time: formatRelativeDate(localDraft.savedAt) })}
        </p>
        <div class="flex gap-3">
          <a
            class="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-bg"
            href={studioTrackEdit(projectId, id)}>{m.studio_editor_continue()}</a
          >
          <button
            type="button"
            class="rounded-lg border border-border px-3 py-2 text-sm"
            onclick={() => {
              songDraftStore.remove(userId, id);
              localDraft = null;
            }}>{m.studio_editor_discard()}</button
          >
        </div>
      </aside>
    {/if}
    {#if !plan}
      <p class="mt-8 text-text-muted">
        {m.studio_no_plan()} ·
        <a class="text-accent underline" href={studioTrackImport(projectId, id)}
          >{m.studio_import_from_suno()}</a
        >
      </p>
    {:else}
      <div class="mt-8">
        <TrackDocumentView {plan} {lyrics} />
      </div>
    {/if}
    {#if exportOpen}
      <SunoExportSheet trackId={id} onclose={() => (exportOpen = false)} />
    {/if}
  {/if}
</section>
