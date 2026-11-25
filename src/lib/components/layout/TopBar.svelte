<script lang="ts">
  import { page } from '$app/stores';
  import { currentUser } from '$lib/stores/auth';
  import { appDisplayName } from '$lib/stores/product';
  import { NAV_DESTINATIONS } from '$lib/navigation/destinations';
  import { homeHref } from '$lib/product/home';
  import BalancePill from './BalancePill.svelte';

  let pageTitle = $derived(
    Object.values(NAV_DESTINATIONS)
      .find((item) => item.href === $page.url.pathname)
      ?.pageTitle() ?? '',
  );
  let logoText = $derived($appDisplayName);
  let initials = $derived(
    $currentUser?.display_name
      ? $currentUser.display_name.charAt(0).toUpperCase()
      : ($currentUser?.email?.charAt(0).toUpperCase() ?? 'M'),
  );
</script>

<header class="topbar chrome-no-select">
  <div class="topbar-left">
    <a href={$homeHref} class="topbar-logo">{logoText}</a>
    {#if pageTitle}
      <span class="topbar-title">{pageTitle}</span>
    {/if}
  </div>

  <div class="topbar-right">
    <BalancePill />
    <a href={NAV_DESTINATIONS.profile.href} class="topbar-avatar" aria-label="Profile">
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
    padding-top: max(10px, var(--safe-area-top));
    border-bottom: 1px solid var(--apex-border);
    flex-shrink: 0;
  }

  /* Desktop: slightly more padding */
  @media (min-width: 768px) {
    .topbar {
      padding: 12px 24px;
      padding-top: max(12px, var(--safe-area-top));
    }
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
