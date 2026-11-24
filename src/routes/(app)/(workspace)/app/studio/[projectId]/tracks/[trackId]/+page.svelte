<script lang="ts">
  import { page } from '$app/stores';
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query';
  import { trackQueryOptions, renameTrackMutationOptions } from '$lib/queries/studioTracks';
  import type { components } from '$lib/api/types';
  import { codePointLength } from '$lib/studio/text';
  import { STUDIO_LIMITS } from '$lib/studio/limits';
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
  const rename = createMutation(() => renameTrackMutationOptions(qc));
  let editing = $state(false);
  let title = $state('');
  let error = $state('');
  let titleIssues = $derived(fieldIssues(validationIssues(rename.error), 'title'));
  let plan = $derived(track.data?.current_plan?.content);
  let lyrics = $derived(track.data?.current_lyrics?.content);
  let sections = $derived((plan?.sections ?? []) as Section[]);
  let lyricSections = $derived((lyrics?.sections ?? []) as LyricsSection[]);
  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (!title.trim() || codePointLength(title) > STUDIO_LIMITS.trackTitle) return;
    try {
      await rename.mutateAsync({ projectId, id, title: title.trim() });
      editing = false;
    } catch (e) {
      error = trackSaveError(e);
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
    </p>{:else if track.isLoadingError || !track.data}<p role="alert">
      {m.studio_loading_error()}
      <button onclick={() => void track.refetch()}>{m.studio_retry()}</button>
    </p>{:else}
    {#if editing}<form class="flex gap-2" onsubmit={save}>
        <label class="sr-only" for="track-title">{m.studio_rename()}</label><input
          id="track-title"
          class="rounded-lg border border-border bg-surface p-2"
          bind:value={title}
          oninput={() => rename.reset()}
          aria-describedby={describedBy('track-title', titleIssues)}
          aria-invalid={codePointLength(title) > STUDIO_LIMITS.trackTitle || titleIssues.length > 0}
        /><button
          class="text-accent"
          disabled={codePointLength(title) > STUDIO_LIMITS.trackTitle || !title.trim()}
          >{m.studio_save()}</button
        >
      </form>
      {#each titleIssues as issue, index (index)}<p id={issueId('track-title', index)} role="alert">
          {issueMessage(issue)}
        </p>{/each}
      {#if error}<p role="alert">{error}</p>{/if}{:else}<div class="flex items-center gap-4">
        <h1 class="font-display text-3xl">{track.data.title}</h1>
        <button
          class="text-accent"
          onclick={() => {
            title = track.data?.title ?? '';
            editing = true;
          }}>{m.studio_rename()}</button
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
