<script lang="ts">
  import { AlertTriangle, X } from '@lucide/svelte';
  import type { SourceMediaDraft } from '$lib/stores/generation';

  let {
    source,
    detail,
    removeLabel,
    replaceLabel,
    onremove,
    onreplace,
    position = null,
  }: {
    source: SourceMediaDraft;
    detail: string;
    removeLabel: string;
    replaceLabel: string;
    onremove: () => void;
    onreplace?: (() => void) | undefined;
    position?: string | number | null;
  } = $props();
</script>

<div
  class="relative flex items-center gap-3 rounded-2.5 border p-3 {source.available
    ? 'border-border bg-surface'
    : 'border-warning/60 bg-warning/10'}"
>
  {#if position !== null}
    <span
      class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent"
    >
      {position}
    </span>
  {/if}
  {#if source.available && source.previewUrl && (source.mediaType === 'image' || source.mediaType === 'video')}
    <!-- Video preview URLs point at poster variants. -->
    <img src={source.previewUrl} alt="" class="h-12 w-12 rounded-lg object-cover" />
  {:else if source.available && (source.mediaType === 'image' || source.mediaType === 'video')}
    <div
      class="flex h-12 w-12 items-center justify-center rounded-lg bg-surface text-center text-[10px] text-text-dim"
    >
      Preview unavailable
    </div>
  {:else if source.available}
    <div
      class="flex h-12 w-12 items-center justify-center rounded-lg bg-surface text-center text-[10px] text-text-dim"
    >
      Unsupported
    </div>
  {:else}
    <AlertTriangle size={22} class="text-warning" aria-label="Source unavailable" />
  {/if}
  <div class="min-w-0 flex-1">
    <p class="truncate text-xs font-medium text-text">{source.label ?? source.assetRef}</p>
    <p class="text-[11px] text-text-dim">{detail}</p>
  </div>
  {#if onreplace}
    <button
      type="button"
      onclick={onreplace}
      class="rounded-md px-2 py-1 text-xs text-accent hover:bg-accent/10">{replaceLabel}</button
    >
  {/if}
  <button
    onclick={onremove}
    class="shrink-0 rounded-md p-1 text-text-muted transition-colors hover:text-text"
    aria-label={removeLabel}
  >
    <X size={14} />
  </button>
</div>
