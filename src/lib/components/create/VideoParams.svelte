<script lang="ts">
  import type { components } from '$lib/api/types';
  import { generationStore } from '$lib/stores/generation';
  import {
    type VideoLimits,
    videoLimits,
    normalizeVideoParams,
    videoParameterViolation,
  } from '$lib/utils/videoParams';
  import { getT2iAspectRatios } from '$lib/utils/modelCapabilities';
  import * as m from '$paraglide/messages';
  let { modelInfo, mode }: { modelInfo: components['schemas']['ModelInfo'] | null; mode: string } =
    $props();
  const limits: VideoLimits | null = $derived(
    videoLimits(modelInfo, mode, $generationStore.sourceMedia),
  );
  const validation = $derived(videoParameterViolation({ ...$generationStore, mode }, modelInfo));
  const triStates = $derived([
    { value: null, label: m.video_default() },
    { value: true, label: m.video_on() },
    { value: false, label: m.video_off() },
  ]);
  const controls = $derived([
    {
      key: 'audio',
      label: m.video_audio(),
      value: $generationStore.audio,
      set: generationStore.setAudio,
    },
    {
      key: 'prompt_extend',
      label: m.video_prompt_extend(),
      value: $generationStore.promptExtend,
      set: generationStore.setPromptExtend,
    },
  ] as const);
  $effect(() => {
    if (!limits || limits.sourceTooLongToExtend) return;
    const normalized = normalizeVideoParams(
      limits,
      $generationStore.videoDuration,
      $generationStore.videoResolution,
    );
    if (normalized.duration !== $generationStore.videoDuration)
      generationStore.setVideoDuration(normalized.duration);
    if (normalized.resolution !== $generationStore.videoResolution)
      generationStore.setVideoResolution(normalized.resolution);
  });
</script>

{#if limits}
  <div class="flex flex-col gap-3">
    <label class="flex flex-col gap-2 text-xs text-text-muted">
      <span>{m.video_duration()} · {$generationStore.videoDuration}s</span>
      <input
        type="range"
        min={limits.minDuration}
        max={Math.max(limits.minDuration, limits.maxDuration)}
        step="1"
        disabled={limits.sourceTooLongToExtend}
        value={$generationStore.videoDuration}
        oninput={(e) => generationStore.setVideoDuration(Number(e.currentTarget.value))}
        class="w-full accent-accent disabled:opacity-50"
      />
      <span class="flex justify-between text-text-dim"
        ><span>{limits.minDuration}s</span><span
          >{Math.max(limits.minDuration, limits.maxDuration)}s</span
        ></span
      >
    </label>
    <fieldset class="flex flex-col gap-2">
      <legend class="mb-2 text-xs text-text-muted">{m.video_resolution()}</legend>
      <div class="flex flex-wrap gap-2">
        {#each limits.resolutions as resolution (resolution)}
          <button
            type="button"
            aria-pressed={$generationStore.videoResolution === resolution}
            onclick={() => generationStore.setVideoResolution(resolution)}
            class="rounded-lg border px-3 py-2 text-xs {resolution ===
            $generationStore.videoResolution
              ? 'border-accent text-accent'
              : 'border-border text-text-muted'}">{resolution}</button
          >
        {/each}
      </div>
    </fieldset>
    {#if !limits.anchoredModes.has(mode)}
      <fieldset>
        <legend class="mb-2 text-xs text-text-muted">{m.library_meta_aspect_ratio()}</legend>
        <div class="flex flex-wrap gap-2">
          {#each [null, ...getT2iAspectRatios(modelInfo)] as ratio (ratio)}
            <button
              type="button"
              aria-pressed={$generationStore.videoAspectRatio === ratio}
              onclick={() => generationStore.setVideoAspectRatio(ratio)}
              class="rounded-lg border px-3 py-2 text-xs {ratio ===
              $generationStore.videoAspectRatio
                ? 'border-accent text-accent'
                : 'border-border text-text-muted'}">{ratio ?? m.video_aspect_auto()}</button
            >
          {/each}
        </div>
      </fieldset>
    {/if}
    {#each controls as control (control.key)}
      {#if limits.supported.has(control.key)}
        <fieldset>
          <legend class="mb-2 text-xs text-text-muted">{control.label}</legend>
          <div class="flex gap-2">
            {#each triStates as option (option.label)}
              <button
                type="button"
                aria-pressed={control.value === option.value}
                onclick={() => control.set(option.value)}
                class="rounded-lg border px-3 py-2 text-xs {control.value === option.value
                  ? 'border-accent text-accent'
                  : 'border-border text-text-muted'}">{option.label}</button
              >
            {/each}
          </div>
        </fieldset>
      {/if}
    {/each}
    {#if modelInfo?.seed_range}
      <div class="flex items-end gap-2">
        <label class="flex flex-1 flex-col gap-2 text-xs text-text-muted"
          >{m.video_seed()}
          <input
            type="number"
            min={modelInfo.seed_range.min}
            max={modelInfo.seed_range.max}
            step="1"
            value={$generationStore.videoSeed ?? ''}
            oninput={(e) =>
              generationStore.setVideoSeed(
                e.currentTarget.value === '' ? null : e.currentTarget.valueAsNumber,
              )}
            class="rounded-lg border border-border bg-surface p-2 text-text"
          />
        </label>
        <button
          type="button"
          aria-label={m.video_random_seed()}
          class="rounded-lg border border-border p-2"
          onclick={() => {
            const range = modelInfo?.seed_range;
            if (range)
              generationStore.setVideoSeed(
                range.min + Math.floor(Math.random() * (range.max - range.min + 1)),
              );
          }}>🎲</button
        >
      </div>
    {/if}
    {#if validation}<p role="alert" class="text-xs text-warning">{validation}</p>{/if}
  </div>
{:else}
  <p class="text-xs text-warning">{m.video_unavailable()}</p>
{/if}
