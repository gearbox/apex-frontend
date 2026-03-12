<script lang="ts">
  import { removeToast, type Toast } from '$lib/stores/toasts';
  import { X } from 'lucide-svelte';

  let { toast }: { toast: Toast } = $props();

  const icons: Record<Toast['type'], string> = {
    success: '✓',
    error: '✕',
    warning: '⚠',
    info: 'ℹ',
  };

  const colors: Record<Toast['type'], string> = {
    success: 'border-success/30 bg-success/10 text-success',
    error: 'border-danger/30 bg-danger/10 text-danger',
    warning: 'border-warning/30 bg-warning/10 text-warning',
    info: 'border-accent-dim/30 bg-accent-dim/10 text-accent',
  };
</script>

<div
  class="flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-sm {colors[toast.type]}"
  style="background: color-mix(in srgb, var(--apex-surface) 90%, transparent);"
  role="alert"
>
  <span class="mt-0.5 shrink-0 text-sm font-bold">{icons[toast.type]}</span>
  <div class="min-w-0 flex-1">
    <p class="text-sm font-medium text-text">{toast.message}</p>
    {#if toast.action}
      {#if toast.action.href}
        <a
          href={toast.action.href}
          class="mt-0.5 block text-xs font-semibold underline"
          onclick={() => removeToast(toast.id)}
        >{toast.action.label}</a>
      {:else}
        <button
          class="mt-0.5 text-xs font-semibold underline"
          onclick={() => { toast.action?.onClick?.(); removeToast(toast.id); }}
        >{toast.action.label}</button>
      {/if}
    {/if}
  </div>
  <button
    class="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
    onclick={() => removeToast(toast.id)}
    aria-label="Dismiss"
  >
    <X size={14} />
  </button>
</div>
