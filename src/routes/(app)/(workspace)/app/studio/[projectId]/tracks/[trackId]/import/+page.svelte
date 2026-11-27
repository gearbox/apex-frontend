<script lang="ts">
  import { tick } from 'svelte';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import {
    createMutation,
    createQuery,
    useIsMutating,
    useQueryClient,
  } from '@tanstack/svelte-query';
  import { ApiRequestError } from '$lib/api/errors';
  import TrackDocumentView from '$lib/components/studio/TrackDocumentView.svelte';
  import { studioTrack } from '$lib/studio/paths';
  import {
    importError,
    importWarningMessage,
    issueMessage,
    validationIssues,
  } from '$lib/studio/formErrors';
  import { STUDIO_LIMITS } from '$lib/studio/limits';
  import { isLanguageTag } from '$lib/studio/language';
  import { codePointLength } from '$lib/studio/text';
  import {
    buildImportRequest,
    importIssueField,
    importOutcome,
    lineRange,
    sameImportRequest,
    type ImportOutcome,
    type SunoImportForm,
  } from '$lib/studio/sunoImport';
  import { componentSession } from '$lib/utils/sessionTracker';
  import { studioMutationKeys, trackQueryOptions } from '$lib/queries/studioTracks';
  import { projectQueryOptions } from '$lib/queries/studioProjects';
  import {
    sunoImportMutationOptions,
    sunoImportPreview,
    type ImportRequest,
  } from '$lib/queries/studioVersions';
  import { addToast } from '$lib/stores/toasts';
  import { ROUTES } from '$lib/utils/routes';
  import * as m from '$paraglide/messages';

  type PreviewResult = Awaited<ReturnType<typeof sunoImportPreview>>;
  let trackId = $derived($page.params.trackId ?? '');
  let projectId = $derived($page.params.projectId ?? '');
  const qc = useQueryClient();
  const track = createQuery(() => trackQueryOptions(trackId));
  const project = createQuery(() => projectQueryOptions(projectId));
  const writeCount = useIsMutating({
    get mutationKey() {
      return studioMutationKeys.trackDocuments(trackId);
    },
    exact: true,
  });
  const previewMutation = createMutation(() => ({
    mutationFn: (request: ImportRequest) => sunoImportPreview(trackId, request),
  }));
  const importMutation = createMutation(() => sunoImportMutationOptions(qc, projectId, trackId));
  const session = componentSession();
  let form = $state<SunoImportForm>({
    style: '',
    exclude: '',
    lyrics: '',
    title: '',
    instrumental: 'keep',
    language: '',
  });
  let previewSnapshot = $state<{ request: ImportRequest; result: PreviewResult } | null>(null);
  let previewError = $state<{ request: ImportRequest; error: unknown } | null>(null);
  let lyricsTextarea = $state<HTMLTextAreaElement>();
  let lyricsGutter = $state<HTMLElement>();
  let moreDetails = $state<HTMLDetailsElement>();
  let languageInput = $state<HTMLInputElement>();
  let request = $derived(buildImportRequest(form));
  let previewIsCurrent = $derived(
    !!previewSnapshot && sameImportRequest(request, previewSnapshot.request),
  );
  let errorIsCurrent = $derived(!!previewError && sameImportRequest(request, previewError.request));
  let hasOutdatedContent = $derived(
    (!!previewSnapshot && !previewIsCurrent) || (!!previewError && !errorIsCurrent),
  );
  let currentPreviewError = $derived(errorIsCurrent ? previewError?.error : undefined);
  let canImport = $derived(previewIsCurrent && !writeCount.current && !importMutation.isPending);
  let styleLength = $derived(codePointLength(form.style));
  let excludeLength = $derived(codePointLength(form.exclude));
  let lyricsLength = $derived(codePointLength(form.lyrics));
  let titleLength = $derived(codePointLength(form.title));
  let lineCount = $derived(form.lyrics.split(/\r\n|\r|\n/).length);
  let requestError = $derived(
    currentPreviewError instanceof ApiRequestError ? currentPreviewError : null,
  );
  let errorIssues = $derived(validationIssues(currentPreviewError));
  let fieldIssues = $derived(
    errorIssues.filter((issue) => {
      const field = importIssueField(issue.path);
      return field === 'style' || field === 'exclude';
    }),
  );
  let generalIssues = $derived(
    errorIssues.filter((issue) => {
      const field = importIssueField(issue.path);
      return field === null || field === 'lyrics';
    }),
  );
  let sourceLines = $derived(readSourceLines(currentPreviewError));
  let hasInstrumentalLineIssue = $derived(
    errorIssues.some((issue) => issue.code === 'instrumental_with_lyric_lines') ||
      requestError?.error === 'instrumental_with_lyric_lines',
  );
  let hasLanguageIssue = $derived(
    errorIssues.some((issue) => issue.code === 'language_required') ||
      requestError?.error === 'language_required',
  );
  let hasReservedTempoIssue = $derived(
    errorIssues.some((issue) => issue.code === 'reserved_tempo_tag') ||
      requestError?.error === 'reserved_tempo_tag',
  );
  let artistTempoIssue = $derived(
    errorIssues.some(
      (issue) => issue.code === 'reserved_tempo_tag' && issue.path.includes('artist.style_tags'),
    ),
  );
  let styleTooLong = $derived(styleLength > STUDIO_LIMITS.sunoStyle);
  let excludeTooLong = $derived(excludeLength > STUDIO_LIMITS.sunoExclude);
  let lyricsTooLong = $derived(lyricsLength > STUDIO_LIMITS.sunoLyrics);
  let titleTooLong = $derived(titleLength > STUDIO_LIMITS.trackTitle);
  let languageValid = $derived(form.language === '' || isLanguageTag(form.language));
  let canPreview = $derived(
    !styleTooLong &&
      !excludeTooLong &&
      !lyricsTooLong &&
      !titleTooLong &&
      languageValid &&
      !previewMutation.isPending,
  );

  function issuesForField(field: 'style' | 'exclude') {
    return fieldIssues.filter((issue) => importIssueField(issue.path) === field);
  }

  function errorSummary(error: unknown): string {
    const summary = importError(error);
    const issueText = validationIssues(error).map(issueMessage).join(' ');
    return issueText && summary === issueText ? m.studio_import_invalid() : summary;
  }

  function readSourceLines(error: unknown): Record<string, number | number[]> {
    if (!(error instanceof ApiRequestError) || !error.detail || typeof error.detail !== 'object')
      return {};
    const source = (error.detail as { source_lines?: unknown }).source_lines;
    if (!source || typeof source !== 'object') return {};
    return source as Record<string, number | number[]>;
  }

  function issueLines(path: string): number[] {
    const source = sourceLines[path];
    if (typeof source === 'number') return [source];
    return Array.isArray(source)
      ? source.filter((line): line is number => Number.isInteger(line))
      : [];
  }

  async function revealLanguage(): Promise<void> {
    await tick();
    if (!hasLanguageIssue) return;
    if (moreDetails) moreDetails.open = true;
    await tick();
    languageInput?.focus();
  }

  async function runPreview() {
    if (!canPreview) return;
    const snapshot = buildImportRequest(form);
    const captured = session.capture();
    previewError = null;
    try {
      const result = await previewMutation.mutateAsync(snapshot);
      if (!captured.active) return;
      previewSnapshot = { request: snapshot, result };
    } catch (error) {
      const message = importError(error);
      if (!captured.active) {
        if (message) addToast({ type: 'error', message });
        return;
      }
      previewError = { request: snapshot, error };
      await revealLanguage();
    }
  }

  async function importPreview() {
    const displayedPreview = previewSnapshot;
    if (!canImport || !displayedPreview) return;
    const captured = session.capture();
    try {
      const result = await importMutation.mutateAsync(displayedPreview.request);
      const outcome = importOutcome(result);
      addToast({
        type: outcome.kind === 'nothing' ? 'info' : 'success',
        message: importSuccessMessage(outcome),
      });
      if (captured.active) void goto(studioTrack(projectId, trackId));
    } catch (error) {
      if (!captured.active) {
        const message = importError(error);
        if (message) addToast({ type: 'error', message });
        return;
      }
      previewError = { request: displayedPreview.request, error };
    }
  }

  function importSuccessMessage(outcome: ImportOutcome): string {
    if (outcome.kind === 'nothing') return m.studio_import_nothing_changed();
    if (outcome.kind === 'plan') return m.studio_import_new_plan({ plan: String(outcome.plan) });
    if (outcome.kind === 'plan_and_lyrics')
      return m.studio_import_new_plan_and_lyrics({
        plan: String(outcome.plan),
        lyrics: String(outcome.lyrics),
      });
    if (outcome.kind === 'plan_lyrics_cleared')
      return m.studio_import_new_plan_lyrics_cleared({ plan: String(outcome.plan) });
    if (outcome.kind === 'lyrics')
      return m.studio_import_new_lyrics({ lyrics: String(outcome.lyrics) });
    return m.studio_import_lyrics_cleared();
  }

  function selectLine(line: number) {
    if (!lyricsTextarea) return;
    const range = lineRange(form.lyrics, line);
    if (!range) return;
    lyricsTextarea.focus();
    lyricsTextarea.setSelectionRange(range.start, range.end);
  }

  async function setInstrumentalOffAndPreview() {
    form.instrumental = 'off';
    await tick();
    await runPreview();
  }

  function syncLineGutter(event: Event) {
    if (lyricsGutter)
      lyricsGutter.scrollTop = (event.currentTarget as HTMLTextAreaElement).scrollTop;
  }
