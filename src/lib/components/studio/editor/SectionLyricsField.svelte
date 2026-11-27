<script lang="ts">
  import { codePointLength } from '$lib/studio/text';
  import { parseSectionLyrics } from '$lib/studio/lyricsText';
  import type { DraftIssue } from '$lib/studio/songValidation';
  import * as m from '$paraglide/messages';

  let {
    id,
    value,
    hiddenLines = 0,
    issues = [],
    oninput,
  }: {
    id: string;
    value: string;
    hiddenLines?: number;
    issues?: DraftIssue[];
    oninput: (value: string) => void;
  } = $props();
  let rows = $derived(Math.max(3, Math.min(30, value.split(/\r\n|\r|\n/u).length + 1)));
  let parsed = $derived(parseSectionLyrics(value));
  let count = $derived(parsed.lines.reduce((sum, line) => sum + codePointLength(line.text), 0));
</script>

<div class="space-y-2">
  {#if hiddenLines > 0}
    <p class="rounded-lg bg-bg px-3 py-2 text-sm text-text-muted">
      {m.studio_editor_hidden_lines({ count: String(hiddenLines) })}
    </p>
  {:else}
    <label class="block text-sm font-medium" for={`lyrics-${id}`}>{m.studio_editor_lyrics()}</label>
    <p id={`lyrics-hint-${id}`} class="text-xs text-text-muted">{m.studio_editor_lyrics_hint()}</p>
    <textarea
      id={`lyrics-${id}`}
      data-lyrics-id={id}
      {rows}
      {value}
      oninput={(event) => oninput(event.currentTarget.value)}
      aria-describedby={`lyrics-hint-${id}`}
      aria-invalid={issues.some(
        (issue) => issue.target?.kind === 'lyrics' && issue.target.id === id,
      )}
      class="w-full resize-y rounded-xl border border-border bg-bg px-3 py-2.5 font-mono text-sm leading-6"
    ></textarea>
    <p class="text-right text-xs text-text-dim">{count} / 20,000</p>
  {/if}
</div>
