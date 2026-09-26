<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import LanguageSelector from '$lib/components/shared/LanguageSelector.svelte';
  import { initAuth } from '$lib/api/auth';
  import { isAuthenticated } from '$lib/stores/auth';
  import { ROUTES } from '$lib/utils/routes';
  import * as m from '$paraglide/messages';

  let { children }: { children: Snippet } = $props();

  // This minimal public layout does not mount the app auth guard, but a returning user should
  // still get the useful in-app destination once their persisted session is restored.
  onMount(() => {
    void initAuth();
  });
</script>

<div class="legal-page-shell">
  <header>
    <a class="back-link" href={$isAuthenticated ? ROUTES.create : '/'}>
      {m.legal_back_to_app()}
    </a>
    <LanguageSelector />
  </header>
  <main>{@render children()}</main>
</div>

<style>
  .legal-page-shell {
    background: var(--apex-bg);
    box-sizing: border-box;
    min-height: 100dvh;
    padding: 1rem;
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
    color: var(--apex-accent);
    font-size: 0.9rem;
    font-weight: 600;
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
      padding: 1.5rem;
    }
  }
</style>
