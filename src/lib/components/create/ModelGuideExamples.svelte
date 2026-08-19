<script lang="ts">
  import * as m from '$paraglide/messages';
  import type { ModelGuideExample } from '$lib/content/modelGuides/types';

  interface Props {
    examples: readonly ModelGuideExample[];
    onuse: (example: ModelGuideExample) => void;
  }

  let { examples, onuse }: Props = $props();

  function aspectClass(aspectRatio: ModelGuideExample['aspectRatio']): string {
    const classes: Record<ModelGuideExample['aspectRatio'], string> = {
      '2:3': 'aspect-[2/3]',
      '3:2': 'aspect-[3/2]',
      '1:1': 'aspect-square',
      '9:16': 'aspect-[9/16]',
      '16:9': 'aspect-video',
      '3:4': 'aspect-[3/4]',
      '4:3': 'aspect-[4/3]',
    };
    return classes[aspectRatio];
  }
</script>

{#if examples.length > 0}
  <section class="space-y-3">
    {#each examples as example (example.prompt)}
      <article class="rounded-xl border border-border bg-bg p-3">
        {#if example.image}
          <div
            class="mb-3 overflow-hidden rounded-lg bg-surface-hover {aspectClass(
              example.aspectRatio,
            )}"
          >
            <img
              src={example.image}
              alt={example.prompt}
              loading="lazy"
              decoding="async"
              class="h-full w-full object-cover"
            />
          </div>
        {/if}
        <p class="text-sm leading-relaxed text-text">{example.prompt}</p>
        <button
          type="button"
          class="mt-3 rounded-lg bg-accent/15 px-3 py-2 text-xs font-semibold text-accent transition-colors hover:bg-accent/25"
          onclick={() => onuse(example)}>{m.model_guide_use_this_prompt()}</button
        >
      </article>
    {/each}
  </section>
{/if}
