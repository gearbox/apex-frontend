<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { ChevronDown } from 'lucide-svelte';
  import { locale, SUPPORTED_LOCALES, type Locale } from '$lib/stores/locale';
  import * as m from '$paraglide/messages';

  let { class: extraClass = '' }: { class?: string } = $props();

  let open = $state(false);
  let containerEl = $state<HTMLDivElement | undefined>();

  const LOCALE_LABELS: Record<Locale, () => string> = {
    en: m.profile_language_en,
    ru: m.profile_language_ru,
    sr: m.profile_language_sr,
  };

  // Ensure Paraglide is synced with the detected locale on mount
  onMount(() => {
    locale.set(get(locale));
  });

  function select(tag: Locale) {
    locale.set(tag);
    open = false;
  }

  // Close on outside click
  $effect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerEl && !containerEl.contains(e.target as Node)) {
        open = false;
      }
    }
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') open = false;
  }
</script>

<div bind:this={containerEl} class="relative {extraClass}" onkeydown={handleKeydown} role="none">
  <button
    type="button"
    aria-label={m.language_selector_label()}
    aria-expanded={open}
    aria-haspopup="listbox"
    onclick={() => (open = !open)}
    class="flex h-8 min-w-14 items-center justify-center gap-1 rounded-lg border border-border bg-surface px-3 text-xs font-semibold uppercase text-text transition-colors hover:border-accent focus:border-accent focus:outline-none"
  >
    {$locale}
    <ChevronDown size={12} class="transition-transform {open ? 'rotate-180' : ''}" />
  </button>

  {#if open}
    <div
      role="listbox"
      aria-label={m.language_selector_title()}
      class="absolute right-0 top-full z-50 mt-1 min-w-40 overflow-hidden rounded-lg border border-border bg-surface shadow-lg"
    >
      {#each SUPPORTED_LOCALES as tag (tag)}
        <button
          type="button"
          role="option"
          aria-selected={$locale === tag}
          onclick={() => select(tag)}
          class="flex w-full items-center px-3 py-2 text-left text-sm transition-colors hover:bg-surface-hover {$locale === tag ? 'font-semibold text-accent' : 'text-text'}"
        >
          {LOCALE_LABELS[tag]()}
        </button>
      {/each}
    </div>
  {/if}
</div>
