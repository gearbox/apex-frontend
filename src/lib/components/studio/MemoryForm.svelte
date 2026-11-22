<script lang="ts">
  import { untrack } from 'svelte';
  import TagListInput from '$lib/components/shared/TagListInput.svelte';
  import {
    deriveMemoryTitle,
    formatLocalIsoDate,
    todayLocalIsoDate,
  } from '$lib/studio/memoryDraft';
  import { fieldIssues, issueMessage, type StudioValidationIssue } from '$lib/studio/formErrors';
  import { locale } from '$lib/stores/locale';
  import * as m from '$paraglide/messages';

  export interface MemoryFormPayload {
    title: string;
    body: string;
    occurred_on?: string | null;
    themes: string[];
    imagery: string[];
    salience: number;
  }

  interface InitialMemory {
    title: string;
    body: string;
    occurred_on: string | null;
    themes: string[];
    imagery: string[];
    salience: number;
  }

  interface Props {
    mode: 'create' | 'edit';
    idPrefix?: string;
    initial?: InitialMemory;
    pending?: boolean;
    autofocus?: boolean;
    issues?: StudioValidationIssue[];
    onsubmit: (payload: MemoryFormPayload) => void | Promise<void>;
    oncancel?: () => void;
  }

  let {
    mode,
    idPrefix = 'memory-form',
    initial,
    pending = false,
    autofocus = false,
    issues = [],
    onsubmit,
    oncancel,
  }: Props = $props();

  let body = $state(untrack(() => initial?.body ?? ''));
  let title = $state(untrack(() => initial?.title ?? ''));
  let titleEdited = $state(untrack(() => mode === 'edit'));
  let occurredOn = $state(
    untrack(() => (initial ? (initial.occurred_on ?? '') : todayLocalIsoDate())),
  );
  let themes = $state<string[]>(untrack(() => [...(initial?.themes ?? [])]));
  let imagery = $state<string[]>(untrack(() => [...(initial?.imagery ?? [])]));
  let salience = $state(untrack(() => initial?.salience ?? 3));
  let moreOpen = $state(false);
  let bodyEl: HTMLTextAreaElement | undefined = $state();
  let bodyIssues = $derived(fieldIssues(issues, 'body'));
  let titleIssues = $derived(fieldIssues(issues, 'title'));
  let dateIssues = $derived(fieldIssues(issues, 'occurred_on'));
  let salienceIssues = $derived(fieldIssues(issues, 'salience'));
  let otherIssues = $derived(
    issues.filter(
      (issue) =>
        !['body', 'title', 'occurred_on', 'salience', 'themes', 'imagery'].some(
          (field) => issue.path === field || issue.path.startsWith(field + '['),
        ),
    ),
  );

  $effect(() => {
    if (autofocus) bodyEl?.focus();
  });

  function updateBody(event: Event) {
    body = (event.currentTarget as HTMLTextAreaElement).value;
    if (!titleEdited) title = deriveMemoryTitle(body);
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (saveDisabled) return;
    void onsubmit({
      title: title.trim(),
      body,
      ...(occurredOn ? { occurred_on: occurredOn } : mode === 'edit' ? { occurred_on: null } : {}),
      themes,
      imagery,
      salience,
    });
  }

  let saveDisabled = $derived(
    pending || !body.trim() || !title.trim() || !deriveMemoryTitle(body).trim(),
  );
  let dateLabel = $derived(
    occurredOn
      ? occurredOn === todayLocalIsoDate()
        ? m.studio_date_today()
        : formatLocalIsoDate(occurredOn, $locale)
      : m.studio_date_undated(),
  );
</script>

