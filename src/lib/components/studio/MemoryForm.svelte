<script lang="ts">
  import { tick, untrack } from 'svelte';
  import TagListInput from '$lib/components/shared/TagListInput.svelte';
  import {
    deriveMemoryTitle,
    formatLocalIsoDate,
    todayLocalIsoDate,
  } from '$lib/studio/memoryDraft';
  import { codePointLength } from '$lib/studio/text';
  import { STUDIO_LIMITS } from '$lib/studio/limits';
  import {
    describedBy,
    issueId,
    fieldIssues,
    issueField,
    issueMessage,
    type StudioValidationIssue,
  } from '$lib/studio/formErrors';
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

  export interface InitialMemory {
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
    error?: string;
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
    error = '',
    onsubmit,
    oncancel,
  }: Props = $props();

  let body = $state(untrack(() => initial?.body ?? ''));
  let title = $state(untrack(() => initial?.title ?? ''));
  let titleEdited = $state(
    untrack(
      () =>
        mode === 'edit' ||
        (initial !== undefined && initial.title !== deriveMemoryTitle(initial.body)),
    ),
  );
  let occurredOn = $state(
    untrack(() => (initial ? (initial.occurred_on ?? '') : todayLocalIsoDate())),
  );
  let themes = $state<string[]>(untrack(() => [...(initial?.themes ?? [])]));
  let imagery = $state<string[]>(untrack(() => [...(initial?.imagery ?? [])]));
  let salience = $state(untrack(() => initial?.salience ?? 3));
  let moreOpen = $state(false);
  let formEl: HTMLFormElement | undefined = $state();
  let bodyEl: HTMLTextAreaElement | undefined = $state();
  let bodyIssues = $derived(fieldIssues(issues, 'body'));
  let titleIssues = $derived(fieldIssues(issues, 'title'));
  let dateIssues = $derived(fieldIssues(issues, 'occurred_on'));
  let salienceIssues = $derived(fieldIssues(issues, 'salience'));
  let otherIssues = $derived(
    issues.filter(
      (issue) =>
        !['body', 'title', 'occurred_on', 'salience', 'themes', 'imagery'].includes(
          issueField(issue),
        ),
    ),
  );

  $effect(() => {
    if (autofocus) bodyEl?.focus();
  });

  $effect(() => {
    const currentIssues = issues;
    if (
      currentIssues.some((issue) =>
        ['title', 'themes', 'imagery', 'salience'].includes(issueField(issue)),
      ) ||
      otherIssues.length > 0
    ) {
      moreOpen = true;
    }
    if (currentIssues.length > 0) {
      void tick().then(() => formEl?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
    }
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

  let bodyLength = $derived(codePointLength(body));
  let titleLength = $derived(codePointLength(title));
  let saveDisabled = $derived(
    pending ||
      !body.trim() ||
      !title.trim() ||
      !deriveMemoryTitle(body).trim() ||
      bodyLength > STUDIO_LIMITS.memoryBody ||
      titleLength > STUDIO_LIMITS.memoryTitle,
  );
  let dateLabel = $derived(
    occurredOn
      ? occurredOn === todayLocalIsoDate()
        ? m.studio_date_today()
        : formatLocalIsoDate(occurredOn, $locale)
      : m.studio_date_undated(),
  );
</script>

<form
  bind:this={formEl}
  class="space-y-4"
  aria-busy={pending ? 'true' : undefined}
  onsubmit={submit}
>
  <div class="flex flex-wrap items-center justify-between gap-2">
    <p class="text-sm font-semibold text-text">
      {mode === 'create' ? m.studio_quick_capture() : m.studio_edit_memory()}
    </p>
  </div>

  <div class="block space-y-2">
    <label class="text-sm font-medium text-text" for={`${idPrefix}-body`}
      >{m.studio_memory_body_label()}</label
    >
    <textarea
      id={`${idPrefix}-body`}
      bind:this={bodyEl}
      value={body}
      rows="5"
      readonly={pending}
      required
      placeholder={m.studio_memory_body_placeholder()}
      aria-invalid={bodyIssues.length > 0 || bodyLength > STUDIO_LIMITS.memoryBody
        ? 'true'
        : undefined}
      aria-describedby={describedBy(`${idPrefix}-body`, bodyIssues, [`${idPrefix}-body-count`])}
      class="w-full resize-y rounded-2xl border border-border bg-bg px-4 py-3 text-sm leading-6 text-text outline-none placeholder:text-text-dim focus:border-accent"
      oninput={updateBody}></textarea>
    <span
      id={`${idPrefix}-body-count`}
      class="block text-xs {bodyLength > STUDIO_LIMITS.memoryBody
        ? 'text-danger'
        : 'text-text-dim'}">{bodyLength} / {STUDIO_LIMITS.memoryBody}</span
    >
    {#each bodyIssues as issue, index (`${issue.path}-${index}`)}<span
        id={issueId(`${idPrefix}-body`, index)}
        class="block text-xs text-danger"
        role="alert">{issueMessage(issue)}</span
      >{/each}
  </div>

  <div class="flex flex-wrap items-center gap-2">
    <label class="sr-only" for={`${idPrefix}-date`}>{m.studio_memory_date_label()}</label>
    <input
      id={`${idPrefix}-date`}
      type="date"
      disabled={pending}
      bind:value={occurredOn}
      aria-label={dateLabel}
      aria-invalid={dateIssues.length > 0 ? 'true' : undefined}
      aria-describedby={describedBy(`${idPrefix}-date`, dateIssues)}
      class="rounded-full border border-border bg-surface px-3 py-1.5 text-sm text-text"
    />
    <span class="text-xs text-text-muted">{dateLabel}</span>
    {#if occurredOn}
      <button
        type="button"
        class="rounded-full px-2 py-1 text-xs text-text-muted hover:bg-surface-hover"
        disabled={pending}
        onclick={() => (occurredOn = '')}
      >
        {m.studio_date_no_date()}
      </button>
    {:else}
      <button
        type="button"
        class="rounded-full px-2 py-1 text-xs text-accent hover:bg-surface-hover"
        disabled={pending}
        onclick={() => (occurredOn = todayLocalIsoDate())}
      >
        {m.studio_date_set_today()}
      </button>
    {/if}
  </div>
  {#each dateIssues as issue, index (`${issue.path}-${index}`)}<p
      id={issueId(`${idPrefix}-date`, index)}
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
      <div class="block space-y-1.5">
        <label class="text-sm font-medium text-text" for={`${idPrefix}-title`}
          >{m.studio_memory_title_label()}</label
        >
        <input
          id={`${idPrefix}-title`}
          value={title}
          readonly={pending}
          required
          aria-invalid={titleIssues.length > 0 || titleLength > STUDIO_LIMITS.memoryTitle
            ? 'true'
            : undefined}
          aria-describedby={describedBy(`${idPrefix}-title`, titleIssues, [
            `${idPrefix}-title-count`,
          ])}
          class="w-full rounded-xl border border-border bg-bg px-3 py-2.5 text-sm text-text outline-none focus:border-accent"
          oninput={(event) => {
            title = (event.currentTarget as HTMLInputElement).value;
            titleEdited = true;
          }}
        />
        <span
          id={`${idPrefix}-title-count`}
          class="block text-xs {titleLength > STUDIO_LIMITS.memoryTitle
            ? 'text-danger'
            : 'text-text-dim'}">{titleLength} / {STUDIO_LIMITS.memoryTitle}</span
        >
        {#each titleIssues as issue, index (`${issue.path}-${index}`)}<p
            id={issueId(`${idPrefix}-title`, index)}
            class="text-xs text-danger"
            role="alert"
          >
            {issueMessage(issue)}
          </p>{/each}
      </div>
      <TagListInput
        id={`${idPrefix}-themes`}
        field="themes"
        {issues}
        label={m.studio_memory_themes()}
        disabled={pending}
        bind:values={themes}
        maxItems={STUDIO_LIMITS.themes.items}
        maxLength={STUDIO_LIMITS.themes.length}
      />
      <TagListInput
        id={`${idPrefix}-imagery`}
        field="imagery"
        {issues}
        label={m.studio_memory_imagery()}
        disabled={pending}
        bind:values={imagery}
        maxItems={STUDIO_LIMITS.imagery.items}
        maxLength={STUDIO_LIMITS.imagery.length}
      />
      <fieldset>
        <legend class="mb-2 text-sm font-medium text-text">{m.studio_memory_importance()}</legend>
        <div
          id={`${idPrefix}-salience`}
          class="flex gap-2"
          role="radiogroup"
          aria-label={m.studio_memory_importance()}
          aria-invalid={salienceIssues.length > 0 ? 'true' : undefined}
          aria-describedby={describedBy(`${idPrefix}-salience`, salienceIssues)}
          tabindex={salienceIssues.length > 0 ? -1 : undefined}
        >
          {#each [1, 2, 3, 4, 5] as level (level)}
            <button
              type="button"
              role="radio"
              disabled={pending}
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
            id={issueId(`${idPrefix}-salience`, index)}
            class="text-xs text-danger"
            role="alert"
          >
            {issueMessage(issue)}
          </p>{/each}
      </fieldset>
      {#each otherIssues as issue, index (`${issue.path}-${index}`)}<p
          id={`${idPrefix}-other-issue-${index}`}
          class="text-xs text-danger"
          role="alert"
        >
          {issueMessage(issue)}
        </p>{/each}
    </div>
  </details>

  {#if error}
    <p class="text-sm text-danger" role="alert">{error}</p>
  {/if}

  <div class="flex justify-end gap-2">
    {#if oncancel}
      <button
        type="button"
        class="rounded-xl px-4 py-2.5 text-sm text-text-muted hover:bg-surface-hover"
        onclick={oncancel}
      >
        {m.common_cancel()}
      </button>
    {/if}
    <button
      type="submit"
      class="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-bg shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
      disabled={saveDisabled}>{pending ? m.studio_saving() : m.studio_save_memory()}</button
    >
  </div>
</form>
