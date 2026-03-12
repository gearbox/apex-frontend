<script lang="ts">
  import type { components } from '$lib/api/types';

  type JobOutputItem = components['schemas']['JobOutputItem'];

  let { outputs }: {
    outputs: JobOutputItem[];
    generationType?: string;
  } = $props();

  const visibleOutputs = $derived(outputs.filter((o) => !o.is_thumbnail));
</script>

{#if visibleOutputs.length > 0}
  <div class="grid grid-cols-2 gap-2 md:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
    {#each visibleOutputs as output (output.id)}
      <div class="overflow-hidden rounded-lg border border-border">
        {#if output.content_type.startsWith('video/')}
          <video controls playsinline preload="metadata" class="w-full rounded-lg">
            <source src={output.url} type={output.content_type} />
          </video>
        {:else}
          <button
            type="button"
            class="w-full"
            aria-label="Open output {output.output_index + 1} in new tab"
            onclick={() => window.open(output.url, '_blank')}
          >
            <img
              src={output.url}
              alt="Output {output.output_index + 1}"
              loading="lazy"
              class="aspect-square w-full rounded-lg object-cover transition-opacity hover:opacity-90"
            />
          </button>
        {/if}
      </div>
    {/each}
  </div>
{/if}
