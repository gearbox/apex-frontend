<script lang="ts">
  import { generationStore } from '$lib/stores/generation';
  import { getEditAspectRatios, getT2iAspectRatios } from '$lib/utils/modelCapabilities';
  import type { components } from '$lib/api/types';
  import * as m from '$paraglide/messages';

  type AspectRatio = components['schemas']['AspectRatio'];
  type ModelInfo = components['schemas']['ModelInfo'];

  let {
    modelInfo = null,
    aspectError = null,
  }: { modelInfo?: ModelInfo | null; aspectError?: string | null } = $props();

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

  // Display order only — ratio membership is owned by KNOWN_ASPECT_RATIOS in modelCapabilities.ts
  const RATIOS: AspectRatio[] = ['3:4', '4:3', '1:1', '9:16', '16:9', '2:3', '3:2'];

  const isEditMode = $derived($generationStore.mode === 'i2i');
  const editRatios = $derived(getEditAspectRatios(modelInfo));
  // Capability unknown while the providers query is still loading — never show the
  // "no reshape" notice or explicit ratio chips until modelInfo actually resolves.
  const capabilityLoading = $derived(isEditMode && modelInfo == null);
  const noReshape = $derived(isEditMode && modelInfo != null && editRatios.length === 0);
  // Preserve the canonical display order, narrowed to what the selected model actually advertises.
  const t2iRatios = $derived(
    RATIOS.filter((ratio) => getT2iAspectRatios(modelInfo).includes(ratio)),
  );

  // If the current model doesn't advertise the stored t2i aspect ratio (e.g. after
  // switching models), snap to the first ratio it does support instead of letting a
  // stale selection reach buildGeneratePayload and 400 at submit time.
  $effect(() => {
    if (
      !isEditMode &&
      modelInfo != null &&
      t2iRatios.length > 0 &&
      !t2iRatios.includes($generationStore.aspectRatio)
    ) {
      generationStore.setAspectRatio(t2iRatios[0]);
    }
  });

  function ratioIcon(meta: RatioMeta) {
    const cx = (18 - meta.w) / 2;
    const cy = (18 - meta.h) / 2;
    return { cx, cy };
  }
</script>

{#snippet chip(label: string, isActive: boolean, onclick: () => void, meta?: RatioMeta)}
  <button
    {onclick}
    class="flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-semibold transition-all
      {isActive
      ? 'border-accent-dim bg-accent-glow text-accent'
      : 'border-border text-text-muted hover:border-border-active hover:text-text'}"
  >
    {#if meta}
      {@const { cx, cy } = ratioIcon(meta)}
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
      <span class="font-mono">{label}</span>
    {:else}
      {label}
    {/if}
  </button>
{/snippet}

<div class="flex flex-col gap-2">
  <span class="text-[11px] font-semibold uppercase tracking-wider text-text-muted"
    >Aspect Ratio</span
  >
  {#if noReshape}
    <p class="rounded-md border border-border bg-surface px-2.5 py-2 text-xs text-text-muted">
      {m.create_aspect_no_reshape()}
    </p>
  {:else if capabilityLoading}
    <div class="flex gap-1 overflow-x-auto opacity-60 pointer-events-none">
      {@render chip(m.create_aspect_auto(), $generationStore.editAspectRatio === null, () =>
        generationStore.setEditAspectRatio(null),
      )}
    </div>
  {:else if isEditMode}
    <div class="flex gap-1 overflow-x-auto">
      {@render chip(m.create_aspect_auto(), $generationStore.editAspectRatio === null, () =>
        generationStore.setEditAspectRatio(null),
      )}
      {#each editRatios as ratio (ratio)}
        {@render chip(
          RATIO_META[ratio].label,
          $generationStore.editAspectRatio === ratio,
          () => generationStore.setEditAspectRatio(ratio),
          RATIO_META[ratio],
        )}
      {/each}
    </div>
  {:else}
    <div class="flex gap-1 overflow-x-auto">
      {#each t2iRatios as ratio (ratio)}
        {@render chip(
          RATIO_META[ratio].label,
          $generationStore.aspectRatio === ratio,
          () => generationStore.setAspectRatio(ratio),
          RATIO_META[ratio],
        )}
      {/each}
    </div>
  {/if}
  {#if aspectError}
    <p class="text-xs text-danger">{aspectError}</p>
  {/if}
</div>
