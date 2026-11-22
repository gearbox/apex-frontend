<script lang="ts">
  import { X } from '@lucide/svelte';
  import { fieldIssues, issueMessage, type StudioValidationIssue } from '$lib/studio/formErrors';
  import * as m from '$paraglide/messages';

  interface Props {
    id: string;
    label: string;
    values: string[];
    maxItems: number;
    maxLength: number;
    placeholder?: string;
    hint?: string;
    field?: string;
    issues?: StudioValidationIssue[];
  }

  let {
    id,
    label,
    values = $bindable(),
    maxItems,
    maxLength,
    placeholder = '',
    hint = '',
    field = '',
    issues = [],
  }: Props = $props();

  let inputValue = $state('');
  let feedback = $state('');
  let tagIssues = $derived(field ? fieldIssues(issues, field) : []);
  let describedBy = $derived(
    [
      id + '-count',
      id + '-feedback',
      ...(hint ? [id + '-hint'] : []),
      ...tagIssues.map((_, index) => id + '-issue-' + index),
    ].join(' '),
  );

  function addTag() {
    const value = inputValue.normalize('NFC').trim();
    if (!value) return;
    if (value.includes('[') || value.includes(']')) {
      feedback = m.studio_tag_brackets();
      return;
    }
    if (Array.from(value).length > maxLength) {
      feedback = m.studio_tag_too_long({ max: String(maxLength) });
      return;
    }
    if (values.some((tag) => tag.toLocaleLowerCase() === value.toLocaleLowerCase())) {
      feedback = m.studio_tag_duplicate();
      return;
    }
    if (values.length >= maxItems) {
      feedback = m.studio_tag_limit({ max: String(maxItems) });
      return;
    }
    values = [...values, value];
    inputValue = '';
    feedback = '';
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addTag();
    } else if (event.key === 'Backspace' && !inputValue && values.length > 0) {
      values = values.slice(0, -1);
      feedback = '';
    }
  }

  function removeTag(tag: string, index: number) {
    values = values.filter((_, itemIndex) => itemIndex !== index);
    feedback = '';
    void tag;
  }
</script>

<div class="space-y-2">
  <label for={id} class="block text-sm font-medium text-text">{label}</label>
  {#if hint}<p id={id + '-hint'} class="-mt-1 text-xs text-text-dim">{hint}</p>{/if}
  {#if values.length > 0}
    <ul class="flex flex-wrap gap-2" aria-label={label}>
      {#each values as tag, index (`${tag}-${index}`)}
        <li
          class="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2.5 py-1 text-sm text-text"
        >
          <span>{tag}</span>
          <button
            type="button"
            class="rounded-full p-0.5 text-text-muted hover:bg-surface-hover hover:text-text focus-visible:outline-2 focus-visible:outline-accent"
            aria-label={m.studio_tag_remove({ tag })}
            onclick={() => removeTag(tag, index)}><X size={13} aria-hidden="true" /></button
          >
        </li>
      {/each}
    </ul>
  {/if}
  <div class="flex gap-2">
    <input
      {id}
      bind:value={inputValue}
      placeholder={placeholder || m.studio_tag_placeholder()}
      aria-describedby={describedBy}
      aria-invalid={tagIssues.length > 0 ? 'true' : undefined}
      class="min-w-0 flex-1 rounded-xl border border-border bg-bg px-3 py-2.5 text-sm text-text outline-none placeholder:text-text-dim focus:border-accent"
      onkeydown={onKeydown}
      onblur={addTag}
    />
    <button
      type="button"
      class="rounded-xl border border-border px-3 py-2 text-sm font-semibold text-text hover:bg-surface-hover disabled:opacity-50"
      onclick={addTag}
      disabled={values.length >= maxItems}>{m.studio_tag_add()}</button
    >
  </div>
  <p id={id + '-count'} class="text-xs text-text-dim">{values.length} / {maxItems}</p>
  <p id={id + '-feedback'} class="min-h-4 text-xs text-danger" role="status">{feedback}</p>
  {#each tagIssues as issue, index (issue.path + '-' + index)}
    <p id={id + '-issue-' + index} class="text-xs text-danger" role="alert">
      {m.studio_issue_tag_index({
        index: String(Number(issue.path.match(/\[(\d+)\]/u)?.[1] ?? index) + 1),
        message: issueMessage(issue),
      })}
    </p>
  {/each}
</div>