<form class="space-y-4" onsubmit={submit}>
  <div class="flex flex-wrap items-center justify-between gap-2">
    <p class="text-sm font-semibold text-text">
      {mode === 'create' ? m.studio_quick_capture() : m.studio_edit_memory()}
    </p>
    {#if oncancel}
      <button
        type="button"
        class="rounded-lg px-2 py-1 text-sm text-text-muted hover:bg-surface-hover"
        onclick={oncancel}
      >
        {m.common_cancel()}
      </button>
    {/if}
  </div>

  <label class="block space-y-2" for={`${idPrefix}-body`}>
    <span class="text-sm font-medium text-text">{m.studio_memory_body_label()}</span>
    <textarea
      id={`${idPrefix}-body`}
      bind:this={bodyEl}
      value={body}
      maxlength="2000"
      rows="5"
      required
      placeholder={m.studio_memory_body_placeholder()}
      class="w-full resize-y rounded-2xl border border-border bg-bg px-4 py-3 text-sm leading-6 text-text outline-none placeholder:text-text-dim focus:border-accent"
      oninput={updateBody}></textarea>
    {#each bodyIssues as issue, index (`${issue.path}-${index}`)}<span
        class="block text-xs text-danger"
        role="alert">{issueMessage(issue)}</span
      >{/each}
  </label>

  <div class="flex flex-wrap items-center gap-2">
    <label class="sr-only" for={`${idPrefix}-date`}>{m.studio_memory_date_label()}</label>
    <input
      id={`${idPrefix}-date`}
      type="date"
      bind:value={occurredOn}
      aria-label={dateLabel}
      class="rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-text"
    />
    <span class="text-xs text-text-muted">{dateLabel}</span>
    {#if occurredOn}
      <button
        type="button"
        class="rounded-full px-2 py-1 text-xs text-text-muted hover:bg-surface-hover"
        onclick={() => (occurredOn = '')}
      >
        {m.studio_date_no_date()}
      </button>
    {:else}
      <button
        type="button"
        class="rounded-full px-2 py-1 text-xs text-accent hover:bg-surface-hover"
        onclick={() => (occurredOn = todayLocalIsoDate())}
      >
        {m.studio_date_set_today()}
      </button>
    {/if}
  </div>
  {#each dateIssues as issue, index (`${issue.path}-${index}`)}<p
      class="text-xs text-danger"
      role="alert"
    >
      {issueMessage(issue)}
    </p>{/each}

  <details bind:open={moreOpen} class="rounded-xl border border-border bg-surface/50 px-3 py-2">
    <summary class="cursor-pointer py-1 text-sm font-medium text-text"
      >{m.studio_more_options()}</summary
    >
    <div class="mt-3 space-y-4 pb-2">
      <label class="block space-y-1.5" for={`${idPrefix}-title`}>
        <span class="text-sm font-medium text-text">{m.studio_memory_title_label()}</span>
        <input
          id={`${idPrefix}-title`}
          value={title}
          maxlength="120"
          required
          class="w-full rounded-xl border border-border bg-bg px-3 py-2.5 text-sm text-text outline-none focus:border-accent"
          oninput={(event) => {
            title = (event.currentTarget as HTMLInputElement).value;
            titleEdited = true;
          }}
        />
        {#each titleIssues as issue, index (`${issue.path}-${index}`)}<p
            class="text-xs text-danger"
            role="alert"
          >
            {issueMessage(issue)}
          </p>{/each}
      </label>
      <TagListInput
        id={`${idPrefix}-themes`}
        field="themes"
        {issues}
        label={m.studio_memory_themes()}
        bind:values={themes}
        maxItems={12}
        maxLength={60}
      />
      <TagListInput
        id={`${idPrefix}-imagery`}
        field="imagery"
        {issues}
        label={m.studio_memory_imagery()}
        bind:values={imagery}
        maxItems={20}
        maxLength={120}
      />
      <fieldset>
        <legend class="mb-2 text-sm font-medium text-text">{m.studio_memory_importance()}</legend>
        <div class="flex gap-2" role="radiogroup" aria-label={m.studio_memory_importance()}>
          {#each [1, 2, 3, 4, 5] as level (level)}
            <button
              type="button"
              role="radio"
              aria-checked={salience === level}
              aria-label={m.studio_importance_level({ level: String(level) })}
              class="flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold {salience ===
              level
                ? 'border-accent bg-accent text-bg'
                : 'border-border text-text-muted hover:bg-surface-hover'}"
              onclick={() => (salience = level)}>{level}</button
            >
          {/each}
        </div>
        {#each salienceIssues as issue, index (`${issue.path}-${index}`)}<p
            class="text-xs text-danger"
            role="alert"
          >
            {issueMessage(issue)}
          </p>{/each}
      </fieldset>
      {#each otherIssues as issue, index (`${issue.path}-${index}`)}<p
          class="text-xs text-danger"
          role="alert"
        >
          {issueMessage(issue)}
        </p>{/each}
    </div>
  </details>

  <div class="flex justify-end">
    <button
      type="submit"
      class="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-bg shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
      disabled={saveDisabled}>{pending ? m.studio_saving() : m.studio_save_memory()}</button
    >
  </div>
</form>
