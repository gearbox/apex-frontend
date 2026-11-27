<script lang="ts">
  import * as m from '$paraglide/messages';
  let {
    status,
    disabled = false,
    saving = false,
    onclose,
    onsave,
  }: {
    status: 'saved' | 'unsaved' | 'saving';
    disabled?: boolean;
    saving?: boolean;
    onclose: () => void;
    onsave: () => void;
  } = $props();
  let statusText = $derived(
    status === 'saving'
      ? m.studio_editor_saving()
      : status === 'unsaved'
        ? m.studio_editor_unsaved()
        : m.studio_editor_all_saved(),
  );
</script>

<div
  class="sticky bottom-0 z-20 -mx-4 mt-6 flex items-center gap-3 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur md:bottom-auto md:top-0 md:mx-0 md:rounded-b-xl md:border md:px-5"
  style="padding-bottom: max(0.75rem, env(safe-area-inset-bottom));"
>
  <p class="min-w-0 flex-1 text-sm text-text-muted" role="status" aria-live="polite">
    {statusText}
  </p>
  <button type="button" class="rounded-lg border border-border px-4 py-2" onclick={onclose}
    >{m.studio_editor_close()}</button
  >
  <button
    type="button"
    class="rounded-lg bg-accent px-4 py-2 font-semibold text-bg disabled:opacity-50"
    disabled={disabled || saving}
    onclick={onsave}>{saving ? m.studio_editor_saving() : m.studio_save()}</button
  >
</div>
