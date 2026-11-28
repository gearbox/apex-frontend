<script lang="ts">
  import TagListInput from '$lib/components/shared/TagListInput.svelte';
  import ToggleSwitch from '$lib/components/shared/ToggleSwitch.svelte';
  import FieldIssues from './FieldIssues.svelte';
  import SectionLyricsField from './SectionLyricsField.svelte';
  import { targetIssues } from '$lib/studio/editorIssues';
  import { describedBy } from '$lib/studio/formErrors';
  import { sectionDisplayName } from '$lib/studio/sections';
  import { isHiddenSection, type PlanSection } from '$lib/studio/songDraft';
  import type { SectionDraft, SectionKind, SongDraft } from '$lib/studio/songDraft';
  import type { DraftIssue } from '$lib/studio/songValidation';
  import * as m from '$paraglide/messages';

  const kinds: SectionKind[] = [
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
  let {
    section = $bindable(),
    draft,
    index,
    issues,
    hiddenLines = 0,
    onmove,
    onduplicate,
    ondelete,
  }: {
    section: SectionDraft;
    draft: SongDraft;
    index: number;
    issues: DraftIssue[];
    hiddenLines?: number;
    onmove: (delta: -1 | 1) => void;
    onduplicate: () => void;
    ondelete: () => void;
  } = $props();
  let planSections = $derived(
    draft.sections.map(
      (item) => ({ id: item.id, kind: item.kind, label: item.label || null }) as PlanSection,
    ),
  );
  let defaultName = $derived(
    sectionDisplayName(
      { id: section.id, kind: section.kind, label: null } as PlanSection,
      planSections,
    ),
  );
  let deliveryIssues = $derived(
    issues
      .filter((item) => item.path?.startsWith(`sections[${index}].delivery`))
      .flatMap((item) => (item.path ? [{ path: item.path, code: item.code }] : [])),
  );
  let styleIssues = $derived(
    issues
      .filter((item) => item.path?.startsWith(`sections[${index}].style.tags`))
      .flatMap((item) => (item.path ? [{ path: item.path, code: item.code }] : [])),
  );
  let avoidIssues = $derived(
    issues
      .filter((item) => item.path?.startsWith(`sections[${index}].style.avoid`))
      .flatMap((item) => (item.path ? [{ path: item.path, code: item.code }] : [])),
  );
  let labelId = $derived(`section-label-${section.id}`);
  let durationId = $derived(`section-${section.id}-duration`);
  let notesId = $derived(`section-${section.id}-notes`);
  let labelIssues = $derived(targetIssues(issues, 'label', section.id));
  let durationIssues = $derived(targetIssues(issues, 'duration', section.id));
  let notesIssues = $derived(targetIssues(issues, 'notes', section.id));
  function handleMoveKey(event: KeyboardEvent) {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    onmove(event.key === 'ArrowUp' ? -1 : 1);
  }
</script>

<article
  id={`section-${section.id}`}
  class="space-y-4 rounded-2xl border border-border bg-surface p-4 md:p-5"
  aria-label={m.studio_editor_section({ name: defaultName })}
>
  <header class="flex flex-wrap items-center gap-2">
    <button
      type="button"
      data-section-handle={section.id}
      aria-label={m.studio_editor_move_handle({ name: defaultName })}
      title={m.studio_editor_move_hint()}
      onkeydown={handleMoveKey}
      class="cursor-grab rounded-lg border border-border px-3 py-2 text-text-muted">↕</button
    >
    <select
      id={`section-kind-${section.id}`}
      aria-label={m.studio_editor_section_kind()}
      value={section.kind}
      onchange={(event) => (section.kind = event.currentTarget.value as SectionKind)}
      class="min-w-32 flex-1 rounded-lg border border-border bg-bg px-3 py-2"
    >
      {#each kinds as kind (kind)}<option value={kind}
          >{sectionDisplayName(
            { id: section.id, kind, label: null } as PlanSection,
            planSections,
          )}</option
        >{/each}
    </select>
    <input
      id={labelId}
      aria-label={m.studio_editor_section_label()}
      aria-describedby={describedBy(labelId, labelIssues)}
      aria-invalid={labelIssues.length > 0}
      value={section.label}
      placeholder={defaultName}
      oninput={(event) => (section.label = event.currentTarget.value)}
      class="min-w-32 flex-1 rounded-lg border border-border bg-bg px-3 py-2"
    />
    <div class="flex items-center gap-2 text-sm">
      <ToggleSwitch
        checked={section.instrumental}
        ariaLabel={m.studio_editor_instrumental_section()}
        ontoggle={(value) => (section.instrumental = value)}
      /><span>{m.studio_editor_instrumental_section()}</span>
    </div>
    <details class="relative">
      <summary
        aria-label={m.studio_editor_section_menu()}
        class="cursor-pointer list-none rounded-lg border border-border px-3 py-2">⋮</summary
      >
      <div
        class="absolute right-0 z-10 mt-1 min-w-44 rounded-xl border border-border bg-bg p-1 shadow-xl"
      >
        <button
          type="button"
          class="block w-full rounded-lg px-3 py-2 text-left hover:bg-surface-hover"
          disabled={index === 0}
          onclick={() => onmove(-1)}>{m.studio_move_up()}</button
        >
        <button
          type="button"
          class="block w-full rounded-lg px-3 py-2 text-left hover:bg-surface-hover"
          disabled={index === draft.sections.length - 1}
          onclick={() => onmove(1)}>{m.studio_move_down()}</button
        >
        <button
          type="button"
          class="block w-full rounded-lg px-3 py-2 text-left hover:bg-surface-hover"
          onclick={onduplicate}>{m.studio_editor_duplicate()}</button
        >
        <button
          type="button"
          class="block w-full rounded-lg px-3 py-2 text-left text-danger hover:bg-surface-hover"
          onclick={ondelete}>{m.studio_delete()}</button
        >
      </div>
    </details>
  </header>
  <FieldIssues controlId={labelId} issues={labelIssues} />
  <SectionLyricsField
    id={section.id}
    value={section.lyrics}
    hidden={isHiddenSection(draft, section)}
    {hiddenLines}
    {issues}
    oninput={(value) => (section.lyrics = value)}
  />
  <details class="border-t border-border pt-3">
    <summary class="cursor-pointer text-sm font-medium">{m.studio_editor_details()}</summary>
    <div class="mt-4 grid gap-5 md:grid-cols-2">
      <TagListInput
        id={`section-${section.id}-delivery`}
        label={m.studio_editor_delivery()}
        bind:values={section.delivery}
        maxItems={12}
        maxLength={40}
        field="*"
        issues={deliveryIssues}
      />
      <TagListInput
        id={`section-${section.id}-style`}
        label={m.studio_editor_section_style()}
        bind:values={section.styleTags}
        maxItems={40}
        maxLength={60}
        field="*"
        issues={styleIssues}
      />
      <TagListInput
        id={`section-${section.id}-avoid`}
        label={m.studio_editor_section_avoid()}
        bind:values={section.styleAvoid}
        maxItems={40}
        maxLength={60}
        field="*"
        issues={avoidIssues}
        hint={m.studio_editor_not_sent()}
      />
      <div>
        <label class="mb-1 block text-sm font-medium" for={durationId}
          >{m.studio_editor_duration()}</label
        >
        <input
          id={durationId}
          type="number"
          min="1"
          max="600"
          step="1"
          value={section.duration}
          oninput={(event) => (section.duration = event.currentTarget.value)}
          aria-describedby={describedBy(durationId, durationIssues)}
          aria-invalid={durationIssues.length > 0}
          class="w-full rounded-xl border border-border bg-bg px-3 py-2.5"
        />
        <FieldIssues controlId={durationId} issues={durationIssues} />
        <p class="mt-1 text-xs text-text-dim">{m.studio_editor_not_sent()}</p>
      </div>
      <div class="md:col-span-2">
        <label class="mb-1 block text-sm font-medium" for={notesId}>{m.studio_editor_notes()}</label
        >
        <textarea
          id={notesId}
          rows="2"
          value={section.notes}
          oninput={(event) => (section.notes = event.currentTarget.value)}
          aria-describedby={describedBy(notesId, notesIssues)}
          aria-invalid={notesIssues.length > 0}
          class="w-full resize-y rounded-xl border border-border bg-bg px-3 py-2.5"></textarea>
        <FieldIssues controlId={notesId} issues={notesIssues} />
        <p class="mt-1 text-xs text-text-dim">{m.studio_editor_not_sent()}</p>
      </div>
    </div>
  </details>
</article>
