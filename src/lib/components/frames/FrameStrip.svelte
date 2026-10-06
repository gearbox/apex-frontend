<script lang="ts">
  import { Check } from '@lucide/svelte';
  import type { LocalPreviewFrame } from './frameExtractionSession';

  let {
    frames,
    selection,
    ontoggle,
    onbuttonready,
    sectionLabel,
    aspectRatio = '16 / 9',
    disabled = false,
  }: {
    frames: LocalPreviewFrame[];
    selection: Set<number>;
    ontoggle: (timestampMs: number) => void;
    onbuttonready?: (timestampMs: number, element: HTMLButtonElement | null) => void;
    sectionLabel: string;
    aspectRatio?: string;
    disabled?: boolean;
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

  function registerToggle(node: HTMLButtonElement, timestampMs: number) {
    onbuttonready?.(timestampMs, node);
    return {
      destroy() {
        onbuttonready?.(timestampMs, null);
      },
    };
  }
</script>

<div class="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
  {#each frames as frame (frame.id)}
    {@const selected = selection.has(frame.timestampMs)}
    <button
      type="button"
      onclick={() => ontoggle(frame.timestampMs)}
      {disabled}
      use:registerToggle={frame.timestampMs}
      aria-pressed={selected}
      aria-label={`${sectionLabel}: ${formatTimestamp(frame.timestampMs)}`}
      class="group relative overflow-hidden rounded-lg border bg-surface text-left transition-colors {selected
        ? 'border-accent ring-1 ring-accent'
        : 'border-border hover:border-border-active'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
    >
      <div class="relative bg-black" style={`aspect-ratio: ${aspectRatio}`}>
        <img
          src={frame.previewUrl}
          alt={formatTimestamp(frame.timestampMs)}
          class="h-full w-full object-contain"
        />
      </div>
      <span class="block truncate px-1.5 py-1 text-[10px] tabular-nums text-text-muted">
        {formatTimestamp(frame.timestampMs)}
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
