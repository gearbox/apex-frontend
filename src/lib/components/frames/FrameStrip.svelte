<script lang="ts">
  import { Check } from 'lucide-svelte';
  import type { components } from '$lib/api/types';

  type PreviewFrame = components['schemas']['PreviewFrame'];

  let {
    frames,
    selection,
    previewVersion,
    ontoggle,
    onthumbnailerror,
  }: {
    frames: PreviewFrame[];
    selection: Set<number>;
    previewVersion: number;
    ontoggle: (timestampMs: number) => void;
    onthumbnailerror: (previewVersion: number) => void;
  } = $props();

  function formatTimestamp(timestampMs: number): string {
    const value = Math.max(0, Math.round(timestampMs));
    const minutes = Math.floor(value / 60_000);
    const seconds = Math.floor((value % 60_000) / 1_000);
    const milliseconds = value % 1_000;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(
      milliseconds,
    ).padStart(3, '0')}`;
  }
</script>

<div class="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
  {#each frames as frame (frame.index)}
    {@const renderedPreviewVersion = previewVersion}
    {@const selected = selection.has(frame.timestamp_ms)}
    <button
      type="button"
      onclick={() => ontoggle(frame.timestamp_ms)}
      aria-pressed={selected}
      aria-label={formatTimestamp(frame.timestamp_ms)}
      class="group relative overflow-hidden rounded-lg border bg-surface text-left transition-colors {selected
        ? 'border-accent ring-1 ring-accent'
        : 'border-border hover:border-border-active'}"
    >
      <img
        src={frame.url}
        alt={formatTimestamp(frame.timestamp_ms)}
        class="aspect-video w-full object-cover"
        onerror={() => onthumbnailerror(renderedPreviewVersion)}
      />
      <span class="block truncate px-1.5 py-1 text-[10px] tabular-nums text-text-muted">
        {formatTimestamp(frame.timestamp_ms)}
      </span>
      {#if selected}
        <span
          class="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-white"
        >
          <Check size={11} />
        </span>
      {/if}
    </button>
  {/each}
</div>
