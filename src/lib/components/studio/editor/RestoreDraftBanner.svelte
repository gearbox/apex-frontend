<script lang="ts">
  import { formatRelativeDate } from '$lib/utils/format';
  import * as m from '$paraglide/messages';
  let {
    savedAt,
    status,
    baseMissing = false,
    onrestore,
    ondiscard,
    onretry,
  }: {
    savedAt: string;
    status: 'loading' | 'ready' | 'error';
    baseMissing?: boolean;
    onrestore: () => void;
    ondiscard: () => void;
    onretry: () => void;
  } = $props();
  let detail = $derived(
    status === 'loading'
      ? m.studio_editor_restore_checking()
      : status === 'error'
        ? m.studio_editor_restore_error()
        : baseMissing
          ? m.studio_editor_restore_base_missing()
          : '',
  );
</script>

<section
  class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4"
  aria-label={m.studio_editor_restore_banner()}
>
  <div class="min-w-0">
    <p class="text-sm">{m.studio_editor_restore_prompt({ time: formatRelativeDate(savedAt) })}</p>
    <p class="text-sm text-text-muted empty:hidden" role="status">{detail}</p>
  </div>
  <div class="flex gap-3">
    {#if status === 'error'}
      <button
        type="button"
        class="rounded-lg border border-border px-3 py-2 text-sm"
        onclick={onretry}>{m.studio_retry()}</button
      >
    {/if}
    <button
      type="button"
      class="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-bg disabled:opacity-50"
      disabled={status !== 'ready'}
      onclick={onrestore}>{m.studio_editor_restore()}</button
    >
    <button
      type="button"
      class="rounded-lg border border-border px-3 py-2 text-sm"
      onclick={ondiscard}>{m.studio_editor_discard()}</button
    >
  </div>
</section>
