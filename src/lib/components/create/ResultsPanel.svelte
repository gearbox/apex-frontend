<script lang="ts">
  import { generationStore } from '$lib/stores/generation';
  import { timeAgo } from '$lib/utils/format';
  import { Download, RefreshCw, Play, Repeat2 } from 'lucide-svelte';
  import type { components } from '$lib/api/types';

  type UnifiedJobResponse = components['schemas']['UnifiedJobResponse'];
  type ModelType = components['schemas']['ModelType'];
  type JobOutputItem = components['schemas']['JobOutputItem'];

  let { showSkeleton = false }: { showSkeleton?: boolean } = $props();

  const job = $derived($generationStore.completedJob);
  const nonThumbnailOutputs = $derived((job?.outputs ?? []).filter((o) => !o.is_thumbnail));

  let videoModalUrl = $state<string | null>(null);

  function handleRegenerate(completedJob: UnifiedJobResponse) {
    generationStore.prefill({
      prompt: completedJob.prompt,
      model: (completedJob.model ?? 'grok-imagine-image') as ModelType,
    });
  }

  function handleUseAsInput(output: JobOutputItem) {
    if (!job) return;
    generationStore.setMode('i2i');
    generationStore.setSourceOutputId(output.id, output.url);
  }
</script>

{#if showSkeleton && !job}
  <!-- Skeleton while polling -->
  <div class="grid grid-cols-2 gap-3">
    {#each Array(2) as _, i (i)}
      <div class="aspect-square animate-pulse rounded-xl bg-surface"></div>
    {/each}
  </div>
{:else if job && nonThumbnailOutputs.length > 0}
  <div class="flex flex-col gap-4">
    <!-- Job metadata -->
    <div class="flex flex-wrap items-center gap-3 text-[11px] text-text-dim">
      <span class="capitalize">{job.model ?? 'Unknown model'}</span>
      <span>·</span>
      <span>{job.generation_type?.toUpperCase()}</span>
      {#if job.token_cost}
        <span>·</span>
        <span class="font-mono text-accent">◈ {job.token_cost}</span>
      {/if}
      {#if job.created_at}
        <span>·</span>
        <span>{timeAgo(job.created_at)}</span>
      {/if}
    </div>

    <!-- Outputs grid -->
    <div class="grid grid-cols-2 gap-2">
      {#each nonThumbnailOutputs as output (output.id)}
        <div class="group relative overflow-hidden rounded-xl border border-border">
          {#if output.content_type.startsWith('video/')}
            <!-- Video thumbnail with play overlay -->
            <div class="relative aspect-video bg-surface">
              <div class="absolute inset-0 flex items-center justify-center">
                <button
                  onclick={() => (videoModalUrl = output.url)}
                  class="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm hover:bg-black/70 transition-colors"
                >
                  <Play size={20} fill="white" />
                </button>
              </div>
            </div>
          {:else}
            <img
              src={output.url}
              alt="Generated output"
              class="w-full object-cover"
              loading="lazy"
            />
          {/if}

          <!-- Hover actions -->
          <div class="absolute inset-x-0 bottom-0 flex justify-end gap-1.5 bg-linear-to-t from-black/60 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <a
              href={output.url}
              download
              class="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20 text-white backdrop-blur-sm hover:bg-white/30 transition-colors"
              aria-label="Download"
            >
              <Download size={13} />
            </a>
            {#if job}
              <button
                onclick={() => handleRegenerate(job)}
                class="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20 text-white backdrop-blur-sm hover:bg-white/30 transition-colors"
                aria-label="Re-generate with same prompt"
              >
                <RefreshCw size={13} />
              </button>
            {/if}
            {#if output.content_type.startsWith('image/')}
              <button
                onclick={() => handleUseAsInput(output)}
                class="flex h-7 w-7 items-center justify-center rounded-lg bg-white/20 text-white backdrop-blur-sm hover:bg-white/30 transition-colors"
                aria-label="Use as I2I input"
              >
                <Repeat2 size={13} />
              </button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </div>
{:else if !showSkeleton}
  <!-- Empty state -->
  <div
    class="flex min-h-50 items-center justify-center rounded-2xl border border-border"
    style="background: radial-gradient(ellipse at center, color-mix(in srgb, var(--apex-accent-dim) 8%, transparent), transparent 70%);"
  >
    <div class="max-w-70 p-5 text-center">
      <div class="mb-4 text-5xl opacity-30">✦</div>
      <p class="text-sm leading-relaxed text-text-muted">Your generated content will appear here</p>
    </div>
  </div>
{/if}

<!-- Video modal -->
{#if videoModalUrl}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
    onclick={(e) => { if (e.target === e.currentTarget) videoModalUrl = null; }}
    onkeydown={(e) => e.key === 'Escape' && (videoModalUrl = null)}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
  >
    <div class="w-full max-w-2xl">
      <!-- svelte-ignore a11y_media_has_caption -->
      <video
        src={videoModalUrl}
        controls
        autoplay
        loop
        class="w-full rounded-xl"
      ></video>
    </div>
  </div>
{/if}
