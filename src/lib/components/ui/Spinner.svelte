<script lang="ts">
  export type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg';

  let {
    size = 'md',
    class: className = '',
    label,
  }: {
    size?: SpinnerSize;
    class?: string;
    /** Announces loading state to assistive tech. Omit when adjacent text already does. */
    label?: string;
  } = $props();

  const SIZE_CLASSES: Record<SpinnerSize, string> = {
    xs: 'h-3.5 w-3.5',
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-7 w-7',
  };

  // A caller-supplied class may specify its own size (h-6 w-6, h-8 w-8, h-10 w-10 — outside
  // the four presets above) or border color (border-white on a dark overlay, vs. the default
  // border-accent). Skip the matching preset rather than emitting a same-specificity utility
  // whose winner would depend on Tailwind's generated rule order, not on attribute order.
  const hasSizeOverride = $derived(/\b[hw]-\S+/.test(className));
  const hasColorOverride = $derived(/\bborder-(?!2\b|t-transparent\b)\S+/.test(className));
</script>

<span
  class="inline-block shrink-0 animate-spin rounded-full border-2 border-t-transparent motion-reduce:animate-none {hasSizeOverride
    ? ''
    : SIZE_CLASSES[size]} {hasColorOverride ? '' : 'border-accent'} {className}"
  role={label ? 'status' : undefined}
  aria-live={label ? 'polite' : undefined}
  aria-hidden={label ? undefined : 'true'}
>
  {#if label}<span class="sr-only">{label}</span>{/if}
</span>
