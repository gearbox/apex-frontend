<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  let { onVisible, disabled = false }: { onVisible: () => void; disabled?: boolean } = $props();

  let sentinel: HTMLDivElement;
  let observer: IntersectionObserver;

  onMount(() => {
    observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !disabled) {
          onVisible();
        }
      },
      { rootMargin: '200px' },
    );
    if (sentinel) observer.observe(sentinel);
  });

  onDestroy(() => {
    observer?.disconnect();
  });

  $effect(() => {
    // Re-observe when disabled changes
    if (observer && sentinel) {
      observer.unobserve(sentinel);
      if (!disabled) observer.observe(sentinel);
    }
  });
</script>

<div bind:this={sentinel} class="h-1 w-full"></div>
