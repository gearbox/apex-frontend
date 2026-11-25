<script lang="ts">
  import { tick } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';
  import { MoreHorizontal } from '@lucide/svelte';
  import ContextMenu from '$lib/components/shared/ContextMenu.svelte';
  import Sheet from '$lib/components/shared/Sheet.svelte';
  import SheetActions from '$lib/components/shared/SheetActions.svelte';
  import {
    tracksQueryOptions,
    createTrackMutationOptions,
    renameTrackMutationOptions,
    deleteTrackMutationOptions,
    reorderTracksMutationOptions,
  } from '$lib/queries/studioTracks';
  import { studioProject, studioTrack } from '$lib/studio/paths';
  import { addToast } from '$lib/stores/toasts';
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
  let tooLongId = $derived(`${inputId}-too-long`);
  let countId = $derived(`${inputId}-count`);
  const qc = useQueryClient();
  const query = createQuery(() => tracksQueryOptions(projectId));
  const create = createMutation(() => createTrackMutationOptions(qc, projectId));
  const rename = createMutation(() => renameTrackMutationOptions(qc, projectId));
  const remove = createMutation(() => deleteTrackMutationOptions(qc, projectId));
  const reorder = createMutation(() => reorderTracksMutationOptions(qc, projectId));
  let listElement: HTMLOListElement;
  let title = $state('');
  let edit = $state<Track | null>(null);
  let editTitle = $state('');
  let renameInput = $state<HTMLInputElement | undefined>();
  let renameForm = $state<HTMLFormElement | undefined>();
  let deleting = $state<Track | null>(null);
  let error = $state('');
  let renaming = $state(false);
  let tracks = $derived(query.data ?? []);
  let createIssues = $derived(fieldIssues(validationIssues(create.error), 'title'));
  let renameIssues = $derived(fieldIssues(validationIssues(rename.error), 'title'));
  let createTooLong = $derived(codePointLength(title) > STUDIO_LIMITS.trackTitle);
  let showCreateCount = $derived(codePointLength(title) > STUDIO_LIMITS.trackTitle * 0.8);
  let renameTooLong = $derived(codePointLength(editTitle) > STUDIO_LIMITS.trackTitle);
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
      createTooLong ||
      tracks.length >= STUDIO_LIMITS.tracksPerProject ||
      create.isPending
    )
      return;
    error = '';
    const submittedTitle = title;
    try {
      await create.mutateAsync({ projectId, title: submittedTitle.trim() });
      if (title === submittedTitle) title = '';
    } catch (e) {
      error = trackCreateError(e);
    }
  }
  async function focusMenu(trackId: string) {
    await tick();
    Array.from(listElement.querySelectorAll<HTMLButtonElement>('[data-track-menu]'))
      .find((element) => element.dataset.trackMenu === trackId)
      ?.focus();
  }
  async function closeRename(trackId = edit?.id) {
    edit = null;
    editTitle = '';
    error = '';
    if (!rename.isPending) rename.reset();
    if (trackId) await focusMenu(trackId);
  }
  async function openRename(track: Track) {
    edit = track;
    editTitle = track.title;
    error = '';
    if (!rename.isPending) rename.reset();
    if ($isDesktop) {
      await tick();
      renameInput?.focus();
      renameInput?.select();
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
        onclick: () => void openRename(track),
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
    if (!edit || !editTitle.trim() || renameTooLong || renaming) return;
    const trackId = edit.id;
    const trackTitle = edit.title;
    const submittedTitle = editTitle;
    renaming = true;
    try {
      await rename.mutateAsync({ projectId, id: trackId, title: submittedTitle.trim() });
      if (edit?.id === trackId && editTitle === submittedTitle) await closeRename(trackId);
    } catch (e) {
      const message = trackSaveError(e);
      if (edit?.id !== trackId) {
        if (message) {
          addToast({
            type: 'error',
            message: [m.studio_track_rename_failed({ title: trackTitle }), message]
              .filter(Boolean)
              .join(' '),
          });
        }
        return;
      }
      error = message;
    } finally {
      renaming = false;
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
              bind:this={renameInput}
              id={`rename-${track.id}`}
              class="min-w-0 flex-1 rounded-lg border border-border bg-bg p-2"
              bind:value={editTitle}
              onkeydown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  void closeRename(track.id);
                }
              }}
              aria-invalid={renameTooLong || renameIssues.length > 0}
              aria-describedby={describedBy(`rename-track-${instance}`, renameIssues, [
                ...(renameTooLong ? [`rename-track-${instance}-too-long`] : []),
              ])}
            />
            <button class="text-accent" disabled={renaming || renameTooLong}
              >{m.studio_save()}</button
            >
            <button type="button" class="text-text-muted" onclick={() => void closeRename(track.id)}
              >{m.common_cancel()}</button
            >
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
              data-track-menu={track.id}
              aria-label={m.studio_track_actions({ title: track.title })}
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
      aria-invalid={createTooLong || createIssues.length > 0}
      aria-describedby={describedBy(inputId, createIssues, [
        ...(showCreateCount ? [countId] : []),
        ...(createTooLong ? [tooLongId] : []),
      ])}
      class="w-full rounded-lg border border-border bg-bg p-2"
      placeholder={m.studio_new_track()}
      bind:value={title}
      disabled={tracks.length >= STUDIO_LIMITS.tracksPerProject}
    />
  </form>
  {#if showCreateCount}<p id={countId} class="mt-1 text-xs text-text-muted">
      {codePointLength(title)}/{STUDIO_LIMITS.trackTitle}
    </p>{/if}
  {#if createTooLong}<p id={tooLongId} role="alert" class="mt-1 text-sm text-danger">
      {m.studio_issue_too_long()}
    </p>{/if}
  {#each createIssues as issue, index (index)}<p id={issueId(inputId, index)} role="alert">
      {issueMessage(issue)}
    </p>{/each}
  {#if edit && $isDesktop}{#if renameTooLong}<p
        id={`rename-track-${instance}-too-long`}
        role="alert"
        class="text-sm text-danger"
      >
        {m.studio_issue_too_long()}
      </p>{/if}{#each renameIssues as issue, index (index)}<p
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
{#if edit && !$isDesktop}<Sheet ariaLabel={m.studio_rename()} onclose={() => void closeRename()}
    ><form bind:this={renameForm} class="space-y-4 p-5" onsubmit={saveRename}>
      <label class="block"
        >{m.studio_rename()}<input
          class="mt-2 w-full rounded-lg border border-border bg-bg p-2"
          bind:value={editTitle}
          aria-invalid={renameTooLong || renameIssues.length > 0}
          aria-describedby={describedBy(`rename-track-${instance}`, renameIssues, [
            ...(renameTooLong ? [`rename-track-${instance}-too-long`] : []),
          ])}
        /></label
      >{#if renameTooLong}<p id={`rename-track-${instance}-too-long`} role="alert">
          {m.studio_issue_too_long()}
        </p>{/if}{#each renameIssues as issue, index (index)}<p
          id={issueId(`rename-track-${instance}`, index)}
          role="alert"
        >
          {issueMessage(issue)}
        </p>{/each}{#if error}<p role="alert">{error}</p>{/if}
      <SheetActions
        primaryLabel={m.studio_save()}
        pending={renaming}
        primaryDisabled={renameTooLong || !editTitle.trim()}
        oncancel={() => void closeRename()}
        onprimary={() => renameForm?.requestSubmit()}
      />
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
      {#if error}<p role="alert" class="text-danger">{error}</p>{/if}
      <SheetActions
        primaryLabel={m.studio_delete()}
        primaryVariant="danger"
        pending={remove.isPending}
        oncancel={() => {
          deleting = null;
          error = '';
        }}
        onprimary={() => void deleteTrack()}
      />
    </div></Sheet
  >{/if}
