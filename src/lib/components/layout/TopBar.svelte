<script lang="ts">
  import { page } from '$app/stores';
  import { currentUser } from '$lib/stores/auth';
  import * as m from '$paraglide/messages';
  import BalancePill from './BalancePill.svelte';

  const pageTitleFns: Record<string, () => string> = {
    '/app/create': m.topbar_create,
    '/app/gallery': m.topbar_gallery,
    '/app/jobs': m.topbar_jobs,
    '/app/billing': m.topbar_billing,
    '/app/profile': m.topbar_profile,
  };

  let pageTitle = $derived((pageTitleFns[$page.url.pathname] ?? (() => ''))());
  let initials = $derived(
    $currentUser?.display_name
      ? $currentUser.display_name.charAt(0).toUpperCase()
      : $currentUser?.email?.charAt(0).toUpperCase() ?? 'M',
  );
</script>

<header class="topbar">
  <div class="topbar-left">
    <a href="/app/create" class="topbar-logo">apex</a>
    {#if pageTitle}
      <span class="topbar-title">{pageTitle}</span>
    {/if}
  </div>

  <div class="topbar-right">
    <BalancePill />
    <a href="/app/profile" class="topbar-avatar" aria-label="Profile">
      {initials}
    </a>
  </div>
</header>

<style>
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 16px;
    border-bottom: 1px solid var(--apex-border);
    flex-shrink: 0;
  }

  /* Desktop: slightly more padding */
  @media (min-width: 768px) {
    .topbar { padding: 12px 24px; }
  }

  .topbar-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .topbar-logo {
    font-size: 18px;
    font-weight: 900;
    background: linear-gradient(135deg, var(--apex-accent), var(--apex-accent-dim));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    text-decoration: none;
  }

  .topbar-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--apex-text);
  }

  .topbar-right {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .topbar-avatar {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: linear-gradient(135deg, var(--apex-accent-dim), var(--apex-accent));
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 800;
    color: #fff;
    cursor: pointer;
    text-decoration: none;
  }
</style>
