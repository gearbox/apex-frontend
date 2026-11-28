<script lang="ts" module>
  export type SaveStatus = 'saved' | 'unsaved' | 'device' | 'saving';
</script>

<script lang="ts">
  import * as m from '$paraglide/messages';
  let {
    status,
    disabled = false,
    onclose,
    onsave,
  }: {
    status: SaveStatus;
    disabled?: boolean;
    onclose: () => void;
    onsave: () => void;
  } = $props();
  const STATUS_TEXT: Record<SaveStatus, () => string> = {
    saved: m.studio_editor_all_saved,
    unsaved: m.studio_editor_unsaved,
    device: m.studio_editor_device_only,
    saving: m.studio_editor_saving,
  };
</script>

<!-- One bar for both breakpoints: last and stuck to the bottom on mobile, first and stuck to the
     top on desktop. The parent must be a flex column. -->
<div
  class="sticky bottom-0 z-20 order-last -mx-4 flex items-center gap-3 border-t border-border bg-bg/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:top-0 md:bottom-auto md:order-first md:mx-0 md:rounded-b-xl md:border md:px-5"
>
  <p class="min-w-0 flex-1 text-sm text-text-muted" role="status" aria-live="polite">
    {STATUS_TEXT[status]()}
  </p>
  <button type="button" class="rounded-lg border border-border px-4 py-2" onclick={onclose}
    >{m.studio_editor_close()}</button
  >
  <button
    type="button"
    class="rounded-lg bg-accent px-4 py-2 font-semibold text-bg disabled:opacity-50"
    {disabled}
    onclick={onsave}>{status === 'saving' ? m.studio_editor_saving() : m.studio_save()}</button
  >
</div>
