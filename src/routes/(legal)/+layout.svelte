<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import { ChevronLeft } from '@lucide/svelte';
  import LanguageSelector from '$lib/components/shared/LanguageSelector.svelte';
  import { hasStoredSession } from '$lib/stores/auth';
  import { ROUTES } from '$lib/utils/routes';
  import * as m from '$paraglide/messages';

  let { children }: { children: Snippet } = $props();
  let backHref = $state('/');

  // Public pages never refresh: rotating the shared refresh token from a second tab is treated as
  // token theft by the backend. The (app) layout authenticates if the user follows the back link.
  onMount(() => {
    if (hasStoredSession()) backHref = ROUTES.create;
  });
</script>

<div class="legal-page-shell" data-testid="legal-scroll">
  <header>
    <a class="back-link" href={backHref} aria-label={m.legal_back_aria()}>
      <ChevronLeft size={16} aria-hidden="true" />
      {m.legal_back()}
    </a>
    <LanguageSelector />
  </header>
  <main>{@render children()}</main>
</div>

<style>
  .legal-page-shell {
    background: var(--apex-bg);
    box-sizing: border-box;
    height: 100dvh;
    overflow-y: auto;
    overscroll-behavior-y: contain;
    -webkit-overflow-scrolling: touch;
    padding: max(1rem, var(--safe-area-top)) max(1rem, var(--safe-area-right))
      max(1.5rem, var(--safe-area-bottom)) max(1rem, var(--safe-area-left));
  }

  header,
  main {
    margin: 0 auto;
    max-width: 50rem;
  }

  header {
    align-items: center;
    display: flex;
    justify-content: space-between;
    margin-bottom: 2.5rem;
  }

  .back-link {
    align-items: center;
    color: var(--apex-accent);
    display: inline-flex;
    font-size: 0.9rem;
    font-weight: 600;
    gap: 0.2rem;
    min-height: 44px;
    padding: 0.5rem;
    text-decoration: none;
  }

  main {
    background: var(--apex-surface);
    border: 1px solid var(--apex-border);
    border-radius: 1rem;
    padding: clamp(1.2rem, 5vw, 2.5rem);
  }

  @media (min-width: 640px) {
    .legal-page-shell {
      padding: max(1.5rem, var(--safe-area-top)) max(1.5rem, var(--safe-area-right))
        max(1.5rem, var(--safe-area-bottom)) max(1.5rem, var(--safe-area-left));
    }
  }
</style>
