<script lang="ts">
  import { generationStore } from '$lib/stores/generation';
  import { timeAgo } from '$lib/utils/format';
  import { Download, RefreshCw, Play } from 'lucide-svelte';
  import type { components } from '$lib/api/types';

  type GrokJobStatusResponse = components['schemas']['GrokJobStatusResponse'];

  let { showSkeleton = false }: { showSkeleton?: boolean } = $props();

  const job = $derived($generationStore.completedJob);
  const isVideo = $derived(
    job?.generation_type === 't2v' || job?.generation_type === 'i2v',
  );

  let videoModalUrl = $state<string | null>(null);

  function handleRegenerate(completedJob: GrokJobStatusResponse) {
    generationStore.prefill({
      prompt: completedJob.prompt,
      model: completedJob.model ?? 'grok-imagine-image',
    });
  }
</script>

{#if showSkeleton && !job}
  <!-- Skeleton while polling -->
  <div class="grid grid-cols-2 gap-3">
    {#each Array(2) as _, i (i)}
      <div class="aspect-square animate-pulse rounded-xl bg-surface"></div>
    {/each}
  </div>
{:else if job && job.outputs && job.outputs.length > 0}
  <div class="flex flex-col gap-4">
    <!-- Job metadata -->
    <div class="flex flex-wrap items-center gap-3 text-[11px] text-text-dim">
      <span class="capitalize">{job.model ?? 'Unknown model'}</span>
      <span>·</span>
      <span>{job.generation_type?.toUpperCase()}</span>
      {#if job.tokens_charged}
        <span>·</span>
        <span class="font-mono text-accent">◈ {job.tokens_charged}</span>
      {/if}
      {#if job.created_at}
        <span>·</span>
        <span>{timeAgo(job.created_at)}</span>
      {/if}
    </div>

    <!-- Outputs grid -->
    <div class="grid grid-cols-2 gap-2 md:grid-cols-{Math.min(job.outputs.length, 2)}">
      {#each job.outputs as url, i (i)}
        <div class="group relative overflow-hidden rounded-xl border border-border">
          {#if isVideo}
            <!-- Video thumbnail with play overlay -->
            <div class="relative aspect-video bg-surface">
              <div class="absolute inset-0 flex items-center justify-center">
                <button
                  onclick={() => (videoModalUrl = url)}
                  class="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm hover:bg-black/70 transition-colors"
                >
                  <Play size={20} fill="white" />
                </button>
              </div>
            </div>
          {:else}
            <img
              src={url}
              alt="Generated image {i + 1}"
              class="w-full object-cover"
              loading="lazy"
            />
          {/if}

          <!-- Hover actions -->
          <div class="absolute inset-x-0 bottom-0 flex justify-end gap-1.5 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
            <a
              href={url}
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
                aria-label="Re-generate"
              >
                <RefreshCw size={13} />
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
    class="flex min-h-[200px] items-center justify-center rounded-2xl border border-border"
    style="background: radial-gradient(ellipse at center, color-mix(in srgb, var(--apex-accent-dim) 8%, transparent), transparent 70%);"
  >
    <div class="max-w-[280px] p-5 text-center">
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
