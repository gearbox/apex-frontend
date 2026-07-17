<script lang="ts">
  import { Check, Trash2 } from 'lucide-svelte';
  import type { CapturedVideoFrame } from './videoFrameCapture';

  export type ManualFrame = CapturedVideoFrame & { id: string };

  let {
    frames,
    selection,
    ontoggle,
    onremove,
    onbuttonready,
    sectionLabel,
    removeLabel,
    disabled = false,
  }: {
    frames: ManualFrame[];
    selection: Set<number>;
    ontoggle: (timestampMs: number) => void;
    onremove: (frame: ManualFrame) => void;
    onbuttonready?: (timestampMs: number, element: HTMLButtonElement | null) => void;
    sectionLabel: string;
    removeLabel: (timestamp: string) => string;
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

  function aspectRatio(frame: ManualFrame): string {
    return frame.width > 0 && frame.height > 0 ? `${frame.width} / ${frame.height}` : '16 / 9';
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

<div class="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
  {#each frames as frame (frame.id)}
    {@const timestamp = formatTimestamp(frame.timestampMs)}
    {@const selected = selection.has(frame.timestampMs)}
    <article
      class="overflow-hidden rounded-lg border bg-surface {selected
        ? 'border-accent ring-1 ring-accent'
        : 'border-border'}"
    >
      <button
        type="button"
        onclick={() => ontoggle(frame.timestampMs)}
        {disabled}
        use:registerToggle={frame.timestampMs}
        aria-pressed={selected}
        aria-label={`${sectionLabel}: ${timestamp}`}
        class="group relative block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        <div class="relative bg-black" style={`aspect-ratio: ${aspectRatio(frame)}`}>
          <img src={frame.previewUrl} alt={timestamp} class="h-full w-full object-contain" />
          {#if selected}
            <span
              class="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-white"
              aria-hidden="true"
            >
              <Check size={11} />
            </span>
          {/if}
        </div>
      </button>
      <div class="flex items-center justify-between gap-1 px-1.5 py-1">
        <span class="truncate text-[10px] tabular-nums text-text-muted">{timestamp}</span>
        <button
          type="button"
          onclick={() => onremove(frame)}
          {disabled}
          aria-label={removeLabel(timestamp)}
          class="flex min-h-11 min-w-11 items-center justify-center rounded text-text-muted transition-colors hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </article>
  {/each}
</div>
