<script lang="ts">
  import * as m from '$paraglide/messages';

  interface Props {
    primaryLabel: string;
    primaryVariant?: 'default' | 'danger';
    pending?: boolean;
    primaryDisabled?: boolean;
    oncancel: () => void;
    onprimary: () => void;
  }

  let {
    primaryLabel,
    primaryVariant = 'default',
    pending = false,
    primaryDisabled = false,
    oncancel,
    onprimary,
  }: Props = $props();
</script>

<div class="flex flex-wrap justify-end gap-2">
  <button
    type="button"
    class="rounded-lg border border-border px-4 py-2"
    disabled={pending}
    onclick={oncancel}>{m.common_cancel()}</button
  >
  <button
    type="button"
    class="rounded-lg px-4 py-2 disabled:opacity-50 {primaryVariant === 'danger'
      ? 'bg-danger text-white'
      : 'bg-accent text-bg'}"
    disabled={pending || primaryDisabled}
    onclick={onprimary}>{primaryLabel}</button
  >
</div>
