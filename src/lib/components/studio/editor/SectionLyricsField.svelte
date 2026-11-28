<script lang="ts">
  import { selectLyricsRow } from '$lib/studio/editorIssues';
  import { describedBy, issueId, issueMessage } from '$lib/studio/formErrors';
  import type { DraftIssue } from '$lib/studio/songValidation';
  import * as m from '$paraglide/messages';

  let {
    id,
    value,
    hidden = false,
    hiddenLines = 0,
    issues = [],
    oninput,
  }: {
    id: string;
    value: string;
    /** The documents leave this section's lyrics out, so there is nothing to type into. */
    hidden?: boolean;
    hiddenLines?: number;
    issues?: DraftIssue[];
    oninput: (value: string) => void;
  } = $props();
  let controlId = $derived(`lyrics-${id}`);
  let rows = $derived(Math.max(3, Math.min(30, value.split(/\r\n|\r|\n/u).length + 1)));
  let rowIssues = $derived(
    issues.flatMap((item) =>
      item.target?.kind === 'lyrics' && item.target.id === id
        ? [{ ...item, row: item.target.row }]
        : [],
    ),
  );
  let textarea = $state<HTMLTextAreaElement>();
</script>

<div class="space-y-2">
  {#if hidden}
    {#if hiddenLines > 0}
      <p class="rounded-lg bg-bg px-3 py-2 text-sm text-text-muted">
        {m.studio_editor_hidden_lines({ count: String(hiddenLines) })}
      </p>
    {/if}
  {:else}
    <label class="block text-sm font-medium" for={controlId}>{m.studio_editor_lyrics()}</label>
    <p id={`lyrics-hint-${id}`} class="text-xs text-text-muted">{m.studio_editor_lyrics_hint()}</p>
    <textarea
      bind:this={textarea}
      id={controlId}
      data-lyrics-id={id}
      {rows}
      {value}
      oninput={(event) => oninput(event.currentTarget.value)}
      aria-describedby={describedBy(controlId, rowIssues, [`lyrics-hint-${id}`])}
      aria-invalid={rowIssues.length > 0}
      class="w-full resize-y rounded-xl border border-border bg-bg px-3 py-2.5 font-mono text-sm leading-6"
    ></textarea>
    {#if rowIssues.length}
      <ul class="space-y-1">
        {#each rowIssues as item, index (`${item.row}-${item.code}-${index}`)}
          <li id={issueId(controlId, index)}>
            <button
              type="button"
              class="text-left text-xs text-danger underline"
              onclick={() => textarea && selectLyricsRow(textarea, item.row)}
              >{m.studio_editor_line({ line: String(item.row + 1) })} · {issueMessage({
                path: item.path ?? '',
                code: item.code,
              })}</button
            >
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>
