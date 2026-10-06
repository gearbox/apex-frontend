<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { createQuery, useQueryClient } from '@tanstack/svelte-query';
  import { X } from '@lucide/svelte';
  import FrameScrubber from '$lib/components/frames/FrameScrubber.svelte';
  import FrameStrip from '$lib/components/frames/FrameStrip.svelte';
  import ManualFrameStrip, {
    type ManualFrame,
  } from '$lib/components/frames/ManualFrameStrip.svelte';
  import MediaImage from '$lib/media/MediaImage.svelte';
  import {
    FrameExtractionSession,
    FrameSessionError,
    type LocalPreviewFrame,
    type ExtractedLocalFrame,
  } from './frameExtractionSession';
  import { FrameEncodingError } from './frameEncoding';
  import { openFeedbackDialog } from '$lib/stores/feedbackDialog.svelte';
  import { type CapturedVideoFrame } from '$lib/components/frames/videoFrameCapture';
  import { storageKeys } from '$lib/queries/storage';
  import { libraryKeys } from '$lib/queries/library';
  import { generationStore } from '$lib/stores/generation';
  import { toMediaSrc } from '$lib/media';
  import { isDesktop } from '$lib/utils/breakpoints';
  import { ROUTES } from '$lib/utils/routes';
  import Spinner from '$lib/components/ui/Spinner.svelte';
  import type { components } from '$lib/api/types';
  import * as m from '$paraglide/messages';
  import { addToast } from '$lib/stores/toasts';
  import { prefillSourceForGeneration, sourceMediaDraft } from '$lib/services/generationPrefill';
  import { providersQueryOptions } from '$lib/queries/providers';

  type MediaObject = components['schemas']['MediaObject'];
  const MAX_SELECTIONS = 50;

  let {
    assetRef,
    media,
    onclose,
    trigger = null,
  }: {
    assetRef: string;
    media: MediaObject;
    onclose: () => void;
    /** The parent lightbox's Extract frames button, used for explicit focus restoration. */
    trigger?: HTMLElement | null;
  } = $props();

  let dialogEl: HTMLDivElement;
  let scrollViewport: HTMLDivElement;
  let closeButton: HTMLButtonElement | null = null;
  let preview = $state<LocalPreviewFrame[] | null>(null);
  let extractedFrames = $state<ExtractedLocalFrame[]>([]);
  let selection = $state<Set<number>>(new Set());
  let manualFrames = $state<ManualFrame[]>([]);
  let manualFeedback = $state('');
  let manualFeedbackSequence = $state(0);
  let manualFeedbackTimer: ReturnType<typeof setTimeout> | null = null;
  let submittedTimestamps = $state<number[] | null>(null);
  let scrubTimestamp = $state(0);
  let phase = $state<'loading' | 'ready' | 'extracting' | 'results' | 'unsupported' | 'failed'>(
    'loading',
  );
  let timelineMax = $state(0);
  let progress = $state({ done: 0, total: 0 });
  let unavailable = $state(false);
  let session = $state<FrameExtractionSession>();
  let sessionUnsubscribe: (() => void) | null = null;
  let decoderHost: HTMLDivElement;
  let failedOperation = $state<'preview' | 'extract'>('preview');
  let errorMessage = $state('');
  let disposed = false;
  let operationVersion = 0;
  let previouslyFocused: HTMLElement | null = null;
  let focusRestoreScheduled = false;
  let backdropPointer: { id: number; x: number; y: number } | null = null;
  let addFrameButton: HTMLButtonElement | null = null;
  const automaticFrameButtons = new Map<number, HTMLButtonElement>();
  const manualFrameButtons = new Map<number, HTMLButtonElement>();

  const queryClient = useQueryClient();
  const providersQuery = createQuery(() => providersQueryOptions());
  const durationMs = $derived(media.original.duration_ms ?? 0);
  const maxTimestamp = $derived(timelineMax);
  const selectedTimestamps = $derived.by(() => [...selection].sort((a, b) => a - b));
  const selectedCount = $derived(selection.size);
  const selectionLocked = $derived(phase === 'extracting');
  const canEditSelection = $derived((phase === 'ready' || phase === 'failed') && !disposed);
  const canExtract = $derived(selectedCount > 0 && canEditSelection);
  const videoAspectRatio = $derived(
    preview?.[0] ? `${preview[0].width} / ${preview[0].height}` : '16 / 9',
  );

  function formatTimestamp(timestampMs: number): string {
    const value = Math.max(0, Math.round(timestampMs));
    const minutes = Math.floor(value / 60_000);
    const seconds = Math.floor((value % 60_000) / 1_000);
    const milliseconds = value % 1_000;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(
      milliseconds,
    ).padStart(3, '0')}`;
  }

  function clampTimestamp(timestampMs: number): number {
    if (durationMs < 1) return 0;
    return Math.min(Math.max(0, Math.round(timestampMs)), durationMs);
  }

  function clearManualFrames() {
    manualFrames.forEach((frame) => session?.release(frame.previewUrl));
    manualFrames = [];
  }

  function clearManualFeedback() {
    if (manualFeedbackTimer) clearTimeout(manualFeedbackTimer);
    manualFeedbackTimer = null;
    manualFeedback = '';
  }

  function showManualFeedback(message: string) {
    clearManualFeedback();
    manualFeedback = message;
    manualFeedbackSequence += 1;
    manualFeedbackTimer = setTimeout(() => {
      manualFeedback = '';
      manualFeedbackTimer = null;
    }, 5_000);
  }

  function aspectRatioFor(mediaObject: MediaObject): string {
    const { width, height } = mediaObject.original;
    return width && height ? `${width} / ${height}` : '1 / 1';
  }

  function setFailure(operation: 'preview' | 'extract', error: unknown) {
    if (disposed) return;
    failedOperation = operation;
    if (
      (error instanceof FrameSessionError || error instanceof FrameEncodingError) &&
      ['unsupported', 'canvas-not-origin-clean', 'timeout', 'unavailable'].includes(
        error instanceof FrameSessionError ? error.failure : error.code,
      )
    ) {
      unavailable = error instanceof FrameSessionError && error.failure === 'unavailable';
      phase = 'unsupported';
      return;
    }
    errorMessage =
      error instanceof FrameEncodingError && error.code === 'frame-too-large'
        ? m.frames_encoding_too_large()
        : m.frames_operation_failed();
    phase = 'failed';
  }

  function restoreFocus() {
    previouslyFocused?.focus({ preventScroll: true });
  }

  function closeModal(): Promise<void> {
    focusRestoreScheduled = true;
    disposed = true;
    operationVersion++;
    sessionUnsubscribe?.();
    sessionUnsubscribe = null;
    session?.dispose();
    onclose();
    return tick().then(restoreFocus);
  }

  async function reportVideo() {
    await closeModal();
    openFeedbackDialog({ assetRef, initialCategory: 'bug' });
  }

  async function startPreview() {
    const version = ++operationVersion;
    sessionUnsubscribe?.();
    sessionUnsubscribe = null;
    session?.dispose();
    session = new FrameExtractionSession({
      assetRef,
      media,
      onFailure: (error) => setFailure('preview', error),
    });
    const currentSession = session;
    sessionUnsubscribe = currentSession.subscribe(() => {
      if (session !== currentSession || disposed) return;
      extractedFrames = [...currentSession.results];
      progress = { ...currentSession.progress };
    });
    session.mountVideo(decoderHost);
    preview = null;
    extractedFrames = [];
    progress = { done: 0, total: 0 };
    selection = new Set();
    clearManualFrames();
    phase = 'loading';
    try {
      const frames = await session.load();
      if (disposed || version !== operationVersion) return;
      preview = frames;
      timelineMax = session.maxTimestamp;
      phase = 'ready';
    } catch (error) {
      if (version === operationVersion) setFailure('preview', error);
    }
  }

  function selectTimestamp(timestampMs: number): boolean {
    if (!canEditSelection) return false;
    const clampedTimestamp = clampTimestamp(timestampMs);
    if (selection.has(clampedTimestamp)) return true;
    if (selection.size >= MAX_SELECTIONS) return false;
    selection = new Set([...selection, clampedTimestamp]);
    return true;
  }

  async function toggleTimestamp(timestampMs: number) {
    if (!canEditSelection) return;
    const clampedTimestamp = clampTimestamp(timestampMs);
    if (selection.has(clampedTimestamp)) {
      selection = new Set([...selection].filter((timestamp) => timestamp !== clampedTimestamp));
      return;
    }
    selectTimestamp(clampedTimestamp);
  }

  function setScrubTimestamp(timestampMs: number): number {
    if (!canEditSelection) return scrubTimestamp;
    scrubTimestamp = Math.min(maxTimestamp, clampTimestamp(timestampMs));
    return scrubTimestamp;
  }

  function setFrameButton(
    buttons: Map<number, HTMLButtonElement>,
    timestampMs: number,
    element: HTMLButtonElement | null,
  ) {
    if (element) buttons.set(timestampMs, element);
    else buttons.delete(timestampMs);
  }

  function focusFrame(buttons: Map<number, HTMLButtonElement>, timestampMs: number) {
    const button = buttons.get(timestampMs);
    if (!button) return false;
    button.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
    button.focus({ preventScroll: true });
    return true;
  }

  async function handleAddFrame(frame: CapturedVideoFrame) {
    if (!canEditSelection) {
      session?.release(frame.previewUrl);
      return;
    }

    const timestampMs = clampTimestamp(frame.timestampMs);
    const automaticFrame = preview?.find(
      (candidate) => clampTimestamp(candidate.timestampMs) === timestampMs,
    );
    if (automaticFrame) {
      session?.release(frame.previewUrl);
      if (selectTimestamp(timestampMs)) {
        showManualFeedback(m.frames_already_available_automatic());
        await tick();
        focusFrame(automaticFrameButtons, timestampMs);
      } else {
        showManualFeedback(m.frames_selected_limit());
      }
      return;
    }

    const existingFrame = manualFrames.find((candidate) => candidate.timestampMs === timestampMs);
    if (existingFrame) {
      session?.release(frame.previewUrl);
      if (selectTimestamp(timestampMs)) {
        showManualFeedback(m.frames_frame_already_added());
        await tick();
        focusFrame(manualFrameButtons, timestampMs);
      } else {
        showManualFeedback(m.frames_selected_limit());
      }
      return;
    }

    if (manualFrames.length >= MAX_SELECTIONS || !selectTimestamp(timestampMs)) {
      session?.release(frame.previewUrl);
      showManualFeedback(m.frames_selected_limit());
      return;
    }

    manualFrames = [...manualFrames, { ...frame, timestampMs, id: `manual-${timestampMs}` }];
    showManualFeedback(m.frames_frame_added());
    await tick();
    focusFrame(manualFrameButtons, timestampMs);
  }

  async function removeManualFrame(frame: ManualFrame) {
    if (!canEditSelection) return;
    const removedIndex = manualFrames.findIndex((candidate) => candidate.id === frame.id);
    session?.release(frame.previewUrl);
    manualFrames = manualFrames.filter((candidate) => candidate.id !== frame.id);
    selection = new Set([...selection].filter((timestampMs) => timestampMs !== frame.timestampMs));
    clearManualFeedback();
    await tick();
    const replacement = manualFrames[removedIndex] ?? manualFrames[removedIndex - 1];
    if (replacement) {
      focusFrame(manualFrameButtons, replacement.timestampMs);
    } else {
      addFrameButton?.focus();
    }
  }

  async function startExtraction() {
    if (!canEditSelection || selectedTimestamps.length === 0 || !session) return;
    const version = ++operationVersion;
    submittedTimestamps = [...selectedTimestamps];
    phase = 'extracting';
    errorMessage = '';
    try {
      const frames = await session.extract(submittedTimestamps, () => {
        void queryClient.invalidateQueries({ queryKey: storageKeys.all });
        void queryClient.invalidateQueries({ queryKey: libraryKeys.all });
      });
      if (disposed || version !== operationVersion) return;
      extractedFrames = [...frames];
      phase = 'results';
    } catch (error) {
      if (version === operationVersion) setFailure('extract', error);
    }
  }

  function retry() {
    if (failedOperation === 'preview' && preview && session) {
      phase = 'ready';
      session.scrub(scrubTimestamp, (error) => setFailure('preview', error));
    } else if (failedOperation === 'preview') {
      void startPreview();
    } else {
      void startExtraction();
    }
  }

  function useAsInput(frame: ExtractedLocalFrame) {
    const didPrefill = prefillSourceForGeneration({
      providers: providersQuery.data,
      mode: 'i2i',
      preferredModel: $generationStore.model,
      source: {
        ...sourceMediaDraft(`upload:${frame.id}`, frame.media, 'Extracted frame'),
        previewUrl: toMediaSrc(frame.media.original.url),
      },
    });
    if (!didPrefill) {
      addToast({ type: 'error', message: m.library_action_no_model() });
      return;
    }
    void goto(ROUTES.create);
    closeModal();
  }

  function focusableDialogElements(): HTMLElement[] {
    if (!dialogEl) return [];
    return Array.from(
      dialogEl.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
  }

  function handleKeydown(event: KeyboardEvent) {
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      closeModal();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = focusableDialogElements();
    if (focusable.length === 0) {
      event.preventDefault();
      dialogEl.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleBackdropPointerDown(event: PointerEvent) {
    backdropPointer = null;
    if (
      !$isDesktop ||
      event.target !== event.currentTarget ||
      !event.isPrimary ||
      event.pointerType === 'touch' ||
      event.button !== 0
    ) {
      return;
    }
    backdropPointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }

  function handleBackdropPointerMove(event: PointerEvent) {
    if (!backdropPointer || event.pointerId !== backdropPointer.id) return;
    if (Math.hypot(event.clientX - backdropPointer.x, event.clientY - backdropPointer.y) > 8) {
      backdropPointer = null;
    }
  }

  function handleBackdropPointerCancel() {
    backdropPointer = null;
  }

  function handleBackdropPointerUp(event: PointerEvent) {
    const pointer = backdropPointer;
    backdropPointer = null;
    if (
      !pointer ||
      !$isDesktop ||
      event.pointerId !== pointer.id ||
      event.target !== event.currentTarget ||
      !event.isPrimary ||
      event.pointerType === 'touch' ||
      event.button !== 0 ||
      Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 8
    ) {
      return;
    }
    closeModal();
  }

  onMount(() => {
    previouslyFocused =
      trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    closeButton?.focus({ preventScroll: true });
    void startPreview();
  });

  onDestroy(() => {
    disposed = true;
    sessionUnsubscribe?.();
    sessionUnsubscribe = null;
    session?.dispose();
    clearManualFeedback();
    clearManualFrames();
    if (!focusRestoreScheduled) void tick().then(restoreFocus);
  });
</script>

<div
  bind:this={dialogEl}
  class="fixed inset-0 z-[250] flex bg-black/70 p-0 backdrop-blur-sm md:items-center md:justify-center md:p-6"
  onpointerdown={handleBackdropPointerDown}
  onpointermove={handleBackdropPointerMove}
  onpointerup={handleBackdropPointerUp}
  onpointercancel={handleBackdropPointerCancel}
  onkeydown={handleKeydown}
  role="dialog"
  tabindex="-1"
  aria-modal="true"
  aria-label={m.frames_title()}
>
  <div
    class="flex h-[100dvh] max-h-none w-full flex-col overflow-hidden rounded-none bg-bg shadow-2xl md:h-auto md:max-h-[92dvh] md:max-w-3xl md:rounded-2xl md:border md:border-border"
  >
    <div bind:this={decoderHost} aria-hidden="true"></div>
    <header
      class="flex shrink-0 items-center justify-between border-b border-border px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:px-5 md:py-3"
    >
      <div>
        <h2 class="text-base font-semibold text-text">{m.frames_title()}</h2>
        {#if preview}
          <p class="mt-0.5 text-xs text-text-dim">{formatTimestamp(durationMs)}</p>
        {/if}
      </div>
      <button
        bind:this={closeButton}
        type="button"
        onclick={closeModal}
        class="flex min-h-11 min-w-11 items-center justify-center rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-hover hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        aria-label={m.frames_close()}
      >
        <X size={18} />
      </button>
    </header>

    <div
      bind:this={scrollViewport}
      data-frame-modal-scroll
      class="min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]"
      style="overscroll-behavior-y: contain; -webkit-overflow-scrolling: touch;"
    >
      <div class="min-h-full p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:min-h-0 md:p-5">
        {#if phase === 'unsupported'}
          <div class="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
            <h3 class="text-base font-semibold text-text">{m.frames_unsupported_title()}</h3>
            <p class="max-w-lg text-sm text-text-muted">
              {unavailable ? m.frames_unavailable_body() : m.frames_unsupported_body()}
            </p>
            <button
              type="button"
              onclick={() => void reportVideo()}
              class="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white"
              >{m.frames_report_video()}</button
            >
          </div>
        {:else if phase === 'loading'}
          <div class="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
            <Spinner size="xl" />
            <p class="text-sm text-text-muted" role="status" aria-live="polite">
              {m.frames_preview_loading()}
            </p>
          </div>
        {:else if phase === 'failed' && !preview}
          <div class="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
            <p class="max-w-lg text-sm text-danger" role="alert">{errorMessage}</p>
            <button
              type="button"
              onclick={retry}
              class="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-accent/90"
            >
              {m.frames_retry()}
            </button>
          </div>
        {:else if phase === 'results'}
          <p class="text-sm text-text-muted">{m.frames_preview_ready()}</p>
        {:else if preview}
          <div class="flex flex-col gap-5">
            {#if phase === 'failed'}
              <div
                class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-danger/30 bg-danger/10 p-3"
              >
                <p class="text-xs text-danger" role="alert">{errorMessage}</p>
                <button
                  type="button"
                  onclick={retry}
                  class="rounded-md border border-danger/30 px-2.5 py-1 text-xs font-semibold text-danger transition-colors hover:bg-danger/10"
                >
                  {m.frames_retry()}
                </button>
              </div>
            {:else if phase === 'extracting'}
              <div
                class="flex items-center gap-2 rounded-lg border border-border bg-surface p-3 text-xs text-text-muted"
                role="status"
                aria-live="polite"
              >
                <Spinner size="sm" />
                <span>
                  {m.frames_extract_progress({ done: progress.done, total: progress.total })}
                </span>
              </div>
            {/if}

            <section>
              <div class="mb-2 flex items-center justify-between gap-3">
                <h3 class="text-sm font-semibold text-text">{m.frames_automatic()}</h3>
                <span class="text-xs tabular-nums text-text-muted">
                  {m.frames_selected_count({ count: selectedCount })}
                </span>
              </div>
              <FrameStrip
                frames={preview}
                {selection}
                sectionLabel={m.frames_automatic()}
                aspectRatio={videoAspectRatio}
                disabled={selectionLocked}
                ontoggle={(timestampMs) => void toggleTimestamp(timestampMs)}
                onbuttonready={(timestampMs, element) =>
                  setFrameButton(automaticFrameButtons, timestampMs, element)}
              />
            </section>

            <section aria-labelledby="manually-chosen-frames-heading">
              <h3 id="manually-chosen-frames-heading" class="mb-2 text-sm font-semibold text-text">
                {m.frames_manually_chosen()}
              </h3>
              {#if manualFrames.length === 0}
                <p
                  class="rounded-lg border border-dashed border-border bg-surface px-3 py-4 text-sm text-text-muted"
                >
                  {m.frames_no_manual_frames()}
                </p>
              {:else}
                <ManualFrameStrip
                  frames={manualFrames}
                  {selection}
                  sectionLabel={m.frames_manually_chosen()}
                  removeLabel={(timestamp) => m.frames_remove_manual_frame({ timestamp })}
                  disabled={selectionLocked}
                  ontoggle={(timestampMs) => void toggleTimestamp(timestampMs)}
                  onremove={(frame) => void removeManualFrame(frame)}
                  onbuttonready={(timestampMs, element) =>
                    setFrameButton(manualFrameButtons, timestampMs, element)}
                />
              {/if}
              {#if manualFeedback}
                {#key manualFeedbackSequence}
                  <p
                    class="mt-2 rounded-md border border-border bg-surface px-2.5 py-2 text-xs text-text-muted"
                    aria-live="polite"
                  >
                    {manualFeedback}
                  </p>
                {/key}
              {/if}
            </section>

            {#if session}
              <FrameScrubber
                {session}
                timestamp={scrubTimestamp}
                {maxTimestamp}
                canAdd={manualFrames.length < MAX_SELECTIONS && selectedCount < MAX_SELECTIONS}
                disabled={selectionLocked}
                onscrub={setScrubTimestamp}
                onadd={handleAddFrame}
                onerror={(error) => {
                  if (phase !== 'extracting') setFailure('preview', error);
                }}
                onAddButtonReady={(element) => (addFrameButton = element)}
              />
            {/if}

            <div class="flex items-center justify-between gap-3 border-t border-border pt-4">
              <p class="text-xs text-text-dim">
                {selectedCount === 0
                  ? m.frames_no_selection()
                  : m.frames_selected_count({ count: selectedCount })}
              </p>
              <button
                type="button"
                onclick={() => void startExtraction()}
                disabled={!canExtract}
                class="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {m.frames_extract_action()}
              </button>
            </div>
          </div>
        {/if}
        {#if extractedFrames.length > 0}
          <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {#each extractedFrames as frame (frame.id)}
              <article class="overflow-hidden rounded-xl border border-border bg-surface">
                <div class="bg-black" style={`aspect-ratio: ${aspectRatioFor(frame.media)}`}>
                  <MediaImage
                    media={frame.media}
                    alt={formatTimestamp(frame.timestampMs)}
                    sizes="(max-width: 640px) 45vw, 180px"
                    class="h-full w-full object-contain"
                  />
                </div>
                <div class="flex items-center justify-between gap-2 p-2">
                  <span class="text-[11px] tabular-nums text-text-dim">
                    {formatTimestamp(frame.timestampMs)}
                  </span>
                  <button
                    type="button"
                    onclick={() => useAsInput(frame)}
                    class="rounded-md bg-accent/15 px-2 py-1 text-[11px] font-semibold text-accent transition-colors hover:bg-accent/25"
                  >
                    {m.frames_use_as_input()}
                  </button>
                </div>
              </article>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </div>
</div>
