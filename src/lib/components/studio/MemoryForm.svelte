<script lang="ts">
  import { untrack } from 'svelte';
  import TagListInput from '$lib/components/shared/TagListInput.svelte';
  import {
    deriveMemoryTitle,
    formatLocalIsoDate,
    todayLocalIsoDate,
  } from '$lib/studio/memoryDraft';
  import { issueLabel, type StudioValidationIssue } from '$lib/studio/formErrors';
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

  {#if issues.length > 0}
    <ul
      class="space-y-1 rounded-xl border border-danger/40 bg-danger/10 p-3 text-xs text-danger"
      role="alert"
    >
      {#each issues as issue, index (`${issue.path}-${index}`)}<li>{issueLabel(issue)}</li>{/each}
    </ul>
  {/if}

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
      </label>
      <TagListInput
        id={`${idPrefix}-themes`}
        label={m.studio_memory_themes()}
        bind:values={themes}
        maxItems={12}
        maxLength={60}
      />
      <TagListInput
        id={`${idPrefix}-imagery`}
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
      </fieldset>
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
