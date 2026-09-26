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

<div class="auth-page-shell relative h-dvh overflow-y-auto">
  <div class="language-selector-wrapper absolute z-50">
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
  .auth-page-shell {
    padding-left: var(--safe-area-left);
    padding-right: var(--safe-area-right);
  }

  .language-selector-wrapper {
    right: max(1rem, var(--safe-area-right));
    top: max(1rem, var(--safe-area-top));
  }

  .legal-footer {
    bottom: max(1rem, var(--safe-area-bottom));
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
