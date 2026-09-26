<script lang="ts">
  import type { Snippet } from 'svelte';
  import { createQuery } from '@tanstack/svelte-query';
  import LanguageSelector from '$lib/components/shared/LanguageSelector.svelte';
  import { currentLegalQueryOptions } from '$lib/queries/legal';
  import { hasLegalDocuments } from '$lib/stores/legal';
  import { ROUTES } from '$lib/utils/routes';
  import * as m from '$paraglide/messages';

  let { children }: { children: Snippet } = $props();
  createQuery(() => currentLegalQueryOptions());
</script>

<div class="relative h-dvh overflow-y-auto">
  <div class="absolute right-4 top-4 z-50">
    <LanguageSelector />
  </div>
  {@render children()}
  {#if $hasLegalDocuments}
    <footer class="legal-footer">
      <a href={ROUTES.terms}>{m.legal_document_terms()}</a>
      <span aria-hidden="true">·</span>
      <a href={ROUTES.privacy}>{m.legal_document_privacy()}</a>
    </footer>
  {/if}
</div>

<style>
  .legal-footer {
    bottom: 1rem;
    color: var(--apex-text-muted);
    display: flex;
    font-size: 0.76rem;
    gap: 0.45rem;
    justify-content: center;
    left: 1rem;
    position: fixed;
    right: 1rem;
  }

  .legal-footer a {
    color: inherit;
  }
</style>
