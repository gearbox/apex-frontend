<script lang="ts">
  import { sectionDisplayName } from '$lib/studio/sections';
  import type { PlanSection } from '$lib/studio/songDraft';
  import type { DraftIssue } from '$lib/studio/songValidation';
  import { issueMessage } from '$lib/studio/formErrors';
  import * as m from '$paraglide/messages';
  let {
    issues,
    sections,
    onfocus,
  }: { issues: DraftIssue[]; sections: PlanSection[]; onfocus: (issue: DraftIssue) => void } =
    $props();

  function label(issue: DraftIssue): string {
    const target = issue.target;
    const message = issueMessage({ path: issue.path ?? '', code: issue.code });
    if (!target) return `${issue.path || m.studio_editor_problem()} · ${message}`;
    if (target.kind === 'lyrics')
      return `${m.studio_editor_line({ line: String(target.row + 1) })} · ${message}`;
    if (target.kind === 'song') {
      const labels: Record<string, () => string> = {
        title: m.studio_editor_plan_title,
        tempo: m.studio_editor_tempo,
        language: m.studio_editor_language,
        styleTags: m.studio_editor_style_tags,
        styleAvoid: m.studio_editor_exclude,
        references: m.studio_editor_references,
        idea: m.studio_editor_idea,
        lyrics: m.studio_editor_lyrics,
        sections: m.studio_editor_sections,
      };
      return `${labels[target.field]?.() ?? target.field} · ${message}`;
    }
    const section = sections.find((item) => item.id === target.id);
    const name = section
      ? sectionDisplayName(section, sections)
      : m.studio_editor_section({ name: '' });
    return `${name} · ${message}`;
  }
</script>

<section
  class="rounded-xl border border-danger/50 bg-danger/5 p-4"
  aria-labelledby="song-error-summary-heading"
>
  <h2 id="song-error-summary-heading" tabindex="-1" class="font-semibold text-danger">
    {m.studio_editor_problems({ count: String(issues.length) })}
  </h2>
  <ul class="mt-2 space-y-1">
    {#each issues as item, index (`${item.path ?? ''}-${item.code}-${index}`)}
      <li>
        <button
          type="button"
          class="text-left text-sm text-danger underline"
          onclick={() => onfocus(item)}>{label(item)}</button
        >
      </li>
    {/each}
  </ul>
</section>
