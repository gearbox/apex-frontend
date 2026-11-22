<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import type { Snippet } from 'svelte';

  interface Props {
    ariaLabel?: string;
    labelledby?: string;
    initialFocusSelector?: string;
    panelClass?: string;
    onclose: () => void;
    children: Snippet;
  }

  let {
    ariaLabel,
    labelledby,
    initialFocusSelector,
    panelClass = '',
    onclose,
    children,
  }: Props = $props();

  let panel: HTMLDivElement | undefined = $state();
  let opener: HTMLElement | null = null;

  onMount(() => {
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    void tick().then(() => {
      const target = initialFocusSelector
        ? panel?.querySelector<HTMLElement>(initialFocusSelector)
        : panel?.querySelector<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
          );
      (target ?? panel)?.focus();
    });
  });

  onDestroy(() => {
    if (opener?.isConnected) opener.focus();
  });

  function focusableElements(): HTMLElement[] {
    return Array.from(
      panel?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    ).filter((element) => !element.hasAttribute('hidden'));
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      onclose();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = focusableElements();
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) {
      event.preventDefault();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
</script>

<div
  class="fixed inset-0 z-[180] flex items-end justify-center bg-black/50 p-0 md:items-center md:p-4"
  role="presentation"
  onclick={(event) => {
    if (event.target === event.currentTarget) onclose();
  }}
  onkeydown={handleKeydown}
>
  <div
    bind:this={panel}
    class="max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl border border-border bg-bg p-4 pb-[calc(24px+env(safe-area-inset-bottom))] shadow-2xl md:rounded-2xl md:p-6 {panelClass}"
    role="dialog"
    tabindex="-1"
    aria-modal="true"
    aria-label={ariaLabel}
    aria-labelledby={labelledby}
  >
    {@render children()}
  </div>
</div>
