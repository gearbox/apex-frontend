<script lang="ts">
  import { tick } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';
  import { MoreHorizontal } from '@lucide/svelte';
  import ContextMenu from '$lib/components/shared/ContextMenu.svelte';
  import Sheet from '$lib/components/shared/Sheet.svelte';
  import {
    tracksQueryOptions,
    createTrackMutationOptions,
    renameTrackMutationOptions,
    deleteTrackMutationOptions,
    reorderTracksMutationOptions,
  } from '$lib/queries/studioTracks';
  import { studioProject, studioTrack } from '$lib/studio/paths';
  import {
    trackCreateError,
    trackSaveError,
    trackDeleteError,
    trackReorderError,
    validationIssues,
    fieldIssues,
    issueMessage,
    describedBy,
    issueId,
  } from '$lib/studio/formErrors';
  import { codePointLength } from '$lib/studio/text';
  import { STUDIO_LIMITS } from '$lib/studio/limits';
  import { isDesktop } from '$lib/utils/breakpoints';
  import type { components } from '$lib/api/types';
  import * as m from '$paraglide/messages';
  type Track = components['schemas']['TrackOut'];
  let { projectId, instance = 'default' }: { projectId: string; instance?: string } = $props();
  let inputId = $derived(`new-track-${instance}`);
  const qc = useQueryClient();
  const query = createQuery(() => tracksQueryOptions(projectId));
  const create = createMutation(() => createTrackMutationOptions(qc));
  const rename = createMutation(() => renameTrackMutationOptions(qc));
  const remove = createMutation(() => deleteTrackMutationOptions(qc));
  const reorder = createMutation(() => reorderTracksMutationOptions(qc));
  let listElement: HTMLOListElement;
  let title = $state('');
  let edit = $state<Track | null>(null);
  let editTitle = $state('');
  let deleting = $state<Track | null>(null);
  let error = $state('');
  let tracks = $derived(query.data ?? []);
  let createIssues = $derived(fieldIssues(validationIssues(create.error), 'title'));
  let renameIssues = $derived(fieldIssues(validationIssues(rename.error), 'title'));
  function status(track: Track) {
    return track.current_lyrics_version_id
      ? m.studio_lyrics_chip()
      : track.current_plan_version_id
        ? m.studio_plan_chip()
        : m.studio_no_plan_chip();
  }
  async function add(event: SubmitEvent) {
    event.preventDefault();
    if (
      !title.trim() ||
      codePointLength(title) > STUDIO_LIMITS.trackTitle ||
      tracks.length >= STUDIO_LIMITS.tracksPerProject ||
      create.isPending
    )
      return;
    error = '';
    try {
      await create.mutateAsync({ projectId, title: title.trim() });
      title = '';
    } catch (e) {
      error = trackCreateError(e);
    }
  }
  async function move(index: number, delta: number) {
    const next = index + delta;
    if (next < 0 || next >= tracks.length || reorder.isPending) return;
    const ids = tracks.map((item) => item.id);
    const [id] = ids.splice(index, 1);
    ids.splice(next, 0, id);
    error = '';
    const promise = reorder.mutateAsync({ projectId, trackIds: ids });
    await tick();
    Array.from(listElement.querySelectorAll<HTMLElement>('[data-track-link]'))
      .find((element) => element.dataset.trackLink === id)
      ?.focus();
    try {
      await promise;
    } catch (e) {
      error = trackReorderError(e);
    } finally {
      await tick();
      Array.from(listElement.querySelectorAll<HTMLElement>('[data-track-link]'))
        .find((element) => element.dataset.trackLink === id)
        ?.focus();
    }
  }
  function menuItems(track: Track, index: number) {
    return [
      {
        label: m.studio_rename(),
        onclick: () => {
          edit = track;
          editTitle = track.title;
          error = '';
        },
      },
      {
        label: m.studio_move_up(),
        disabled: index === 0 || reorder.isPending,
        onclick: () => move(index, -1),
      },
      {
        label: m.studio_move_down(),
        disabled: index === tracks.length - 1 || reorder.isPending,
        onclick: () => move(index, 1),
      },
      {
        label: m.studio_delete(),
        variant: 'danger' as const,
        onclick: () => {
          deleting = track;
          error = '';
        },
      },
    ];
  }
  async function saveRename(event: SubmitEvent) {
    event.preventDefault();
    if (!edit || !editTitle.trim() || codePointLength(editTitle) > STUDIO_LIMITS.trackTitle) return;
    try {
      await rename.mutateAsync({ projectId, id: edit.id, title: editTitle.trim() });
      edit = null;
    } catch (e) {
      error = trackSaveError(e);
    }
  }
  async function deleteTrack() {
    if (!deleting) return;
    const id = deleting.id;
    try {
      await remove.mutateAsync({ projectId, id });
      deleting = null;
      if ($page.url.pathname === studioTrack(projectId, id)) await goto(studioProject(projectId));
    } catch (e) {
      error = trackDeleteError(e);
    }
  }
</script>

