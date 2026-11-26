<script lang="ts">
  import type { components } from '$lib/api/types';
  import { sectionDisplayName } from '$lib/studio/sections';
  import * as m from '$paraglide/messages';

  type PlanDocument = components['schemas']['PlanDocument'];
  type LyricsDocument = components['schemas']['LyricsDocument'];
  type PlanSection = components['schemas']['PlanSection'];
  type LyricsSection = components['schemas']['LyricsSection'];
  type LyricLine = components['schemas']['LyricLine'];
  let {
    plan,
    lyrics,
    emptyPlan = m.studio_no_plan(),
    emptyLyrics = m.studio_no_lyrics(),
  }: {
    plan: PlanDocument | null;
    lyrics: LyricsDocument | null;
    emptyPlan?: string;
    emptyLyrics?: string;
  } = $props();
  const id = $props.id();
  let sections = $derived((plan?.sections ?? []) as PlanSection[]);
  let lyricSections = $derived((lyrics?.sections ?? []) as LyricsSection[]);
</script>

{#if plan}
  <div class="space-y-8">
    <section aria-labelledby={`document-plan-heading-${id}`}>
      <h2 id={`document-plan-heading-${id}`} class="font-display text-xl font-semibold">
        {m.studio_plan_chip()}
      </h2>
      {#if plan}
        {#if plan.tempo_bpm || plan.instrumental}
          <p class="mt-3 text-sm text-text-muted">
            {#if plan.tempo_bpm}{m.studio_tempo()}: {plan.tempo_bpm} BPM{/if}
            {#if plan.tempo_bpm && plan.instrumental}
              ·
            {/if}
            {#if plan.instrumental}{m.studio_instrumental()}{/if}
          </p>
        {/if}
        {#if plan.global_style?.tags?.length}
          <div class="mt-3 flex flex-wrap gap-2" aria-label={m.studio_export_style()}>
            {#each plan.global_style.tags as tag, index (index)}
              <span class="rounded-full bg-surface px-2 py-1 text-sm">{tag}</span>
            {/each}
          </div>
        {/if}
        {#if plan.global_style?.avoid?.length}
          <div class="mt-3" aria-label={m.studio_exclude_label()}>
            <p class="mb-2 text-sm font-medium">{m.studio_exclude_label()}</p>
            <div class="flex flex-wrap gap-2">
              {#each plan.global_style.avoid as tag, index (`avoid-${index}`)}
                <span class="rounded-full bg-surface px-2 py-1 text-sm">{tag}</span>
              {/each}
            </div>
          </div>
        {/if}
        {#if plan.idea}
          <div class="mt-4 rounded-lg bg-surface p-3 text-sm text-text-muted">
            <strong>{m.studio_not_sent_to_suno()} · {m.studio_idea()}</strong>
            <p class="mt-1 whitespace-pre-wrap">{plan.idea}</p>
          </div>
        {/if}
        {#each sections as section (section.id)}
          <article class="mt-6">
            <h3 class="font-semibold">{sectionDisplayName(section, sections)}</h3>
            <div class="mt-2 flex flex-wrap gap-2">
              {#each section.delivery ?? [] as tag, index (`delivery-${index}`)}
                <span class="rounded-full bg-surface px-2 py-1 text-xs">{tag}</span>
              {/each}
              {#each section.style?.tags ?? [] as tag, index (`style-${index}`)}
                <span class="rounded-full bg-surface px-2 py-1 text-xs">{tag}</span>
              {/each}
              {#if section.instrumental}
                <span class="rounded-full border border-border px-2 py-1 text-xs"
                  >{m.studio_instrumental()}</span
                >
              {/if}
            </div>
            {#if section.notes}
              <div class="mt-3 text-sm text-text-muted">
                <strong>{m.studio_not_sent_to_suno()} · {m.studio_section_notes()}</strong>
                <p class="mt-1 whitespace-pre-wrap">{section.notes}</p>
              </div>
            {/if}
          </article>
        {/each}
        {#if !sections.length}<p class="mt-3 text-text-muted">{emptyPlan}</p>{/if}
      {:else}
        {#if emptyPlan}<p class="mt-3 text-text-muted">{emptyPlan}</p>{/if}
      {/if}
    </section>

    <section aria-labelledby={`document-lyrics-heading-${id}`}>
      <h2 id={`document-lyrics-heading-${id}`} class="font-display text-xl font-semibold">
        {m.studio_import_lyrics()}
      </h2>
      {#if lyrics}
        {#each lyricSections as entry (entry.section_id)}
          {@const section = sections.find((item) => item.id === entry.section_id)}
          {@const lines = entry.lines as LyricLine[]}
          <article class="mt-5">
            <h3 class="font-semibold">
              {section ? sectionDisplayName(section, sections) : emptyLyrics}
            </h3>
            {#if !section?.instrumental}
              {#each lines as line, lineIndex (`${entry.section_id}-${lineIndex}`)}
                <p class="mt-2 whitespace-pre-wrap">
                  {line.text}
                  {#each line.delivery ?? [] as tag, index (`${entry.section_id}-${lineIndex}-${index}`)}
                    <span class="ml-2 rounded-full bg-surface px-2 py-1 text-xs">{tag}</span>
                  {/each}
                </p>
              {/each}
            {/if}
          </article>
        {/each}
        {#if !lyricSections.length}<p class="mt-3 text-text-muted">{emptyLyrics}</p>{/if}
      {:else}
        {#if emptyLyrics}<p class="mt-3 text-text-muted">{emptyLyrics}</p>{/if}
      {/if}
    </section>
  </div>
{/if}
