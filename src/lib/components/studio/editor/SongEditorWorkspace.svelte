<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { beforeNavigate, goto } from '$app/navigation';
  import {
    createMutation,
    createQuery,
    useIsMutating,
    useQueryClient,
  } from '@tanstack/svelte-query';
  import { ApiRequestError } from '$lib/api/errors';
  import type { components } from '$lib/api/types';
  import ErrorSummary from '$lib/components/studio/editor/ErrorSummary.svelte';
  import RestoreDraftBanner from '$lib/components/studio/editor/RestoreDraftBanner.svelte';
  import SaveBar, { type SaveStatus } from '$lib/components/studio/editor/SaveBar.svelte';
  import SectionCard from '$lib/components/studio/editor/SectionCard.svelte';
  import SongSettings from '$lib/components/studio/editor/SongSettings.svelte';
  import Sheet from '$lib/components/shared/Sheet.svelte';
  import SheetActions from '$lib/components/shared/SheetActions.svelte';
  import { studioMutationKeys, trackQueryOptions } from '$lib/queries/studioTracks';
  import { artistsQueryOptions, studioKeys } from '$lib/queries/studio';
  import { projectQueryOptions } from '$lib/queries/studioProjects';
  import {
    createVersionMutationOptions,
    reconcileTrackDocuments,
    setCurrentMutationOptions,
    versionQueryOptions,
  } from '$lib/queries/studioVersions';
  import { componentSession } from '$lib/utils/sessionTracker';
  import { currentUser, getAuthFailureReason } from '$lib/stores/auth';
  import { addToast } from '$lib/stores/toasts';
  import { SongEditor } from '$lib/studio/SongEditor.svelte';
  import {
    buildSong,
    hasUnsentInput,
    lyricsLength,
    sameDocs,
    type DocumentPair,
    type Pair,
    type PlanDocument,
    type LyricsDocument,
    type SectionKind,
    type PlanSection,
  } from '$lib/studio/songDraft';
  import { sectionDisplayName } from '$lib/studio/sections';
  import { mapServerIssues, selectLyricsRow } from '$lib/studio/editorIssues';
  import { isHandledGlobally } from '$lib/studio/formErrors';
  import { songDraftStore, type StoredSongDraft } from '$lib/studio/songDraftStore';
  import {
    isMissingBase,
    saveSong,
    SongSaveError,
    type AcceptedSave,
    type SaveOutcome,
    type SongSaveApi,
  } from '$lib/studio/saveSong';
  import { studioTrack } from '$lib/studio/paths';
  import type { DraftIssue } from '$lib/studio/songValidation';
  import * as m from '$paraglide/messages';

  type TrackDetail = components['schemas']['TrackDetail'];
  type EditorSheet =
    | { kind: 'conflict'; server: Pair }
    | { kind: 'base_missing'; server: Pair }
    | { kind: 'remove_lyrics'; server: Pair }
    | { kind: 'delete_section'; sectionId: string };
  type RestoreChoice =
    | { token: number; record: StoredSongDraft; state: 'loading' }
    | {
        token: number;
        record: StoredSongDraft;
        state: 'ready';
        baseDocs: DocumentPair;
        baseMissing: boolean;
      }
    | { token: number; record: StoredSongDraft; state: 'error' };

  let props: { projectId: string; trackId: string; userId: string } = $props();
  // One instance edits one track for one user (the page keys on both), and a save can outlive it.
  // Reading these once keeps a late result on the track it belongs to.
  const { projectId, trackId, userId } = untrack(() => ({ ...props }));
  const qc = useQueryClient();
  const track = createQuery(() => trackQueryOptions(trackId));
  const project = createQuery(() => projectQueryOptions(projectId));
  const artists = createQuery(artistsQueryOptions);
  const session = componentSession();
  const editor = new SongEditor({
    store: songDraftStore,
    userId,
    trackId,
    makeId: () => crypto.randomUUID(),
    now: () => new Date(),
  });
  const versionMutation = createMutation(() => createVersionMutationOptions(qc, trackId));
  const currentMutation = createMutation(() =>
    setCurrentMutationOptions(qc, projectId, trackId, { reconcile: false }),
  );
  const writeCount = useIsMutating({
    mutationKey: studioMutationKeys.trackDocuments(trackId),
    exact: true,
  });
  let editorAvailable = $state(songDraftStore.available);
  let initialized = $state(false);
  let restoreChoice = $state<RestoreChoice | null>(null);
  let restoreToken = 0;
  let chooserOpen = $state(false);
  let addKind = $state<SectionKind>('verse');
  let saving = $state(false);
  let attempted = $state(false);
  /** Set only from a 422. */
  let serverIssues = $state<{ forDraft: string; issues: DraftIssue[] } | null>(null);
  /** The draft the summary was shown for; it interrupts a screen reader only while unchanged. */
  let announcedDraft = $state<string | null>(null);
  let pageError = $state('');
  let sheet = $state<EditorSheet | null>(null);
  let pendingLeave = $state<URL | null>(null);
  let leaving = false;
  let autosaveTimer: ReturnType<typeof setTimeout> | undefined;
  let addSectionButton = $state<HTMLButtonElement>();

  const draftKey = $derived(editor.draft ? JSON.stringify($state.snapshot(editor.draft)) : '');
  // Server issues belong to the draft that got the 422 and vanish as soon as it differs.
  const liveServerIssues = $derived(serverIssues?.forDraft === draftKey ? serverIssues.issues : []);
  const summaryIssues = $derived(
    liveServerIssues.length ? liveServerIssues : attempted ? editor.issues : [],
  );
  const fieldIssues = $derived([...editor.issues, ...liveServerIssues]);
  let built = $derived(editor.built);
  let lyricsCount = $derived(lyricsLength(built?.lyrics ?? null));
  const saveStatus = $derived<SaveStatus>(
    saving
      ? 'saving'
      : editor.dirty || (editor.needsLocalCopy && !editorAvailable)
        ? 'unsaved'
        : editor.needsLocalCopy
          ? 'device'
          : 'saved',
  );
  // Problems never disable Save: pressing it is how the user learns what they are.
  const saveDisabled = $derived(
    !editor.dirty || saving || restoreChoice !== null || writeCount.current > 0,
  );
  let activePlanSections = $derived(
    editor.draft?.sections.map((section) => ({
      id: section.id,
      kind: section.kind,
      label: section.label || null,
      delivery: section.delivery,
      instrumental: section.instrumental,
    })) ?? [],
  );

  function trackPair(data: TrackDetail): Pair {
    return { plan: data.current_plan_version_id, lyrics: data.current_lyrics_version_id };
  }

  function currentDocs(data: TrackDetail): DocumentPair {
    return {
      plan: (data.current_plan?.content ?? null) as PlanDocument | null,
      lyrics: (data.current_lyrics?.content ?? null) as LyricsDocument | null,
    };
  }

  function seedCurrentVersions(data: TrackDetail): void {
    if (data.current_plan)
      qc.setQueryData(studioKeys.version(data.current_plan.id), data.current_plan);
    if (data.current_lyrics)
      qc.setQueryData(studioKeys.version(data.current_lyrics.id), data.current_lyrics);
  }

  function currentDefaults(data: TrackDetail): { language: string } {
    const artist = artists.data?.items.find((item) => item.id === project.data?.artist_id);
    return { language: data.current_lyrics?.content.language ?? artist?.default_language ?? '' };
  }

  function startFromServer(data: TrackDetail): void {
    seedCurrentVersions(data);
    editor.start(trackPair(data), currentDocs(data), currentDefaults(data));
    chooserOpen = !data.current_plan;
  }

  /** Start from the server's documents, then offer the device draft if it holds more than them. */
  function openTrack(data: TrackDetail): void {
    startFromServer(data);
    const stored = songDraftStore.load(userId, trackId);
    if (!stored) return;
    const storedBuilt = buildSong(stored.draft);
    if (sameDocs(storedBuilt, currentDocs(data)) && !hasUnsentInput(stored.draft, storedBuilt)) {
      songDraftStore.remove(userId, trackId);
      return;
    }
    chooserOpen = false;
    offerRestore(stored);
  }

  $effect(() => {
    const data = track.data;
    // The project and its artist only supply the default language: wait until both queries
    // settle, then open the editor whatever the outcome.
    if (!data || project.isPending || artists.isPending || initialized) return;
    initialized = true;
    untrack(() => openTrack(data));
  });

  /** The documents a stored draft was based on. A deleted base is a result, not a failure. */
  async function loadBaseDocs(base: Pair): Promise<{ docs: DocumentPair; missing: boolean }> {
    try {
      const [plan, lyrics] = await Promise.all([
        base.plan ? qc.ensureQueryData(versionQueryOptions(base.plan)) : null,
        base.lyrics ? qc.ensureQueryData(versionQueryOptions(base.lyrics)) : null,
      ]);
      return {
        docs: {
          plan: (plan?.content ?? null) as PlanDocument | null,
          lyrics: (lyrics?.content ?? null) as LyricsDocument | null,
        },
        missing: false,
      };
    } catch (error) {
      if (isMissingBase(error)) return { docs: { plan: null, lyrics: null }, missing: true };
      throw error;
    }
  }

  function offerRestore(record: StoredSongDraft): void {
    const token = ++restoreToken;
    restoreChoice = { token, record, state: 'loading' };
    void loadBaseDocs(record.base).then(
      ({ docs, missing }) => {
        // The choice may have been made or replaced while the base loaded.
        if (restoreChoice?.token !== token || restoreChoice.state !== 'loading') return;
        restoreChoice = { token, record, state: 'ready', baseDocs: docs, baseMissing: missing };
      },
      () => {
        if (restoreChoice?.token === token) restoreChoice = { token, record, state: 'error' };
      },
    );
  }

  // A save left running by an earlier visit can re-base or remove the stored draft while it is
  // still on offer here. It reconciles the track afterwards, so a moved pair is the cue to re-read.
  const currentPairKey = $derived(
    `${track.data?.current_plan_version_id}|${track.data?.current_lyrics_version_id}`,
  );
  $effect(() => {
    void currentPairKey;
    untrack(recheckRestoreChoice);
  });

  function recheckRestoreChoice(): void {
    if (!restoreChoice || !track.data || !songDraftStore.available) return;
    if (songDraftStore.load(userId, trackId)?.savedAt === restoreChoice.record.savedAt) return;
    restoreChoice = null;
    openTrack(track.data);
  }

  function restoreStored(): void {
    const choice = restoreChoice;
    const data = track.data;
    if (choice?.state !== 'ready' || !data) return;
    const current = currentDocs(data);
    // Continue from the current pair when the base was deleted (this click is the confirmation),
    // or when the stored documents already match: there is nothing to conflict with.
    if (choice.baseMissing || sameDocs(buildSong(choice.record.draft), current)) {
      seedCurrentVersions(data);
      editor.restore({ ...choice.record, base: trackPair(data) }, current);
    } else editor.restore(choice.record, choice.baseDocs);
    restoreChoice = null;
    chooserOpen = false;
  }

  function discardStored(): void {
    editor.discardStored();
    restoreChoice = null;
    // Show what the server holds now, which can be newer than what this editor started from.
    if (track.data) startFromServer(track.data);
  }

  function chooseTemplate(template: 'blank' | 'verse_chorus'): void {
    editor.create(template, track.data?.title ?? '', currentDefaults(track.data!).language);
    chooserOpen = false;
  }

  function cancelAutosave(): void {
    clearTimeout(autosaveTimer);
    autosaveTimer = undefined;
  }

  function persistNow(): void {
    cancelAutosave();
    // While a choice is pending the stored record is untouchable: the editor shows the server's.
    if (restoreChoice) return;
    editor.persist();
    editorAvailable = songDraftStore.available;
  }

  /** Writes what the debounce still holds. An idle editor leaves storage alone, so hiding a clean
   *  tab cannot delete the draft another tab keeps for this track. */
  function flushAutosave(): void {
    if (autosaveTimer !== undefined) persistNow();
  }

  $effect(() => {
    // Every edit changes the key.
    if (!draftKey || restoreChoice) return;
    if (!editor.needsLocalCopy) {
      untrack(persistNow);
      return;
    }
    autosaveTimer = setTimeout(persistNow, 400);
    return cancelAutosave;
  });

  onMount(() => {
    // iOS can suspend or kill a backgrounded PWA without any navigation event.
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') flushAutosave();
    };
    document.addEventListener('visibilitychange', flushWhenHidden);
    window.addEventListener('pagehide', flushAutosave);
    // The page unmounts this editor as soon as the user is cleared, before any navigation hook.
    // A session that died on its own keeps the last keystrokes. Sign-out and account deletion
    // record no such reason, so the drafts they clear are not written back.
    const stopWatchingUser = currentUser.subscribe((user) => {
      const reason = getAuthFailureReason();
      if (!user && reason !== null && reason !== 'network') flushAutosave();
    });
    return () => {
      document.removeEventListener('visibilitychange', flushWhenHidden);
      window.removeEventListener('pagehide', flushAutosave);
      stopWatchingUser();
    };
  });

  beforeNavigate((navigation) => {
    if (leaving) return;
    if (editor.needsLocalCopy || autosaveTimer !== undefined) persistNow();
    if (editorAvailable || !editor.needsLocalCopy) return;
    navigation.cancel();
    // A closing tab cannot show our sheet: cancelling makes the browser ask in its own dialog.
    if (navigation.type !== 'leave') pendingLeave = navigation.to?.url ?? null;
  });

  function leaveAnyway(): void {
    const target = pendingLeave;
    if (!target) return;
    pendingLeave = null;
    leaving = true;
    void goto(target);
  }

  /** Open every disclosure around a control: hidden content cannot take focus. */
  function reveal(target: HTMLElement): void {
    let details = target.closest('details');
    while (details) {
      details.open = true;
      details = details.parentElement?.closest('details') ?? null;
    }
  }

  function focusIssue(issue: DraftIssue): void {
    void tick().then(() => {
      let target: HTMLElement | null = null;
      if (issue.target?.kind === 'lyrics') {
        const textarea = document.querySelector<HTMLTextAreaElement>(
          `textarea[data-lyrics-id="${CSS.escape(issue.target.id)}"]`,
        );
        if (textarea) {
          selectLyricsRow(textarea, issue.target.row);
          return;
        }
      } else if (issue.target?.kind === 'song') {
        const ids: Record<string, string> = {
          title: 'song-title',
          tempo: 'song-tempo',
          language: 'song-language',
          styleTags: 'song-style-tags',
          styleAvoid: 'song-style-avoid',
          references: 'song-references',
          idea: 'song-idea',
          lyrics: 'song-settings-heading',
          sections: 'add-section-kind',
        };
        target = document.getElementById(ids[issue.target.field] ?? 'song-settings-heading');
      } else if (issue.target?.kind === 'section') {
        const fieldIds: Record<string, string> = {
          label: `section-label-${issue.target.id}`,
          delivery: `section-${issue.target.id}-delivery`,
          styleTags: `section-${issue.target.id}-style`,
          styleAvoid: `section-${issue.target.id}-avoid`,
          duration: `section-${issue.target.id}-duration`,
          notes: `section-${issue.target.id}-notes`,
        };
        target = document.getElementById(
          fieldIds[issue.target.field] ?? `section-kind-${issue.target.id}`,
        );
      }
      target ??= document.getElementById('song-error-summary-heading');
      if (!target) return;
      reveal(target);
      target.focus();
    });
  }

  async function showSummary(): Promise<void> {
    announcedDraft = draftKey;
    await tick();
    document.getElementById('song-error-summary-heading')?.focus();
  }

  function saveApi(): SongSaveApi {
    // Read before the first await: the save can outlive this component.
    const createVersion = versionMutation.mutateAsync;
    const switchCurrent = currentMutation.mutateAsync;
    return {
      async fetchServerPair() {
        const data = await qc.fetchQuery({ ...trackQueryOptions(trackId), staleTime: 0 });
        return trackPair(data);
      },
      async loadVersionContent(id) {
        const version = await qc.ensureQueryData(versionQueryOptions(id));
        return version.content as PlanDocument | LyricsDocument;
      },
      async createPlan(body) {
        const version = await createVersion(body);
        return { id: version.id, version_number: version.version_number };
      },
      async createLyrics(body) {
        const version = await createVersion(body);
        return { id: version.id, version_number: version.version_number };
      },
      async setCurrent(body) {
        await switchCurrent(body);
      },
    };
  }

  function savedMessage(outcome: Extract<SaveOutcome, { kind: 'saved' }>): string {
    const plan = outcome.created.plan;
    const lyrics = outcome.created.lyrics;
    if (outcome.lyricsRemoved && plan !== undefined)
      return m.studio_editor_saved_plan_removed({ plan: String(plan) });
    if (outcome.lyricsRemoved) return m.studio_editor_saved_removed();
    if (plan !== undefined && lyrics !== undefined)
      return m.studio_editor_saved_plan_lyrics({ plan: String(plan), lyrics: String(lyrics) });
    if (plan !== undefined) return m.studio_editor_saved_plan({ version: String(plan) });
    if (lyrics !== undefined) return m.studio_editor_saved_lyrics({ version: String(lyrics) });
    return m.studio_editor_saved();
  }

  function openOutcome(outcome: SaveOutcome): void {
    if (outcome.kind === 'conflict') sheet = { kind: 'conflict', server: outcome.server };
    else if (outcome.kind === 'base_missing')
      sheet = { kind: 'base_missing', server: outcome.server };
    else if (outcome.kind === 'confirm_remove_lyrics')
      sheet = { kind: 'remove_lyrics', server: outcome.server };
  }

  async function save(accepted?: AcceptedSave): Promise<void> {
    if (saving || restoreChoice || !editor.built || !editor.draft || writeCount.current > 0) return;
    pageError = '';
    serverIssues = null;
    if (editor.issues.length) {
      attempted = true;
      await showSummary();
      return;
    }
    if (!editor.dirty) {
      addToast({ type: 'info', message: m.studio_editor_nothing_to_save() });
      return;
    }
    // The device copy is current before the first request leaves.
    persistNow();
    const snapshot = editor.built;
    const snapshotKey = draftKey;
    const captured = session.capture();
    saving = true;
    let wrote = false;
    try {
      const outcome = await saveSong(saveApi(), { snapshot, base: { ...editor.base }, accepted });
      if (outcome.kind === 'saved') {
        wrote = true;
        addToast({ type: 'success', message: savedMessage(outcome) });
        // Re-base even after leaving, so no stored draft keeps the old base and then conflicts
        // with this very save. A newer editor's record is left alone.
        if (captured.active || editor.ownsStoredRecord()) {
          editor.rebase(outcome.pair, { plan: snapshot.plan, lyrics: snapshot.lyrics });
          persistNow();
          attempted = false;
        }
        return;
      }
      if (outcome.kind === 'nothing') {
        addToast({ type: 'info', message: m.studio_editor_nothing_to_save() });
        return;
      }
      if (!captured.active) {
        addToast({ type: 'info', message: m.studio_editor_not_saved_kept() });
        return;
      }
      openOutcome(outcome);
    } catch (error) {
      if (!captured.active) {
        addToast({ type: 'error', message: saveErrorMessage(error) });
        return;
      }
      const apiError = error instanceof SongSaveError ? error.cause : error;
      if (
        apiError instanceof ApiRequestError &&
        apiError.status_code === 422 &&
        apiError.error === 'document_invalid'
      ) {
        serverIssues = { forDraft: snapshotKey, issues: mapServerIssues(apiError, snapshot) };
        // With no issue to show (the draft changed since, or none came), still report the failure.
        if (liveServerIssues.length) await showSummary();
        else pageError = saveErrorMessage(error);
      } else if (!isHandledGlobally(apiError)) {
        if (error instanceof SongSaveError)
          console.debug('Song save failed', error.step, error.cause);
        pageError = saveErrorMessage(error);
      }
    } finally {
      saving = false;
      if (wrote) reconcileTrackDocuments(qc, projectId, trackId);
    }
  }

  function saveErrorMessage(error: unknown): string {
    const actualError = error instanceof SongSaveError ? error.cause : error;
    if (
      actualError instanceof ApiRequestError &&
      actualError.status_code === 409 &&
      actualError.error === 'version_limit_reached'
    )
      return m.studio_editor_version_limit();
    return m.studio_editor_save_error();
  }

  async function acceptSheet(): Promise<void> {
    const pending = sheet;
    if (!pending) return;
    sheet = null;
    if (pending.kind === 'delete_section') {
      await removeAndFocus(pending.sectionId);
      return;
    }
    if (pending.kind === 'base_missing') {
      const captured = session.capture();
      try {
        const data = await qc.fetchQuery({ ...trackQueryOptions(trackId), staleTime: 0 });
        if (!captured.active) {
          addToast({ type: 'info', message: m.studio_editor_not_saved_kept() });
          return;
        }
        seedCurrentVersions(data);
        editor.rebase(trackPair(data), currentDocs(data));
        await save({ server: pending.server });
      } catch {
        if (captured.active) pageError = m.studio_editor_save_error();
        else addToast({ type: 'error', message: m.studio_editor_save_error() });
      }
      return;
    }
    const accepted: AcceptedSave = {
      server: pending.server,
      ...(pending.kind === 'remove_lyrics' ? { removeLyrics: true } : {}),
    };
    await save(accepted);
  }

  function requestDelete(sectionId: string): void {
    const section = editor.draft?.sections.find((item) => item.id === sectionId);
    if (!section) return;
    if (section.lyrics.trim() || section.notes.trim())
      sheet = { kind: 'delete_section', sectionId };
    else void removeAndFocus(sectionId);
  }

  async function removeAndFocus(sectionId: string): Promise<void> {
    const sections = editor.draft?.sections ?? [];
    const index = sections.findIndex((section) => section.id === sectionId);
    editor.removeSection(sectionId);
    await tick();
    const focusId = editor.draft?.sections[index]?.id;
    if (focusId)
      document
        .querySelector<HTMLElement>(`[data-section-handle="${CSS.escape(focusId)}"]`)
        ?.focus();
    else addSectionButton?.focus();
  }

  async function addSection(): Promise<void> {
    const id = editor.addSection(addKind);
    await tick();
    document.getElementById(`section-kind-${id}`)?.focus();
  }

  async function duplicateSection(id: string): Promise<void> {
    const duplicateId = editor.duplicateSection(id);
    await tick();
    document.getElementById(`section-kind-${duplicateId}`)?.focus();
  }

  async function moveSection(id: string, delta: -1 | 1): Promise<void> {
    editor.moveSection(id, delta);
    await tick();
    document.querySelector<HTMLElement>(`[data-section-handle="${CSS.escape(id)}"]`)?.focus();
  }

  function handleKeydown(event: KeyboardEvent): void {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void save();
    }
  }

  const sectionKinds: SectionKind[] = [
    'intro',
    'verse',
    'pre_chorus',
    'chorus',
    'post_chorus',
    'hook',
    'bridge',
    'build',
    'drop',
    'breakdown',
    'instrumental',
    'interlude',
    'outro',
  ];
  function kindName(kind: SectionKind): string {
    const sections =
      editor.draft?.sections.map(
        (section) =>
          ({
            id: section.id,
            kind: section.kind,
            label: section.label || null,
          }) as PlanSection,
      ) ?? [];
    return sectionDisplayName({ id: `new-${kind}`, kind, label: null } as PlanSection, sections);
  }