<div class="p-4">
  <h2 class="mb-4 font-display text-lg font-semibold">{m.studio_tracks()}</h2>
  {#if query.isRefetchError}<p role="status" class="text-warning">
      {m.studio_refresh_error()}
      <button onclick={() => void query.refetch()}>{m.studio_retry()}</button>
    </p>{/if}
  {#if query.isLoadingError}<p role="alert">
      {m.studio_loading_error()}
      <button onclick={() => void query.refetch()}>{m.studio_retry()}</button>
    </p>{/if}
  <ol bind:this={listElement} aria-label={m.studio_tracks()} class="space-y-1">
    {#each tracks as track, index (track.id)}
      <li class="flex items-center rounded-lg hover:bg-surface">
        {#if edit?.id === track.id && $isDesktop}
          <form class="flex min-w-0 flex-1 gap-1" onsubmit={saveRename}>
            <label class="sr-only" for={`rename-${track.id}`}>{m.studio_rename()}</label>
            <input
              id={`rename-${track.id}`}
              class="min-w-0 flex-1 rounded-lg border border-border bg-bg p-2"
              bind:value={editTitle}
              aria-invalid={renameIssues.length > 0}
              aria-describedby={describedBy(`rename-track-${instance}`, renameIssues)}
            />
            <button class="text-accent">{m.studio_save()}</button>
          </form>
        {:else}<a
            data-track-link={track.id}
            href={studioTrack(projectId, track.id)}
            aria-current={$page.url.pathname === studioTrack(projectId, track.id)
              ? 'page'
              : undefined}
            class="min-w-0 flex-1 rounded-lg px-2 py-3"
            onkeydown={(event) => {
              if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
                event.preventDefault();
                void move(index, event.key === 'ArrowUp' ? -1 : 1);
              }
            }}
            ><span class="mr-2 text-text-muted">{index + 1}</span>{track.title}<span
              class="ml-2 text-xs text-text-muted">{status(track)}</span
            ></a
          >
        {/if}
        <ContextMenu items={menuItems(track, index)}
          >{#snippet children(menu)}<button
              class="rounded-lg p-2"
              aria-label={`${track.title}: ${m.studio_settings()}`}
              aria-haspopup="menu"
              aria-expanded={menu.expanded}
              onclick={menu.toggle}><MoreHorizontal size={18} /></button
            >{/snippet}</ContextMenu
        >
      </li>
    {/each}
  </ol>
  <form class="mt-3" onsubmit={add}>
    <label class="sr-only" for={inputId}>{m.studio_new_track()}</label><input
      id={inputId}
      aria-invalid={createIssues.length > 0}
      aria-describedby={describedBy(inputId, createIssues)}
      class="w-full rounded-lg border border-border bg-bg p-2"
      placeholder={m.studio_new_track()}
      bind:value={title}
      disabled={tracks.length >= STUDIO_LIMITS.tracksPerProject}
    />
  </form>
  {#each createIssues as issue, index (index)}<p id={issueId(inputId, index)} role="alert">
      {issueMessage(issue)}
    </p>{/each}
  {#if edit && $isDesktop}{#each renameIssues as issue, index (index)}<p
        id={issueId(`rename-track-${instance}`, index)}
        role="alert"
      >
        {issueMessage(issue)}
      </p>{/each}{#if error}<p role="alert">{error}</p>{/if}{/if}
  {#if tracks.length >= STUDIO_LIMITS.tracksPerProject}<p class="mt-2 text-sm text-text-muted">
      {m.studio_track_limit()}
    </p>{/if}
  {#if error && !edit && !deleting}<p role="alert" class="mt-2 text-danger">{error}</p>{/if}
</div>
{#if edit && !$isDesktop}<Sheet
    ariaLabel={m.studio_rename()}
    onclose={() => {
      edit = null;
      error = '';
    }}
    ><form class="space-y-4 p-5" onsubmit={saveRename}>
      <label class="block"
        >{m.studio_rename()}<input
          class="mt-2 w-full rounded-lg border border-border bg-bg p-2"
          bind:value={editTitle}
          aria-invalid={renameIssues.length > 0}
          aria-describedby={describedBy(`rename-track-${instance}`, renameIssues)}
        /></label
      >{#each renameIssues as issue, index (index)}<p
          id={issueId(`rename-track-${instance}`, index)}
          role="alert"
        >
          {issueMessage(issue)}
        </p>{/each}{#if error}<p role="alert">{error}</p>{/if}<button
        class="rounded-lg bg-accent px-4 py-2 text-bg"
        disabled={rename.isPending}>{m.studio_save()}</button
      >
    </form></Sheet
  >{/if}
{#if deleting}<Sheet
    ariaLabel={m.studio_delete()}
    onclose={() => {
      deleting = null;
      error = '';
    }}
    ><div class="space-y-4 p-5">
      <p>{m.studio_delete_track_confirm({ title: deleting.title })}</p>
      {#if error}<p role="alert" class="text-danger">{error}</p>{/if}<button
        class="rounded-lg bg-danger px-4 py-2 text-white"
        disabled={remove.isPending}
        onclick={() => void deleteTrack()}>{m.studio_delete()}</button
      >
    </div></Sheet
  >{/if}
