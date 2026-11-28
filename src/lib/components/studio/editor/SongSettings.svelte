<script lang="ts">
  import TagListInput from '$lib/components/shared/TagListInput.svelte';
  import ToggleSwitch from '$lib/components/shared/ToggleSwitch.svelte';
  import FieldIssues from './FieldIssues.svelte';
  import { targetIssues } from '$lib/studio/editorIssues';
  import { STUDIO_LIMITS } from '$lib/studio/limits';
  import { codePointLength } from '$lib/studio/text';
  import type { DraftIssue } from '$lib/studio/songValidation';
  import type { SongDraft } from '$lib/studio/songDraft';
  import { describedBy, type StudioValidationIssue } from '$lib/studio/formErrors';
  import { formatNumber } from '$lib/utils/format';
  import * as m from '$paraglide/messages';

  let {
    draft = $bindable(),
    issues,
    lyricsCount,
  }: { draft: SongDraft; issues: DraftIssue[]; lyricsCount: number } = $props();
  let globalTags = $derived(issuesFor('global_style.tags'));
  let globalAvoid = $derived(issuesFor('global_style.avoid'));
  let referencesIssues = $derived(issuesFor('references'));
  let titleIssues = $derived(targetIssues(issues, 'title'));
  let tempoIssues = $derived(targetIssues(issues, 'tempo'));
  let languageIssues = $derived(targetIssues(issues, 'language'));
  let ideaIssues = $derived(targetIssues(issues, 'idea'));

  function issuesFor(path: string): StudioValidationIssue[] {
    return issues.flatMap((item) =>
      item.path?.startsWith(path) ? [{ path: item.path, code: item.code }] : [],
    );
  }
</script>

<section
  class="space-y-5 rounded-2xl border border-border bg-surface p-4 md:p-6"
  aria-labelledby="song-settings-heading"
>
  <h2 id="song-settings-heading" class="font-display text-xl font-semibold">
    {m.studio_editor_song_settings()}
  </h2>
  <div class="grid gap-4 sm:grid-cols-2">
    <div class="sm:col-span-2">
      <label class="mb-1 block text-sm font-medium" for="song-title"
        >{m.studio_editor_plan_title()}</label
      >
      <input
        id="song-title"
        value={draft.title}
        oninput={(event) => (draft.title = event.currentTarget.value)}
        maxlength="240"
        aria-describedby={describedBy('song-title', titleIssues)}
        aria-invalid={titleIssues.length > 0}
        class="w-full rounded-xl border border-border bg-bg px-3 py-2.5"
      />
      <p class="mt-1 text-right text-xs text-text-dim">
        {formatNumber(codePointLength(draft.title))} / {formatNumber(200)}
      </p>
      <FieldIssues controlId="song-title" issues={titleIssues} />
    </div>
    <div>
      <label class="mb-1 block text-sm font-medium" for="song-tempo"
        >{m.studio_editor_tempo()}</label
      >
      <input
        id="song-tempo"
        type="number"
        min="40"
        max="240"
        step="1"
        value={draft.tempo}
        oninput={(event) => (draft.tempo = event.currentTarget.value)}
        aria-describedby={describedBy('song-tempo', tempoIssues)}
        aria-invalid={tempoIssues.length > 0}
        class="w-full rounded-xl border border-border bg-bg px-3 py-2.5"
      />
      <FieldIssues controlId="song-tempo" issues={tempoIssues} />
    </div>
    <div
      class="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5"
    >
      <span class="text-sm font-medium">{m.studio_editor_instrumental_track()}</span>
      <ToggleSwitch
        checked={draft.instrumental}
        ariaLabel={m.studio_editor_instrumental_track()}
        ontoggle={(value) => (draft.instrumental = value)}
      />
    </div>
  </div>
  <div class="grid gap-5 md:grid-cols-2">
    <TagListInput
      id="song-style-tags"
      label={m.studio_editor_style_tags()}
      bind:values={draft.styleTags}
      maxItems={40}
      maxLength={60}
      field="*"
      issues={globalTags}
    />
    <TagListInput
      id="song-style-avoid"
      label={m.studio_editor_exclude()}
      bind:values={draft.styleAvoid}
      maxItems={40}
      maxLength={60}
      field="*"
      issues={globalAvoid}
    />
  </div>
  <div class="grid gap-4 sm:grid-cols-2">
    <div>
      <label class="mb-1 block text-sm font-medium" for="song-language"
        >{m.studio_editor_language()}</label
      >
      <input
        id="song-language"
        value={draft.language}
        oninput={(event) => (draft.language = event.currentTarget.value)}
        maxlength="35"
        placeholder="en"
        aria-describedby={describedBy('song-language', languageIssues)}
        aria-invalid={languageIssues.length > 0}
        class="w-full rounded-xl border border-border bg-bg px-3 py-2.5"
      />
      <FieldIssues controlId="song-language" issues={languageIssues} />
    </div>
    <p class="self-end text-right text-sm text-text-muted">
      {formatNumber(lyricsCount)} / {formatNumber(STUDIO_LIMITS.sunoLyrics)}
    </p>
  </div>
  <details class="group border-t border-border pt-4">
    <summary class="cursor-pointer font-medium">{m.studio_editor_details()}</summary>
    <div class="mt-4 space-y-5">
      <div>
        <label class="mb-1 block text-sm font-medium" for="song-idea"
          >{m.studio_editor_idea()}</label
        >
        <textarea
          id="song-idea"
          rows="3"
          value={draft.idea}
          oninput={(event) => (draft.idea = event.currentTarget.value)}
          aria-describedby={describedBy('song-idea', ideaIssues)}
          aria-invalid={ideaIssues.length > 0}
          class="w-full resize-y rounded-xl border border-border bg-bg px-3 py-2.5"></textarea>
        <p class="mt-1 text-right text-xs text-text-dim">
          {formatNumber(codePointLength(draft.idea))} / {formatNumber(4000)} · {m.studio_editor_not_sent()}
        </p>
        <FieldIssues controlId="song-idea" issues={ideaIssues} />
      </div>
      <TagListInput
        id="song-references"
        label={m.studio_editor_references()}
        bind:values={draft.references}
        maxItems={20}
        maxLength={200}
        field="*"
        issues={referencesIssues}
        hint={m.studio_editor_not_sent()}
        allowReservedCharacters
      />
    </div>
  </details>
</section>