</script>

<svelte:head
  ><title>{m.studio_editor_heading({ title: track.data?.title ?? '' })}</title></svelte:head
>
<svelte:window onkeydown={handleKeydown} />
<div class="mx-auto w-full max-w-3xl p-4 md:p-6">
  {#if track.isPending && !editor.draft}<p role="status" class="py-10 text-center">
      {m.common_loading()}
    </p>
  {:else if track.isLoadingError || !track.data}
    <section role="alert" class="space-y-3 py-10">
      <h1 class="font-display text-2xl">{m.studio_loading_error()}</h1>
      <button type="button" class="text-accent underline" onclick={() => void track.refetch()}
        >{m.studio_retry()}</button
      >
    </section>
  {:else}
    <section class="flex flex-col gap-5" aria-labelledby="song-editor-title">
      <h1 id="song-editor-title" class="font-display text-3xl font-semibold">
        {m.studio_editor_heading({ title: track.data.title })}
      </h1>
      {#if track.isRefetchError}<p
          role="status"
          class="rounded-lg bg-warning/10 p-3 text-sm text-warning"
        >
          {m.studio_refresh_error()}
          <button type="button" class="underline" onclick={() => void track.refetch()}
            >{m.studio_retry()}</button
          >
        </p>{/if}
      {#if project.isLoadingError}<p
          role="status"
          class="rounded-lg bg-warning/10 p-3 text-sm text-warning"
        >
          {m.studio_editor_project_error()}
          <button type="button" class="underline" onclick={() => void project.refetch()}
            >{m.studio_retry()}</button
          >
        </p>{/if}
      {#if !editorAvailable && editor.needsLocalCopy}<p
          role="status"
          class="rounded-lg bg-warning/10 p-3 text-sm"
        >
          {m.studio_editor_storage_unavailable()}
        </p>{/if}
      {#if !initialized}<p role="status" class="py-10 text-center">{m.common_loading()}</p>{/if}
      {#if restoreChoice}
        <RestoreDraftBanner
          savedAt={restoreChoice.record.savedAt}
          status={restoreChoice.state}
          baseMissing={restoreChoice.state === 'ready' && restoreChoice.baseMissing}
          onrestore={restoreStored}
          ondiscard={discardStored}
          onretry={() => restoreChoice && offerRestore(restoreChoice.record)}
        />
      {/if}
      {#if pageError}<p role="alert" class="rounded-lg bg-danger/10 p-3 text-sm text-danger">
          {pageError}
        </p>{/if}
      {#if summaryIssues.length}<ErrorSummary
          issues={summaryIssues}
          sections={activePlanSections}
          announce={announcedDraft === draftKey}
          onfocus={focusIssue}
        />{/if}
      {#if chooserOpen && !editor.draft}
        <section
          class="space-y-4 rounded-2xl border border-border bg-surface p-5"
          aria-labelledby="song-start-heading"
        >
          <h2 id="song-start-heading" class="font-display text-xl font-semibold">
            {m.studio_editor_start()}
          </h2>
          <p class="text-sm text-text-muted">{m.studio_editor_start_hint()}</p>
          <div class="flex flex-wrap gap-3">
            <button
              type="button"
              class="rounded-lg border border-border px-4 py-2"
              onclick={() => chooseTemplate('blank')}>{m.studio_editor_blank()}</button
            >
            <button
              type="button"
              class="rounded-lg bg-accent px-4 py-2 font-semibold text-bg"
              onclick={() => chooseTemplate('verse_chorus')}
              >{m.studio_editor_verse_chorus()}</button
            >
          </div>
        </section>
      {:else if editor.draft && built}
        <!-- A pending restore choice comes first: Restore would overwrite anything typed here. -->
        <div
          class="space-y-5"
          class:opacity-60={restoreChoice !== null}
          inert={restoreChoice !== null}
        >
          <SongSettings bind:draft={editor.draft} issues={fieldIssues} {lyricsCount} />
          <div class="space-y-4">
            {#each editor.draft.sections as section, index (section.id)}
              <SectionCard
                bind:section={editor.draft.sections[index]}
                draft={editor.draft}
                {index}
                issues={fieldIssues}
                hiddenLines={built.hiddenLines.get(section.id) ?? 0}
                onmove={(delta) => void moveSection(section.id, delta)}
                onduplicate={() => void duplicateSection(section.id)}
                ondelete={() => requestDelete(section.id)}
              />
            {/each}
            <div class="flex flex-wrap items-center gap-3 border-t border-border pt-4">
              <select
                id="add-section-kind"
                bind:value={addKind}
                aria-label={m.studio_editor_section_kind()}
                disabled={editor.draft.sections.length >= 64}
                class="min-w-40 rounded-lg border border-border bg-surface px-3 py-2"
              >
                {#each sectionKinds as kind (kind)}<option value={kind}>{kindName(kind)}</option
                  >{/each}
              </select>
              <button
                bind:this={addSectionButton}
                type="button"
                class="rounded-lg border border-border px-4 py-2 disabled:opacity-50"
                disabled={editor.draft.sections.length >= 64}
                onclick={() => void addSection()}>+ {m.studio_editor_add_section()}</button
              >
              {#if editor.draft.sections.length >= 60}<span class="text-sm text-text-muted"
                  >{m.studio_editor_section_count({
                    count: String(editor.draft.sections.length),
                  })}</span
                >{/if}
            </div>
          </div>
        </div>
        <SaveBar
          status={saveStatus}
          disabled={saveDisabled}
          onclose={() => void goto(studioTrack(projectId, trackId))}
          onsave={() => void save()}
        />
      {/if}
    </section>
  {/if}
</div>

{#if pendingLeave}
  <Sheet
    labelledby="song-editor-leave-title"
    onclose={() => (pendingLeave = null)}
    panelClass="space-y-4"
  >
    <h2 id="song-editor-leave-title" class="font-display text-xl font-semibold">
      {m.studio_editor_leave_title()}
    </h2>
    <p>{m.studio_editor_leave_body()}</p>
    <SheetActions
      cancelLabel={m.studio_editor_stay()}
      primaryLabel={m.studio_editor_leave()}
      primaryVariant="danger"
      oncancel={() => (pendingLeave = null)}
      onprimary={leaveAnyway}
    />
  </Sheet>
{/if}

{#if sheet}
  <Sheet labelledby="song-editor-sheet-title" onclose={() => (sheet = null)} panelClass="space-y-4">
    {#if sheet.kind === 'conflict'}
      <h2 id="song-editor-sheet-title" class="font-display text-xl font-semibold">
        {m.studio_editor_conflict_title()}
      </h2>
      <p>{m.studio_editor_conflict_body()}</p>
      <SheetActions
        primaryLabel={m.studio_editor_replace()}
        pending={saving}
        oncancel={() => (sheet = null)}
        onprimary={() => void acceptSheet()}
      />
    {:else if sheet.kind === 'base_missing'}
      <h2 id="song-editor-sheet-title" class="font-display text-xl font-semibold">
        {m.studio_editor_missing_title()}
      </h2>
      <p>{m.studio_editor_missing_body()}</p>
      <SheetActions
        primaryLabel={m.studio_editor_save_on_top()}
        pending={saving}
        oncancel={() => (sheet = null)}
        onprimary={() => void acceptSheet()}
      />
    {:else if sheet.kind === 'remove_lyrics'}
      <h2 id="song-editor-sheet-title" class="font-display text-xl font-semibold">
        {m.studio_editor_remove_lyrics_title()}
      </h2>
      <p>{m.studio_editor_remove_lyrics_body()}</p>
      <SheetActions
        primaryLabel={m.studio_editor_remove_lyrics()}
        primaryVariant="danger"
        pending={saving}
        oncancel={() => (sheet = null)}
        onprimary={() => void acceptSheet()}
      />
    {:else}
      <h2 id="song-editor-sheet-title" class="font-display text-xl font-semibold">
        {m.studio_editor_delete_section_title()}
      </h2>
      <p>{m.studio_editor_delete_section_body()}</p>
      <SheetActions
        primaryLabel={m.studio_delete()}
        primaryVariant="danger"
        oncancel={() => (sheet = null)}
        onprimary={() => void acceptSheet()}
      />
    {/if}
  </Sheet>
{/if}
