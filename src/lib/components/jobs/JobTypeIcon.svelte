<script lang="ts">
  import { ImageIcon, Images, Video, Film, Clapperboard, GalleryHorizontal, Cpu } from 'lucide-svelte';

  let { generationType, size = 16, class: className = '' }: {
    generationType: string;
    size?: number;
    class?: string;
  } = $props();

  const iconMap: Record<string, typeof Cpu> = {
    t2i:   ImageIcon,
    i2i:   Images,
    t2v:   Video,
    i2v:   Film,
    v2v:   Clapperboard,
    flf2v: GalleryHorizontal,
  };

  const Icon = $derived(iconMap[generationType] ?? Cpu);
</script>

<Icon {size} class={className} />