</script>

<svelte:head><title>{m.studio_import_title()}</title></svelte:head>

<main class="mx-auto max-w-5xl px-4 pb-28 pt-6 md:px-8 md:pb-8">
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
    <h1 class="font-display text-2xl font-semibold md:text-3xl">{m.studio_import_title()}</h1>
    <p class="mt-2 text-text-muted">{track.data.title}</p>
    {#if track.isRefetchError}<p class="mt-3 text-sm text-warning" role="status">
        {m.studio_refresh_error()}
      </p>{/if}

    <div class="mt-6 grid gap-5 md:grid-cols-2">
      <div>
        <label for="suno-style" class="mb-2 block font-medium">{m.studio_import_style()}</label>
        <textarea
          id="suno-style"
          class="min-h-28 w-full rounded-xl border border-border bg-surface p-3"
          bind:value={form.style}
          aria-invalid={styleTooLong}
          aria-describedby="suno-style-count"></textarea>
        <p
          id="suno-style-count"
          class="mt-1 text-right text-xs {styleTooLong ? 'text-danger' : 'text-text-muted'}"
        >
          {styleLength} / {STUDIO_LIMITS.sunoStyle}
        </p>
        {#each issuesForField('style') as issue, index (`${issue.path}-${index}`)}
          {#if !issueLines(issue.path).length}<p role="alert" class="text-sm text-danger">
              {issueMessage(issue)}
            </p>{/if}
        {/each}
      </div>
      <div>
        <label for="suno-exclude" class="mb-2 block font-medium">{m.studio_import_exclude()}</label>
        <textarea
          id="suno-exclude"
          class="min-h-28 w-full rounded-xl border border-border bg-surface p-3"
          bind:value={form.exclude}
          aria-invalid={excludeTooLong}
          aria-describedby="suno-exclude-count"></textarea>
        <p
          id="suno-exclude-count"
          class="mt-1 text-right text-xs {excludeTooLong ? 'text-danger' : 'text-text-muted'}"
        >
          {excludeLength} / {STUDIO_LIMITS.sunoExclude}
        </p>
        {#each issuesForField('exclude') as issue, index (`${issue.path}-${index}`)}
          {#if !issueLines(issue.path).length}<p role="alert" class="text-sm text-danger">
              {issueMessage(issue)}
            </p>{/if}
        {/each}
      </div>
      <div class="md:col-span-2">
        <label for="suno-lyrics" class="mb-2 block font-medium">{m.studio_import_lyrics()}</label>
        <div class="lyrics-editor rounded-xl border border-border bg-surface">
          <pre bind:this={lyricsGutter} aria-hidden="true" class="lyrics-gutter">{Array.from(
              { length: lineCount },
              (_, index) => index + 1,
            ).join('\n')}</pre>
          <textarea
            bind:this={lyricsTextarea}
            id="suno-lyrics"
            class="lyrics-textarea"
            bind:value={form.lyrics}
            onscroll={syncLineGutter}
            aria-invalid={lyricsTooLong}
            aria-describedby="suno-lyrics-count"
            spellcheck="false"></textarea>
        </div>
        <p
          id="suno-lyrics-count"
          class="mt-1 text-right text-xs {lyricsTooLong ? 'text-danger' : 'text-text-muted'}"
        >
          {lyricsLength} / {STUDIO_LIMITS.sunoLyrics}
        </p>
      </div>
      <details bind:this={moreDetails} class="md:col-span-2 rounded-xl border border-border p-4">
        <summary class="cursor-pointer font-medium">{m.studio_import_more()}</summary>
        <div class="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label for="suno-title" class="mb-2 block">{m.studio_import_title_optional()}</label>
            <input
              id="suno-title"
              class="w-full rounded-lg border border-border bg-surface p-2"
              bind:value={form.title}
              aria-invalid={titleTooLong}
            />
            <p class="mt-1 text-right text-xs {titleTooLong ? 'text-danger' : 'text-text-muted'}">
              {titleLength} / {STUDIO_LIMITS.trackTitle}
            </p>
          </div>
          <fieldset>
            <legend class="mb-2">{m.studio_import_instrumental()}</legend>
            <div
              role="radiogroup"
              aria-label={m.studio_import_instrumental()}
              class="flex flex-wrap gap-4"
            >
              <label class="inline-flex items-center gap-2"
                ><input
                  type="radio"
                  name="instrumental"
                  value="keep"
                  bind:group={form.instrumental}
                />{m.studio_import_keep_current()}</label
              >
              <label class="inline-flex items-center gap-2"
                ><input
                  type="radio"
                  name="instrumental"
                  value="on"
                  bind:group={form.instrumental}
                />{m.studio_import_on()}</label
              >
              <label class="inline-flex items-center gap-2"
                ><input
                  type="radio"
                  name="instrumental"
                  value="off"
                  bind:group={form.instrumental}
                />{m.studio_import_off()}</label
              >
            </div>
          </fieldset>
          <div>
            <label for="suno-language" class="mb-2 block">{m.studio_import_language()}</label>
            <input
              bind:this={languageInput}
              id="suno-language"
              class="w-full rounded-lg border border-border bg-surface p-2"
              bind:value={form.language}
              aria-invalid={!languageValid}
              aria-describedby="suno-language-hint"
            />
            <p id="suno-language-hint" class="mt-1 text-sm text-text-muted">
              {m.studio_import_language_hint()}
            </p>
          </div>
        </div>
      </details>
    </div>

    {#if hasOutdatedContent}
      <p id="import-stale-status" role="status" class="mt-6 rounded-lg bg-surface p-3 text-sm">
        {m.studio_import_preview_outdated()}
      </p>
      <details class="mt-3 rounded-xl border border-border p-4">
        <summary class="cursor-pointer font-medium">
          {m.studio_import_show_previous_preview()}
        </summary>
        {#if previewSnapshot && !previewIsCurrent}
          {@const previous = previewSnapshot.result}
          <section
            class="mt-4 rounded-xl border border-border p-4"
            aria-label={m.studio_import_status()}
          >
            <h2 class="font-semibold">
              {m.studio_import_status()} · {m.studio_import_preview_outdated()}
            </h2>
            <div class="mt-3 flex flex-wrap gap-3 text-sm">
              <span
                >{previous.plan_unchanged ? m.studio_plan_unchanged() : m.studio_plan_new()}</span
              >
              {#if previous.lyrics === null && track.data.current_lyrics_version_id}
                <strong>{m.studio_lyrics_none_clear()}</strong>
              {:else}
                <span
                  >{previous.lyrics_unchanged
                    ? m.studio_lyrics_unchanged()
                    : m.studio_lyrics_new()}</span
                >
              {/if}
            </div>
            {#if previous.warnings.length}
              <ul class="mt-4 list-disc space-y-2 pl-5 text-sm text-warning">
                {#each previous.warnings as warning, index (`${warning.code}-${index}`)}
                  <li>{importWarningMessage(warning.code)}</li>
                {/each}
              </ul>
            {/if}
            {#if !previous.round_trip.lyrics}
              <p class="mt-4 text-sm">{m.studio_import_lyrics_round_trip_hint()}</p>
            {/if}
            <div class="mt-4 rounded-xl bg-surface p-4">
              <TrackDocumentView plan={previous.plan} lyrics={previous.lyrics} />
            </div>
          </section>
        {/if}
        {#if previewError && !errorIsCurrent}
          <section class="mt-4 rounded-xl border border-border p-4">
            <h2 class="font-semibold">
              {m.studio_import_error_heading()} · {m.studio_import_preview_outdated()}
            </h2>
            <p class="mt-2 text-sm">{errorSummary(previewError.error)}</p>
            {#if validationIssues(previewError.error).length}
              <ul class="mt-3 space-y-2">
                {#each validationIssues(previewError.error) as issue, index (`${issue.path}-${issue.code}-${index}`)}
                  <li class="text-sm">{issueMessage(issue)}</li>
                {/each}
              </ul>
            {/if}
          </section>
        {/if}
      </details>
    {/if}

    {#if currentPreviewError}
      <section
        class="mt-6 rounded-xl border border-danger/40 bg-surface p-4"
        aria-labelledby="import-error-heading"
      >
        <h2 id="import-error-heading" class="font-semibold">{m.studio_import_error_heading()}</h2>
        <p class="mt-2 text-sm">{errorSummary(currentPreviewError)}</p>
        {#if hasReservedTempoIssue && artistTempoIssue && project.data?.artist_id}
          <a
            class="mt-2 inline-block text-accent underline"
            href={`${ROUTES.artists}/${project.data.artist_id}`}
          >
            {m.studio_open_artist_profile()}
          </a>
        {/if}
        {#if errorIssues.length}
          <ul class="mt-3 space-y-2">
            {#each generalIssues as issue, index (`${issue.path}-${issue.code}-${index}`)}
              <li class="text-sm">
                {issueMessage(issue)}
                {#each issueLines(issue.path) as line (`${issue.path}-${line}`)}
                  <button class="ml-2 text-accent underline" onclick={() => selectLine(line)}>
                    {m.studio_line_number({ line: String(line) })}
                  </button>
                {/each}
              </li>
            {/each}
          </ul>
        {/if}
        {#if hasInstrumentalLineIssue}
          <button
            class="mt-3 rounded-lg border border-border px-3 py-2 text-sm"
            onclick={() => void setInstrumentalOffAndPreview()}
          >
            {m.studio_import_set_off()}
          </button>
        {/if}
        {#if requestError?.error === 'import_invalid' && !errorIssues.length}
          <ul class="mt-3 space-y-2">
            {#each Object.entries(sourceLines).flatMap( ([, lines]) => (Array.isArray(lines) ? lines : [lines]) ) as line, index (`source-${line}-${index}`)}
              <li>
                <button class="text-accent underline" onclick={() => selectLine(Number(line))}
                  >{m.studio_line_number({ line: String(line) })}</button
                >
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    {/if}

    {#if previewIsCurrent && previewSnapshot}
      {@const result = previewSnapshot.result}
      <section
        class="mt-8 rounded-2xl border border-border p-4 md:p-6"
        aria-labelledby="import-preview-heading"
      >
        <h2 id="import-preview-heading" class="font-display text-xl font-semibold">
          {m.studio_import_status()}
        </h2>
        <div class="mt-3 flex flex-wrap gap-3 text-sm">
          <span>{result.plan_unchanged ? m.studio_plan_unchanged() : m.studio_plan_new()}</span>
          {#if result.lyrics === null && track.data.current_lyrics_version_id}
            <strong>{m.studio_lyrics_none_clear()}</strong>
          {:else}
            <span
              >{result.lyrics_unchanged ? m.studio_lyrics_unchanged() : m.studio_lyrics_new()}</span
            >
          {/if}
        </div>
        {#if result.warnings.length}
          <ul class="mt-4 list-disc space-y-2 pl-5 text-sm text-warning">
            {#each result.warnings as warning, index (`${warning.code}-${index}`)}
              <li>
                {importWarningMessage(warning.code)}
                {#if warning.line}<button
                    class="ml-2 text-accent underline"
                    onclick={() => selectLine(warning.line!)}
                    >{m.studio_line_number({ line: String(warning.line) })}</button
                  >{/if}
              </li>
            {/each}
          </ul>
        {/if}
        <div class="mt-4 space-y-2 text-sm">
          {#if !result.round_trip.style}<p>
              {m.studio_import_style_normalized({
                text: [
                  ...(result.plan.global_style?.tags ?? []),
                  ...(result.plan.tempo_bpm ? [`${result.plan.tempo_bpm} BPM`] : []),
                ].join(', '),
              })}
            </p>{/if}
          {#if !result.round_trip.exclude}<p>
              {m.studio_import_exclude_normalized({
                text: (result.plan.global_style?.avoid ?? []).join(', '),
              })}
            </p>{/if}
          {#if !result.round_trip.lyrics}<p>
              {m.studio_import_lyrics_round_trip_hint()}
            </p>{/if}
        </div>
        <div class="mt-6 rounded-xl bg-surface p-4">
          <TrackDocumentView plan={result.plan} lyrics={result.lyrics} />
        </div>
      </section>
    {/if}
  {/if}
</main>

{#if track.data}
  <div class="import-footer">
    <button
      class="rounded-lg border border-border px-4 py-3"
      disabled={!canPreview}
      onclick={() => void runPreview()}
    >
      {previewMutation.isPending ? m.common_loading() : m.studio_preview()}
    </button>
    <button
      class="rounded-lg bg-accent px-4 py-3 text-bg disabled:opacity-50"
      disabled={!canImport}
      aria-describedby={hasOutdatedContent ? 'import-stale-status' : undefined}
      onclick={() => void importPreview()}
    >
      {importMutation.isPending ? m.common_loading() : m.studio_import_action()}
    </button>
  </div>
{/if}

<style>
  .lyrics-editor {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    overflow: hidden;
  }
  .lyrics-gutter,
  .lyrics-textarea {
    min-height: 15rem;
    max-height: 32rem;
    overflow-y: auto;
    padding-block: 0.75rem;
    font:
      0.875rem/1.5 ui-monospace,
      SFMono-Regular,
      Menlo,
      monospace;
  }
  .lyrics-gutter {
    margin: 0;
    min-width: 2.5rem;
    padding-inline: 0.75rem 0.5rem;
    color: var(--apex-text-muted);
    text-align: right;
    user-select: none;
  }
  .lyrics-textarea {
    width: 100%;
    resize: vertical;
    border: 0;
    background: transparent;
    padding-inline: 0.75rem;
    white-space: pre;
  }
  .import-footer {
    position: sticky;
    z-index: 20;
    bottom: 0;
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    border-top: 1px solid var(--apex-border);
    background: var(--apex-bg);
    padding: 0.75rem 1rem max(0.75rem, env(safe-area-inset-bottom));
  }
  @media (min-width: 768px) {
    .import-footer {
      position: static;
      padding-inline: 0;
      border-top: 0;
      background: transparent;
    }
  }
</style>
