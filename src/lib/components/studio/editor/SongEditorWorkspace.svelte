<script lang="ts">
  import { tick } from 'svelte';
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
  import SaveBar from '$lib/components/studio/editor/SaveBar.svelte';
  import SectionCard from '$lib/components/studio/editor/SectionCard.svelte';
  import SongSettings from '$lib/components/studio/editor/SongSettings.svelte';
  import Sheet from '$lib/components/shared/Sheet.svelte';
  import SheetActions from '$lib/components/shared/SheetActions.svelte';
  import { trackQueryOptions } from '$lib/queries/studioTracks';
  import { artistsQueryOptions, studioKeys } from '$lib/queries/studio';
  import { projectQueryOptions } from '$lib/queries/studioProjects';
  import {
    createVersionMutationOptions,
    reconcileTrackDocuments,
    setCurrentMutationOptions,
    versionQueryOptions,
  } from '$lib/queries/studioVersions';
  import { componentSession } from '$lib/utils/sessionTracker';
  import { currentUser } from '$lib/stores/auth';
  import { addToast } from '$lib/stores/toasts';
  import { SongEditor } from '$lib/studio/SongEditor.svelte';
  import {
    buildSong,
    sameLyrics,
    samePlan,
    type Pair,
    type PlanDocument,
    type LyricsDocument,
    type SectionKind,
    type PlanSection,
  } from '$lib/studio/songDraft';
  import { sectionDisplayName } from '$lib/studio/sections';
  import { mapServerIssues } from '$lib/studio/editorIssues';
  import { isHandledGlobally } from '$lib/studio/formErrors';
  import { songDraftStore, type StoredSongDraft } from '$lib/studio/songDraftStore';
  import {
    saveSong,
    SongSaveError,
    type AcceptedSave,
    type SaveOutcome,
    type SongSaveApi,
  } from '$lib/studio/saveSong';
  import { codePointLength } from '$lib/studio/text';
  import { lineRange } from '$lib/studio/sunoImport';
  import { studioTrack } from '$lib/studio/paths';
  import type { DraftIssue } from '$lib/studio/songValidation';
  import * as m from '$paraglide/messages';

  type TrackDetail = components['schemas']['TrackDetail'];
  type EditorSheet =
    | { kind: 'conflict'; server: Pair }
    | { kind: 'base_missing'; server: Pair }
    | { kind: 'remove_lyrics'; server: Pair }
    | { kind: 'delete_section'; sectionId: string };

  let { projectId, trackId }: { projectId: string; trackId: string } = $props();
  function initialTrackId(): string {
    return trackId;
  }
  const qc = useQueryClient();
  const track = createQuery(() => trackQueryOptions(trackId));
  const project = createQuery(() => projectQueryOptions(projectId));
  const artists = createQuery(artistsQueryOptions);
  const session = componentSession();
  const editor = new SongEditor({
    store: songDraftStore,
    userId: $currentUser?.id ?? '',
    trackId: initialTrackId(),
    makeId: () => crypto.randomUUID(),
    now: () => new Date(),
  });
  const versionMutation = createMutation(() => createVersionMutationOptions(qc, trackId));
  const currentMutation = createMutation(() =>
    setCurrentMutationOptions(qc, projectId, trackId, { reconcile: false }),
  );
  const writeCount = useIsMutating({
    get mutationKey() {
      return ['studio', 'mutation', 'track-documents', trackId];
    },
    exact: true,
  });
  let editorAvailable = $state(songDraftStore.available);
  let initializedFor = '';
  let restoreCandidate = $state<{
    record: StoredSongDraft;
    baseDocs: { plan: PlanDocument | null; lyrics: LyricsDocument | null };
  } | null>(null);
  let chooserOpen = $state(false);
  let addKind = $state<SectionKind>('verse');
  let saving = $state(false);
  let serverIssues = $state<ReturnType<typeof mapServerIssues>>([]);
  let serverIssueSnapshot = '';
  let pageError = $state('');
  let sheet = $state<EditorSheet | null>(null);
  let addSectionButton = $state<HTMLButtonElement>();

  let activeIssues = $derived(serverIssues.length ? serverIssues : editor.issues);
  let built = $derived(editor.built);
  let lyricsCount = $derived(
    built?.lyrics?.sections.reduce(
      (sum, section) =>
        sum + section.lines.reduce((lineSum, line) => lineSum + codePointLength(line.text), 0),
      0,
    ) ?? 0,
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

  function seedCurrentVersions(data: TrackDetail): void {
    if (data.current_plan)
      qc.setQueryData(studioKeys.version(data.current_plan.id), data.current_plan);
    if (data.current_lyrics)
      qc.setQueryData(studioKeys.version(data.current_lyrics.id), data.current_lyrics);
  }

  async function docsForPair(
    pair: Pair,
  ): Promise<{ plan: PlanDocument | null; lyrics: LyricsDocument | null }> {
    const [planVersion, lyricsVersion] = await Promise.all([
      pair.plan ? qc.ensureQueryData(versionQueryOptions(pair.plan)) : null,
      pair.lyrics ? qc.ensureQueryData(versionQueryOptions(pair.lyrics)) : null,
    ]);
    return {
      plan: planVersion && 'content' in planVersion ? (planVersion.content as PlanDocument) : null,
      lyrics:
        lyricsVersion && 'content' in lyricsVersion
          ? (lyricsVersion.content as LyricsDocument)
          : null,
    };
  }

  function currentDefaults(data: TrackDetail): { language: string } {
    const artist = artists.data?.items.find((item) => item.id === project.data?.artist_id);
    return { language: data.current_lyrics?.content.language ?? artist?.default_language ?? '' };
  }

  $effect(() => {
    const data = track.data;
    const projectData = project.data;
    const artistData = artists.data;
    if (!data || !projectData || initializedFor === trackId) return;
    if (artists.isPending && !artistData) return;
    initializedFor = trackId;
    seedCurrentVersions(data);
    const pair = trackPair(data);
    const currentPlan = (data.current_plan?.content ?? null) as PlanDocument | null;
    const currentLyrics = (data.current_lyrics?.content ?? null) as LyricsDocument | null;
    editor.start(
      pair,
      {
        plan: currentPlan,
        lyrics: currentLyrics,
      },
      currentDefaults(data),
    );

    const userId = $currentUser?.id;
    const stored = userId ? songDraftStore.load(userId, trackId) : null;
    if (!stored) {
      chooserOpen = !data.current_plan;
      return;
    }
    const storedBuilt = buildSong(stored.draft);
    if (sameCurrentContent(storedBuilt.plan, storedBuilt.lyrics, currentPlan, currentLyrics)) {
      songDraftStore.remove(userId!, trackId);
      chooserOpen = !data.current_plan;
      return;
    }
    restoreCandidate = { record: stored, baseDocs: { plan: null, lyrics: null } };
    void docsForPair(stored.base)
      .catch(() => ({ plan: null, lyrics: null }))
      .then((baseDocs) => {
        restoreCandidate = { record: stored, baseDocs };
      });
  });

  function sameCurrentContent(
    plan: PlanDocument,
    lyrics: LyricsDocument | null,
    currentPlan: PlanDocument | null,
    currentLyrics: LyricsDocument | null,
  ): boolean {
    return samePlan(plan, currentPlan) && sameLyrics(lyrics, currentLyrics);
  }

  function restoreStored(): void {
    if (!restoreCandidate) return;
    editor.restore(restoreCandidate.record, restoreCandidate.baseDocs);
    restoreCandidate = null;
    chooserOpen = false;
  }

  function discardStored(): void {
    editor.discardStored();
    restoreCandidate = null;
    chooserOpen = !track.data?.current_plan;
  }

  function chooseTemplate(template: 'blank' | 'verse_chorus'): void {
    editor.create(template, track.data?.title ?? '', currentDefaults(track.data!).language);
    chooserOpen = false;
  }

  $effect(() => {
    const currentDraft = editor.draft;
    const dirty = editor.dirty;
    const restoring = restoreCandidate !== null;
    const serialized = currentDraft ? JSON.stringify($state.snapshot(currentDraft)) : '';
    if (!currentDraft || restoring) return;
    if (!dirty) {
      editor.persist();
      editorAvailable = songDraftStore.available;
      return;
    }
    const timer = setTimeout(() => {
      editor.persist();
      editorAvailable = songDraftStore.available;
    }, 400);
    void serialized;
    return () => clearTimeout(timer);
  });

  beforeNavigate((navigation) => {
    if (editor.dirty && !editorAvailable && typeof window !== 'undefined') {
      if (!window.confirm(m.studio_editor_leave_confirm())) navigation.cancel();
    } else if (editor.dirty) {
      editor.persist();
    }
  });

  function focusIssue(issue: (typeof activeIssues)[number]): void {
    void tick().then(() => {
      let target: HTMLElement | null = null;
      if (issue.target?.kind === 'lyrics') {
        const textarea = document.querySelector<HTMLTextAreaElement>(
          `textarea[data-lyrics-id="${CSS.escape(issue.target.id)}"]`,
        );
        if (textarea) {
          target = textarea;
          const range = lineRange(textarea.value, issue.target.row + 1);
          textarea.focus();
          if (range) textarea.setSelectionRange(range.start, range.end);
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
      (target ?? document.getElementById('song-error-summary-heading'))?.focus();
    });
  }

  async function showSummary(issues: DraftIssue[]): Promise<void> {
    serverIssues = issues;
    await tick();
    document.getElementById('song-error-summary-heading')?.focus();
  }

  $effect(() => {
    const current = editor.draft ? JSON.stringify($state.snapshot(editor.draft)) : '';
    if (serverIssues.length && serverIssueSnapshot && current !== serverIssueSnapshot)
      serverIssues = [];
  });

  function saveApi(): SongSaveApi {
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
        const version = await versionMutation.mutateAsync(body);
        return { id: version.id, version_number: version.version_number };
      },
      async createLyrics(body) {
        const version = await versionMutation.mutateAsync(body);
        return { id: version.id, version_number: version.version_number };
      },
      async setCurrent(body) {
        await currentMutation.mutateAsync(body);
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
    if (saving || !editor.built || !editor.draft || writeCount.current > 0) return;
    if (editor.issues.length) {
      await showSummary([...editor.issues]);
      return;
    }
    const snapshot = editor.built;
    const snapshotDraft = JSON.parse(
      JSON.stringify($state.snapshot(editor.draft)),
    ) as typeof editor.draft;
    if (!snapshotDraft) return;
    const captured = session.capture();
    saving = true;
    let wrote = false;
    try {
      const outcome = await saveSong(saveApi(), { snapshot, base: { ...editor.base }, accepted });
      if (outcome.kind === 'saved') {
        wrote = true;
        editor.clearStoredIfEqual(snapshotDraft);
        addToast({ type: 'success', message: savedMessage(outcome) });
        if (captured.active) {
          editor.rebase(outcome.pair, { plan: snapshot.plan, lyrics: snapshot.lyrics });
          if (editor.dirty) {
            editor.persist();
            editorAvailable = songDraftStore.available;
          }
        }
        return;
      }
      if (outcome.kind === 'nothing') return;
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
        serverIssues = mapServerIssues(apiError, snapshot);
        serverIssueSnapshot = JSON.stringify(snapshotDraft);
        await tick();
        document.getElementById('song-error-summary-heading')?.focus();
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
      const sections = editor.draft?.sections ?? [];
      const index = sections.findIndex((section) => section.id === pending.sectionId);
      editor.removeSection(pending.sectionId);
      await tick();
      const focusId = editor.draft?.sections[index]?.id;
      if (focusId)
        document
          .querySelector<HTMLElement>(`[data-section-handle="${CSS.escape(focusId)}"]`)
          ?.focus();
      else addSectionButton?.focus();
      return;
    }
    if (pending.kind === 'base_missing') {
      try {
        const data = await qc.fetchQuery({ ...trackQueryOptions(trackId), staleTime: 0 });
        const pair = trackPair(data);
        seedCurrentVersions(data);
        const docs = {
          plan: (data.current_plan?.content ?? null) as PlanDocument | null,
          lyrics: (data.current_lyrics?.content ?? null) as LyricsDocument | null,
        };
        editor.rebase(pair, docs);
        await save({ server: pending.server });
      } catch {
        pageError = m.studio_editor_save_error();
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
    <section class="space-y-5" aria-labelledby="song-editor-title">
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
      {#if !editorAvailable && editor.dirty}<p
          role="status"
          class="rounded-lg bg-warning/10 p-3 text-sm"
        >
          {m.studio_editor_storage_unavailable()}
        </p>{/if}
      {#if restoreCandidate}
        <RestoreDraftBanner
          savedAt={restoreCandidate.record.savedAt}
          onrestore={restoreStored}
          ondiscard={discardStored}
        />
      {/if}
      {#if pageError}<p role="alert" class="rounded-lg bg-danger/10 p-3 text-sm text-danger">
          {pageError}
        </p>{/if}
      {#if activeIssues.length}<ErrorSummary
          issues={activeIssues}
          sections={activePlanSections}
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
        <SongSettings bind:draft={editor.draft} issues={activeIssues} {lyricsCount} />
        <div class="space-y-4">
          {#each editor.draft.sections as section, index (section.id)}
            <SectionCard
              bind:section={editor.draft.sections[index]}
              draft={editor.draft}
              {index}
              issues={activeIssues}
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
        {#if editor.dirty || saving}<SaveBar
            status={saving ? 'saving' : 'unsaved'}
            disabled={activeIssues.length > 0 || writeCount.current > 0 || !editor.dirty}
            {saving}
            onclose={() => void goto(studioTrack(projectId, trackId))}
            onsave={() => void save()}
          />
        {:else}<SaveBar
            status="saved"
            disabled
            onclose={() => void goto(studioTrack(projectId, trackId))}
            onsave={() => void save()}
          />{/if}
      {/if}
    </section>
  {/if}
</div>

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
