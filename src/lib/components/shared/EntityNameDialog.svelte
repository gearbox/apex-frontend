<script lang="ts">
  let {
    title,
    inputLabel,
    inputId,
    value = $bindable(),
    maxLength,
    cancelLabel,
    submitLabel,
    isPending = false,
    onsubmit,
    oncancel,
  }: {
    title: string;
    inputLabel: string;
    inputId: string;
    value: string;
    maxLength: number;
    cancelLabel: string;
    submitLabel: string;
    isPending?: boolean;
    onsubmit: () => void | Promise<void>;
    oncancel: () => void;
  } = $props();
</script>

<div
  class="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
  role="dialog"
  aria-modal="true"
  aria-labelledby={`${inputId}-title`}
>
  <form
    class="w-full max-w-sm rounded-2xl bg-surface p-5 shadow-2xl"
    onsubmit={(event) => {
      event.preventDefault();
      void onsubmit();
    }}
  >
    <h2 id={`${inputId}-title`} class="mb-3 text-sm font-semibold text-text">{title}</h2>
    <label class="mb-1 block text-xs font-medium text-text-muted" for={inputId}>{inputLabel}</label>
    <input
      id={inputId}
      bind:value
      required
      maxlength={maxLength}
      class="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
    />
    <div class="mt-4 flex justify-end gap-2">
      <button
        type="button"
        class="rounded-lg px-3 py-2 text-xs font-semibold text-text-muted hover:bg-surface-hover"
        onclick={oncancel}
      >
        {cancelLabel}
      </button>
      <button
        type="submit"
        disabled={isPending}
        class="rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
      >
        {submitLabel}
      </button>
    </div>
  </form>
</div>
