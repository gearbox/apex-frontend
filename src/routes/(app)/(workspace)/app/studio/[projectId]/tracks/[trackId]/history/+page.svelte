<script lang="ts">
  import { onDestroy } from 'svelte';
  import { page } from '$app/stores';
  import {
    createInfiniteQuery,
    createMutation,
    createQuery,
    useIsMutating,
    useQueryClient,
  } from '@tanstack/svelte-query';
  import { ApiRequestError } from '$lib/api/errors';
  import Sheet from '$lib/components/shared/Sheet.svelte';
  import SheetActions from '$lib/components/shared/SheetActions.svelte';
  import InfiniteScrollSentinel from '$lib/components/shared/InfiniteScrollSentinel.svelte';
  import TrackDocumentView from '$lib/components/studio/TrackDocumentView.svelte';
  import SunoExportSheet from '$lib/components/studio/SunoExportSheet.svelte';
  import { setCurrentError, versionDeleteError } from '$lib/studio/formErrors';
  import { createSessionTracker } from '$lib/utils/sessionTracker';
  import { formatRelativeDate } from '$lib/utils/format';
  import { isDesktop } from '$lib/utils/breakpoints';
  import { trackQueryOptions } from '$lib/queries/studioTracks';
  import {
    deleteVersionMutationOptions,
    setCurrentMutationOptions,
    versionQueryOptions,
    versionsInfiniteQueryOptions,
  } from '$lib/queries/studioVersions';
  import { studioMutationKeys } from '$lib/queries/studioTracks';
  import { addToast } from '$lib/stores/toasts';
  import type { components } from '$lib/api/types';
  import * as m from '$paraglide/messages';

  type VersionSummary = components['schemas']['VersionSummary'];
  type PlanVersion = components['schemas']['PlanVersionDetail'];
  type LyricsVersion = components['schemas']['LyricsVersionDetail'];
  type ConfirmAction =
    | { kind: 'make-plan-without-lyrics'; versionId: string }
    | { kind: 'switch-plan-with-lyrics'; versionId: string; planId: string; planNumber: number }
    | { kind: 'detach-lyrics'; versionId: string }
    | { kind: 'delete'; versionId: string; versionNumber: number };
  let projectId = $derived($page.params.projectId ?? '');
  let trackId = $derived($page.params.trackId ?? '');
  const qc = useQueryClient();
  const track = createQuery(() => trackQueryOptions(trackId));
  const planVersionsQuery = createInfiniteQuery(() =>
    versionsInfiniteQueryOptions(trackId, 'plan'),
  );
  const lyricsVersionsQuery = createInfiniteQuery(() =>
    versionsInfiniteQueryOptions(trackId, 'lyrics'),
  );
  const setCurrent = createMutation(() => setCurrentMutationOptions(qc, projectId, trackId));
  const remove = createMutation(() => deleteVersionMutationOptions(qc, projectId, trackId));
  const writeCount = useIsMutating({
    get mutationKey() {
      return studioMutationKeys.trackDocuments(trackId);
    },
    exact: true,
  });
  const viewerSession = createSessionTracker();
  const planVersions = $derived(planVersionsQuery.data?.pages.flatMap((page) => page.items) ?? []);
  const lyricsVersions = $derived(
    lyricsVersionsQuery.data?.pages.flatMap((page) => page.items) ?? [],
  );
  let selectedKind = $state<'plan' | 'lyrics'>('plan');
  let selectedVersionId = $state('');
  let showMobileViewer = $state(false);
  let confirmAction = $state<ConfirmAction | null>(null);
  let actionError = $state('');
  let exportOpen = $state(false);
  let viewerQuery = createQuery(() => ({
    ...versionQueryOptions(selectedVersionId),
    enabled: !!selectedVersionId,
  }));
  let viewer = $derived(viewerQuery.data);
  let viewerIsCurrent = $derived(
    viewer?.kind === 'plan'
      ? track.data?.current_plan_version_id === viewer.id
      : viewer?.kind === 'lyrics'
        ? track.data?.current_lyrics_version_id === viewer.id
        : false,
  );
  let basePlanQuery = createQuery(() => ({
    ...versionQueryOptions(viewer?.kind === 'lyrics' ? viewer.based_on_plan_version_id : ''),
    enabled: viewer?.kind === 'lyrics',
  }));
  let loadedPlanById = $derived(
    new Map(planVersions.map((item) => [item.id, item.version_number])),
  );

  onDestroy(() => viewerSession.invalidate());

  function selectVersion(version: VersionSummary, mobile: boolean) {
    viewerSession.invalidate();
    selectedVersionId = version.id;
    confirmAction = null;
    actionError = '';
    showMobileViewer = mobile;
  }

  async function makeVersionCurrent(version: PlanVersion | LyricsVersion) {
    actionError = '';
    const captured = viewerSession.capture();
    if (version.kind === 'plan') {
      try {
        await setCurrent.mutateAsync({ plan: version.id });
        if (!captured.active) {
          addToast({ type: 'success', message: m.studio_saved() });
          return;
        }
        addToast({ type: 'success', message: m.studio_saved() });
      } catch (error) {
        if (!captured.active) {
          const message = setCurrentError(error);
          if (message) addToast({ type: 'error', message });
          return;
        }
        if (error instanceof ApiRequestError && error.error === 'lyrics_incompatible_with_plan') {
          confirmAction = { kind: 'make-plan-without-lyrics', versionId: version.id };
        } else actionError = setCurrentError(error);
      }
      return;
    }
    if (version.based_on_plan_version_id === track.data?.current_plan_version_id) {
      try {
        await setCurrent.mutateAsync({ lyrics: version.id });
        addToast({ type: 'success', message: m.studio_saved() });
      } catch (error) {
        const message = setCurrentError(error);
        if (!captured.active) {
          if (message) addToast({ type: 'error', message });
          return;
        }
        actionError = message;
      }
    } else {
      const baseNumber =
        basePlanQuery.data?.kind === 'plan'
          ? basePlanQuery.data.version_number
          : loadedPlanById.get(version.based_on_plan_version_id);
      confirmAction = {
        kind: 'switch-plan-with-lyrics',
        versionId: version.id,
        planId: version.based_on_plan_version_id,
        planNumber: baseNumber ?? 0,
      };
    }
  }

  async function confirmActionNow() {
    const action = confirmAction;
    if (!action) return;
    const captured = viewerSession.capture();
    actionError = '';
    try {
      if (action.kind === 'make-plan-without-lyrics')
        await setCurrent.mutateAsync({ plan: action.versionId, lyrics: null });
      else if (action.kind === 'switch-plan-with-lyrics')
        await setCurrent.mutateAsync({ plan: action.planId, lyrics: action.versionId });
      else if (action.kind === 'detach-lyrics') await setCurrent.mutateAsync({ lyrics: null });
      else await remove.mutateAsync({ id: action.versionId });
      if (!captured.active) {
        addToast({ type: 'success', message: m.studio_saved() });
        return;
      }
      confirmAction = null;
      addToast({
        type: 'success',
        message: action.kind === 'delete' ? m.studio_history_delete() : m.studio_saved(),
      });
      if (action.kind === 'delete') selectedVersionId = '';
    } catch (error) {
      const message = action.kind === 'delete' ? versionDeleteError(error) : setCurrentError(error);
      if (!captured.active) {
        if (message) addToast({ type: 'error', message });
        return;
      }
      actionError = message;
      confirmAction = null;
    }
  }

  function openDetachLyrics(version: LyricsVersion) {
    confirmAction = { kind: 'detach-lyrics', versionId: version.id };
  }

  function openDelete(version: PlanVersion | LyricsVersion) {
    confirmAction = {
      kind: 'delete',
      versionId: version.id,
      versionNumber: version.version_number,
    };
  }

  function originLabel(origin: VersionSummary['origin']): string {
    if (origin === 'import') return m.studio_history_imported();
    if (origin === 'llm') return m.studio_history_ai();
    return m.studio_history_typed();
  }

  function renderList(
    kind: 'plan' | 'lyrics',
    items: VersionSummary[],
    query: typeof planVersionsQuery,
  ) {
    return { kind, items, query };
  }

  let confirmTitle = $derived(
    confirmAction?.kind === 'make-plan-without-lyrics'
      ? m.studio_history_plan_incompatible()
      : confirmAction?.kind === 'switch-plan-with-lyrics'
        ? m.studio_history_switch_plan({ version: String(confirmAction.planNumber) })
        : confirmAction?.kind === 'detach-lyrics'
          ? m.studio_history_detach_confirm()
          : confirmAction?.kind === 'delete'
            ? m.studio_history_delete_confirm({ version: String(confirmAction.versionNumber) })
            : '',
  );
