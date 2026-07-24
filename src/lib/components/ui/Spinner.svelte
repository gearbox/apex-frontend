<script lang="ts">
  export type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl';
  export type SpinnerTone = 'accent' | 'inverse';

  let {
    size = 'md',
    tone = 'accent',
    class: className = '',
    label,
  }: {
    size?: SpinnerSize;
    tone?: SpinnerTone;
    /** Pass layout utilities only; use size and tone for the spinner's visual treatment. */
    class?: string;
    /** Announces loading state to assistive tech. Omit when adjacent text already does. */
    label?: string;
  } = $props();

  const SIZE_CLASSES: Record<SpinnerSize, string> = {
    xs: 'h-3.5 w-3.5',
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
    xl: 'h-7 w-7',
    '2xl': 'h-8 w-8',
    '3xl': 'h-10 w-10',
  };

  const TONE_CLASSES: Record<SpinnerTone, string> = {
    accent: 'border-accent',
    inverse: 'border-white',
  };
</script>

<span
  class="inline-block shrink-0 animate-spin rounded-full border-2 border-t-transparent motion-reduce:animate-none {SIZE_CLASSES[
    size
  ]} {TONE_CLASSES[tone]} {className}"
  role={label ? 'status' : undefined}
  aria-live={label ? 'polite' : undefined}
  aria-hidden={label ? undefined : 'true'}
>
  {#if label}<span class="sr-only">{label}</span>{/if}
</span>
