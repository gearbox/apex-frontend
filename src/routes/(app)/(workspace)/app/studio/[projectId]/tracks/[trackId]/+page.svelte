<script lang="ts">
  import { tick } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
  import { trackQueryOptions, renameTrackMutationOptions } from '$lib/queries/studioTracks';
  import type { components } from '$lib/api/types';
  import { codePointLength } from '$lib/studio/text';
  import { STUDIO_LIMITS } from '$lib/studio/limits';
  import { studioProject, studioTrack } from '$lib/studio/paths';
  import { ApiRequestError } from '$lib/api/errors';
  import { componentSession } from '$lib/utils/sessionTracker';
  import { addToast } from '$lib/stores/toasts';
  import {
    trackSaveError,
    validationIssues,
    fieldIssues,
    describedBy,
    issueId,
    issueMessage,
  } from '$lib/studio/formErrors';
  import * as m from '$paraglide/messages';
  type Section = components['schemas']['PlanSection'];
  type LyricsSection = components['schemas']['LyricsSection'];
  type Line = components['schemas']['LyricLine'];
  let id = $derived($page.params.trackId ?? '');
  let projectId = $derived($page.params.projectId ?? '');
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
  let plan = $derived(track.data?.current_plan?.content);
  let lyrics = $derived(track.data?.current_lyrics?.content);
  let sections = $derived((plan?.sections ?? []) as Section[]);
  let lyricSections = $derived((lyrics?.sections ?? []) as LyricsSection[]);
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
    <div class="mt-8">
      <h2 class="font-display text-xl font-semibold">{m.studio_plan_chip()}</h2>
      {#if plan}<div class="mt-3 text-sm text-text-muted">
          {#if plan.tempo_bpm}{m.studio_tempo()}: {plan.tempo_bpm} BPM{/if}{#if plan.instrumental}
            · {m.studio_instrumental()}{/if}
        </div>
        <div class="mt-3 flex flex-wrap gap-2">
          {#each plan.global_style?.tags ?? [] as tag, index (index)}<span
              class="rounded-full bg-surface px-2 py-1 text-sm">{String(tag)}</span
            >{/each}
        </div>{:else}<p class="mt-3">{m.studio_no_plan()}</p>
        <p class="text-text-muted">{m.studio_coming_next()}</p>{/if}
    </div>
    <div class="mt-8">
      <h2 class="font-display text-xl font-semibold">{m.studio_lyrics_chip()}</h2>
      {#if !lyrics}<p class="mt-3">{m.studio_no_lyrics()}</p>
        <p class="text-text-muted">{m.studio_coming_next()}</p>{/if}
      {#each sections as section (section.id)}{@const entry = lyricSections.find(
          (item) => item.section_id === section.id,
        )}
        <div class="mt-6">
          <h3 class="font-semibold">{section.label || section.kind.replaceAll('_', ' ')}</h3>
          <div class="mt-2 flex flex-wrap gap-2">
            {#each section.delivery ?? [] as tag, index (index)}<span
                class="rounded-full bg-surface px-2 py-1 text-xs">{String(tag)}</span
              >{/each}{#each section.style?.tags ?? [] as tag, index (index)}<span
                class="rounded-full bg-surface px-2 py-1 text-xs">{String(tag)}</span
              >{/each}
          </div>
          {#if !section.instrumental && entry}{#each entry.lines as raw, lineIndex (lineIndex)}{@const line =
                raw as Line}
              <p class="mt-2 whitespace-pre-wrap">
                {line.text}
                {#each line.delivery ?? [] as tag, index (index)}<span
                    class="rounded-full bg-surface px-2 py-1 text-xs">{String(tag)}</span
                  >{/each}
              </p>{/each}{/if}
        </div>{/each}
    </div>
  {/if}
</section>
