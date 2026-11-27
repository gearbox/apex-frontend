<script lang="ts">
  import { formatRelativeDate } from '$lib/utils/format';
  import * as m from '$paraglide/messages';
  let {
    savedAt,
    onrestore,
    ondiscard,
  }: { savedAt: string; onrestore: () => void; ondiscard: () => void } = $props();
</script>

<section
  class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4"
  aria-label={m.studio_editor_restore_banner()}
>
  <p class="text-sm">{m.studio_editor_restore_prompt({ time: formatRelativeDate(savedAt) })}</p>
  <div class="flex gap-3">
    <button
      type="button"
      class="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-bg"
      onclick={onrestore}>{m.studio_editor_restore()}</button
    >
    <button
      type="button"
      class="rounded-lg border border-border px-3 py-2 text-sm"
      onclick={ondiscard}>{m.studio_editor_discard()}</button
    >
  </div>
</section>
