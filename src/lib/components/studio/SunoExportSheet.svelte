<script lang="ts">
  import { page } from '$app/stores';
  import { createQuery } from '@tanstack/svelte-query';
  import { ApiRequestError } from '$lib/api/errors';
  import { studioTrackHistory, studioTrackImport } from '$lib/studio/paths';
  import { exportWarningMessage } from '$lib/studio/formErrors';
  import { sectionDisplayName } from '$lib/studio/sections';
  import { copyText } from '$lib/utils/clipboard';
  import { versionQueryOptions, sunoExportQueryOptions } from '$lib/queries/studioVersions';
  import type { components } from '$lib/api/types';
  import Sheet from '$lib/components/shared/Sheet.svelte';
  import * as m from '$paraglide/messages';

  let {
    trackId,
    pair = {},
    onclose,
  }: {
    trackId: string;
    pair?: { plan?: string; lyrics?: string };
    onclose: () => void;
  } = $props();
  let projectId = $derived($page.params.projectId ?? '');
  const query = createQuery(() => sunoExportQueryOptions(trackId, pair));
  const planQuery = createQuery(() => ({
    ...versionQueryOptions(query.data?.plan_version_id ?? ''),
    enabled: !!query.data?.plan_version_id,
  }));
  const blocks = [
    { key: 'title', label: m.studio_export_song_title() },
    { key: 'style', label: m.studio_export_style() },
    { key: 'exclude', label: m.studio_export_exclude() },
    { key: 'lyrics', label: m.studio_export_lyrics() },
  ] as const;
  let copiedField = $state('');
  let copyMessage = $state('');
  let copyTimer: ReturnType<typeof setTimeout> | undefined;
  let planSections = $derived(
    planQuery.data?.kind === 'plan'
      ? ((planQuery.data.content.sections ?? []) as components['schemas']['PlanSection'][])
      : [],
  );
  let error = $derived(query.error);
  let exportFailure = $derived(error instanceof ApiRequestError ? error : null);

  function copy(field: (typeof blocks)[number]['key']) {
    const data = query.data;
    if (!data) return;
    const pendingCopy = copyText(data[field]);
    void pendingCopy.then((success) => {
      if (copyTimer) clearTimeout(copyTimer);
      copiedField = success ? field : '';
      copyMessage = success ? m.studio_copied() : m.studio_copy_failed();
      if (!success) selectField(field);
      if (success)
        copyTimer = setTimeout(() => {
          copiedField = '';
          copyMessage = '';
        }, 2000);
    });
  }

  function selectField(field: (typeof blocks)[number]['key']) {
    const input = document.querySelector<HTMLInputElement>(
      `[role="dialog"] input[data-export-field="${field}"]`,
    );
    if (input) {
      input.focus();
      input.select();
      return;
    }
    const lyricsPre = document.querySelector<HTMLElement>(
      '[role="dialog"] [data-export-field="lyrics"]',
    );
    if (!lyricsPre) return;
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(lyricsPre);
    selection?.removeAllRanges();
    selection?.addRange(range);
  }
</script>

<Sheet ariaLabel={m.studio_export_title()} {onclose}>
  <div class="flex items-start justify-between gap-4">
    <h2 class="font-display text-2xl font-semibold">{m.studio_export_title()}</h2>
    <button class="text-text-muted" onclick={onclose}>{m.common_close()}</button>
  </div>
  {#if query.isRefetchError && query.data}
    <p role="status" class="mt-3 text-warning">{m.studio_refresh_error()}</p>
  {/if}
  {#if query.isPending}
    <p class="mt-6" role="status">{m.common_loading()}</p>
  {:else if !query.data}
    {#if exportFailure?.status_code === 409 && exportFailure.error === 'plan_required'}
      <p class="mt-6">{m.studio_export_plan_required()}</p>
      <a
        class="mt-3 inline-block text-accent underline"
        href={studioTrackImport(projectId, trackId)}>{m.studio_import_from_suno()}</a
      >
    {:else if exportFailure?.status_code === 409 && exportFailure.error === 'lyrics_incompatible_with_plan'}
      <p class="mt-6">{m.studio_export_incompatible()}</p>
      <a
        class="mt-3 inline-block text-accent underline"
        href={studioTrackHistory(projectId, trackId)}>{m.studio_history()}</a
      >
    {:else}
      <div role="alert" class="mt-6">
        <p>{m.studio_import_copy_error()}</p>
        <button class="mt-2 text-accent underline" onclick={() => void query.refetch()}
          >{m.studio_retry()}</button
        >
      </div>
    {/if}
  {:else}
    {#if query.data.instrumental}
      <p class="mt-4 rounded-lg border border-border p-3 text-sm">
        {m.studio_export_instrumental_hint()}
      </p>
    {/if}
    <div class="mt-5 space-y-4">
      {#each blocks as block (block.key)}
        {@const value = query.data[block.key]}
        {@const field = query.data.fields[block.key]}
        <section class="rounded-xl border border-border p-3">
          <div class="flex items-center justify-between gap-3">
            <h3 class="font-semibold">{block.label}</h3>
            <button
              class="rounded-lg border border-border px-3 py-1.5 text-sm"
              onclick={() => copy(block.key)}
            >
              {copiedField === block.key ? m.studio_copied() : m.studio_copy()}
            </button>
          </div>
          {#if block.key === 'lyrics'}
            <pre
              data-export-field={block.key}
              class="mt-3 max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface p-3 font-mono text-sm">{value}</pre>
          {:else}
            <input
              data-export-field={block.key}
              class="mt-3 w-full rounded-lg border border-border bg-surface p-2"
              readonly
              {value}
              aria-label={block.label}
            />
          {/if}
          <p class="mt-2 text-xs {field.within_limit ? 'text-text-muted' : 'text-danger'}">
            {field.limit === null ? field.length : `${field.length} / ${field.limit}`}
          </p>
          {#if !field.within_limit}
            <p class="mt-1 text-sm text-danger">{m.studio_suno_cut()}</p>
          {/if}
        </section>
      {/each}
    </div>
    {#if copyMessage}<p role="status" class="mt-3 text-sm">{copyMessage}</p>{/if}
    {#if query.data.warnings.length}
      <ul class="mt-4 list-disc space-y-2 pl-5 text-sm text-warning">
        {#each query.data.warnings as warning, index (`${warning.code}-${index}`)}
          <li>
            {exportWarningMessage(warning.code)}
            {#if warning.section_id}
              {@const section = planSections.find((item) => item.id === warning.section_id)}
              {#if section}
                — {sectionDisplayName(section, planSections)}{/if}
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
    <p class="mt-4 text-xs text-text-muted">
      {m.studio_export_renderer({ version: query.data.renderer_version })}
    </p>
  {/if}
  <div class="mt-6 flex justify-end border-t border-border pt-4">
    <button class="rounded-lg border border-border px-4 py-2" onclick={onclose}
      >{m.common_cancel()}</button
    >
  </div>
</Sheet>
