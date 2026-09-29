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

<div class="auth-page-shell h-dvh overflow-y-auto bg-bg">
  <div class="auth-frame">
    <div class="language-selector-wrapper absolute z-50">
      <LanguageSelector />
    </div>
    <main class="auth-main">
      {@render children()}
    </main>
    {#if $hasLegalDocuments}
      <footer class="legal-footer">
        <a href={ROUTES.terms}>{m.legal_document_terms()}</a>
        <span aria-hidden="true">·</span>
        <a href={ROUTES.privacy}>{m.legal_document_privacy()}</a>
      </footer>
    {/if}
  </div>
</div>

<style>
  .auth-page-shell {
    padding-left: var(--safe-area-left);
    padding-right: var(--safe-area-right);
  }

  .auth-frame {
    --auth-selector-height: 2rem;

    display: flex;
    flex-direction: column;
    min-height: 100%;
    padding-bottom: max(1rem, var(--safe-area-bottom));
    padding-top: calc(max(1rem, var(--safe-area-top)) + var(--auth-selector-height) + 0.75rem);
    position: relative;
  }

  .language-selector-wrapper {
    right: max(1rem, var(--safe-area-right));
    top: max(1rem, var(--safe-area-top));
  }

  .auth-main {
    align-items: center;
    display: flex;
    flex: 1;
    justify-content: center;
    padding-inline: 1rem;
  }

  .legal-footer {
    color: var(--apex-text-muted);
    display: flex;
    font-size: 0.76rem;
    gap: 0.45rem;
    justify-content: center;
    margin-top: 1.5rem;
    padding-inline: 1rem;
  }

  .legal-footer a {
    color: inherit;
  }
</style>