</script>

<svelte:head><title>{m.studio_history_title()}</title></svelte:head>

<main class="p-4 md:p-8">
  {#if track.isPending}
    <p role="status">{m.common_loading()}</p>
  {:else if track.isLoadingError || !track.data}
    <div role="alert">
      <h1 class="font-display text-2xl">{m.studio_loading_error()}</h1>
      <button class="mt-3 text-accent" onclick={() => void track.refetch()}
        >{m.studio_retry()}</button
      >
    </div>
  {:else}
    <h1 class="font-display text-2xl font-semibold md:text-3xl">{m.studio_history_title()}</h1>
    {#if track.isRefetchError}<p role="status" class="mt-3 text-warning">
        {m.studio_refresh_error()}
      </p>{/if}
    <div class="mt-5 flex gap-2 md:hidden" role="group" aria-label={m.studio_history_title()}>
      <button
        class="rounded-full border px-4 py-2"
        aria-pressed={selectedKind === 'plan'}
        onclick={() => (selectedKind = 'plan')}>{m.studio_history_plan()}</button
      >
      <button
        class="rounded-full border px-4 py-2"
        aria-pressed={selectedKind === 'lyrics'}
        onclick={() => (selectedKind = 'lyrics')}>{m.studio_history_lyrics()}</button
      >
    </div>
    <div class="mt-6 grid gap-6 md:grid-cols-2">
      {#each [renderList('plan', planVersions, planVersionsQuery), renderList('lyrics', lyricsVersions, lyricsVersionsQuery)] as list (list.kind)}
        <section
          class:hidden={!$isDesktop && selectedKind !== list.kind}
          aria-labelledby={`history-${list.kind}`}
        >
          <h2 id={`history-${list.kind}`} class="font-display text-lg font-semibold">
            {list.kind === 'plan' ? m.studio_history_plan() : m.studio_history_lyrics()}
          </h2>
          {#if list.query.isRefetchError && list.items.length}
            <p role="status" class="mt-2 text-sm text-warning">{m.studio_refresh_error()}</p>
          {/if}
          {#if list.query.isLoadingError && !list.items.length}
            <p role="alert" class="mt-3">{m.studio_loading_error()}</p>
            <button class="mt-2 text-accent" onclick={() => void list.query.refetch()}
              >{m.studio_retry()}</button
            >
          {:else if !list.items.length}
            <p class="mt-3 text-sm text-text-muted">{m.studio_history_empty()}</p>
          {:else}
            <ol class="mt-3 space-y-2">
              {#each list.items as version (version.id)}
                {@const parentVersion = list.items.find(
                  (item) => item.id === version.parent_version_id,
                )}
                {@const baseNumber = version.based_on_plan_version_id
                  ? loadedPlanById.get(version.based_on_plan_version_id)
                  : undefined}
                <li>
                  <button
                    class="w-full rounded-xl border border-border p-3 text-left hover:bg-surface {selectedVersionId ===
                    version.id
                      ? 'border-accent'
                      : ''}"
                    aria-pressed={selectedVersionId === version.id}
                    onclick={() => selectVersion(version, !$isDesktop)}
                  >
                    <span class="flex flex-wrap items-center gap-2">
                      <strong>v{version.version_number}</strong>
                      <span class="rounded-full bg-surface px-2 py-0.5 text-xs"
                        >{originLabel(version.origin)}</span
                      >
                      {#if version.is_current}<span
                          class="rounded-full bg-accent/15 px-2 py-0.5 text-xs"
                          >{m.studio_history_current()}</span
                        >{/if}
                    </span>
                    <span class="mt-1 block text-sm text-text-muted"
                      >{formatRelativeDate(version.created_at)}</span
                    >
                    {#if parentVersion}<span class="mt-1 block text-xs text-text-muted"
                        >{m.studio_history_from({
                          version: String(parentVersion.version_number),
                        })}</span
                      >{/if}
                    {#if list.kind === 'lyrics'}
                      <span class="mt-1 block text-xs text-text-muted">
                        {#if baseNumber !== undefined}{m.studio_history_for_plan({
                            version: String(baseNumber),
                          })}{:else}{m.studio_history_older_plan()}{/if}
                      </span>
                    {/if}
                  </button>
                </li>
              {/each}
            </ol>
          {/if}
          <InfiniteScrollSentinel
            disabled={!list.query.hasNextPage || list.query.isFetchingNextPage}
            onVisible={() => {
              if (list.query.hasNextPage && !list.query.isFetchingNextPage)
                void list.query.fetchNextPage();
            }}
          />
          {#if list.query.isFetchingNextPage}<p role="status" class="text-sm">
              {m.common_loading()}
            </p>{/if}
        </section>
      {/each}

      {#if $isDesktop}
        <section class="md:col-span-2 min-w-0">
          {#if selectedVersionId}{#key selectedVersionId}{@render viewerContent()}{/key}
          {:else}<p class="text-text-muted">{m.studio_pick_track()}</p>{/if}
        </section>
      {/if}
    </div>
    {#if !$isDesktop && showMobileViewer}
      {#key selectedVersionId}
        <Sheet ariaLabel={m.studio_history_title()} onclose={() => (showMobileViewer = false)}>
          {@render viewerContent()}
        </Sheet>
      {/key}
    {/if}
  {/if}
</main>

{#snippet viewerContent()}
  {#if viewerQuery.isPending}
    <p role="status">{m.common_loading()}</p>
  {:else if viewerQuery.isLoadingError || !viewer}
    <p role="alert">{m.studio_loading_error()}</p>
    <button class="mt-2 text-accent" onclick={() => void viewerQuery.refetch()}
      >{m.studio_retry()}</button
    >
  {:else}
    {#if viewerQuery.isRefetchError}<p role="status" class="mb-3 text-warning">
        {m.studio_refresh_error()}
      </p>{/if}
    {#if basePlanQuery.isRefetchError && basePlanQuery.data}<p
        role="status"
        class="mb-3 text-warning"
      >
        {m.studio_refresh_error()}
      </p>{/if}
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="font-display text-xl font-semibold">
          {viewer.kind === 'plan' ? m.studio_history_plan() : m.studio_history_lyrics()} v{viewer.version_number}
        </h2>
        <p class="mt-1 text-sm text-text-muted">
          {originLabel(viewer.origin)} · {formatRelativeDate(viewer.created_at)}
        </p>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          class="rounded-lg border border-border px-3 py-2 disabled:opacity-50"
          disabled={writeCount.current > 0 ||
            viewerIsCurrent ||
            (viewer.kind === 'lyrics' && basePlanQuery.isPending)}
          onclick={() => void makeVersionCurrent(viewer)}>{m.studio_history_make_current()}</button
        >
        {#if viewer.kind === 'lyrics' && track.data?.current_lyrics_version_id === viewer.id}
          <button
            class="rounded-lg border border-border px-3 py-2 disabled:opacity-50"
            disabled={writeCount.current > 0}
            onclick={() => openDetachLyrics(viewer)}>{m.studio_history_detach()}</button
          >
        {/if}
        <button
          class="rounded-lg border border-border px-3 py-2 disabled:opacity-50"
          disabled={writeCount.current > 0}
          onclick={() => (exportOpen = true)}>{m.studio_history_export()}</button
        >
        {#if !viewerIsCurrent}
          <button
            class="rounded-lg border border-danger/50 px-3 py-2 text-danger disabled:opacity-50"
            disabled={writeCount.current > 0}
            onclick={() => openDelete(viewer)}>{m.studio_history_delete()}</button
          >
        {/if}
      </div>
    </div>
    {#if actionError}<p role="alert" class="mt-3 text-danger">{actionError}</p>{/if}
    <div class="mt-5 rounded-xl border border-border p-4">
      {#if viewer.kind === 'plan'}
        <TrackDocumentView plan={viewer.content} lyrics={null} />
      {:else if basePlanQuery.isPending}
        <p role="status">{m.common_loading()}</p>
      {:else if basePlanQuery.data?.kind === 'plan'}
        <TrackDocumentView plan={basePlanQuery.data.content} lyrics={viewer.content} />
      {:else}
        <p role="alert">{m.studio_history_not_found()}</p>
      {/if}
    </div>
    {#if exportOpen}
      {@const exportPair =
        viewer.kind === 'plan'
          ? { plan: viewer.id }
          : { plan: viewer.based_on_plan_version_id, lyrics: viewer.id }}
      <SunoExportSheet {trackId} pair={exportPair} onclose={() => (exportOpen = false)} />
    {/if}
    {#if confirmAction}
      <Sheet ariaLabel={confirmTitle} onclose={() => (confirmAction = null)}>
        <h2 class="font-display text-xl font-semibold">{confirmTitle}</h2>
        {#if actionError}<p class="mt-3 text-danger" role="alert">{actionError}</p>{/if}
        <div class="mt-6">
          <SheetActions
            primaryLabel={confirmAction.kind === 'delete'
              ? m.studio_history_delete()
              : m.studio_history_make_current()}
            primaryVariant={confirmAction.kind === 'delete' ? 'danger' : 'default'}
            pending={setCurrent.isPending || remove.isPending}
            oncancel={() => (confirmAction = null)}
            onprimary={() => void confirmActionNow()}
          />
        </div>
      </Sheet>
    {/if}
  {/if}
{/snippet}
