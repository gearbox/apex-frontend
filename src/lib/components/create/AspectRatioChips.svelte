<script lang="ts">
  import { generationStore } from '$lib/stores/generation';
  import type { components } from '$lib/api/types';

  type AspectRatio = components['schemas']['AspectRatio'];

  interface RatioMeta {
    w: number;
    h: number;
    label: string;
  }

  const RATIO_META: Record<AspectRatio, RatioMeta> = {
    '1:1': { w: 14, h: 14, label: '1:1' },
    '4:3': { w: 14, h: 10, label: '4:3' },
    '3:4': { w: 10, h: 14, label: '3:4' },
    '16:9': { w: 14, h: 8, label: '16:9' },
    '9:16': { w: 8, h: 14, label: '9:16' },
    '3:2': { w: 14, h: 9, label: '3:2' },
    '2:3': { w: 9, h: 14, label: '2:3' },
  };

  const RATIOS: AspectRatio[] = ['3:4', '4:3', '1:1', '9:16', '16:9', '2:3', '3:2'];
</script>

<div class="flex flex-col gap-2">
  <span class="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Aspect Ratio</span
  >
  <div class="flex gap-1 overflow-x-auto">
    {#each RATIOS as ratio (ratio)}
      {@const meta = RATIO_META[ratio]}
      {@const isActive = $generationStore.aspectRatio === ratio}
      {@const cx = (18 - meta.w) / 2}
      {@const cy = (18 - meta.h) / 2}
      <button
        onclick={() => generationStore.setAspectRatio(ratio)}
        class="flex items-center gap-1.5 rounded-md border px-2 py-1.5 transition-all
          {isActive
          ? 'border-accent-dim bg-accent-glow text-accent'
          : 'border-border text-text-muted hover:border-border-active hover:text-text'}"
      >
        <svg
          viewBox="0 0 18 18"
          width="18"
          height="18"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <rect x={cx} y={cy} width={meta.w} height={meta.h} rx="1" />
        </svg>
        <span class="font-mono text-[11px] font-semibold">{meta.label}</span>
      </button>
    {/each}
  </div>
</div>
