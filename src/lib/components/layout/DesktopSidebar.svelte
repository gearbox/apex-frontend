<script lang="ts">
  import { page } from '$app/stores';
  import { sidebarCollapsed, toggleSidebar } from '$lib/stores/ui';
  import {
    Plus,
    Image,
    Activity,
    Coins,
    User,
    ChevronLeft,
    ChevronRight,
  } from 'lucide-svelte';

  const iconMap: Record<string, typeof Plus> = {
    plus: Plus,
    image: Image,
    activity: Activity,
    coins: Coins,
    user: User,
  };

  const mainItems = [
    { label: 'Create', href: '/app/create', icon: 'plus' },
    { label: 'Gallery', href: '/app/gallery', icon: 'image' },
    { label: 'Jobs', href: '/app/jobs', icon: 'activity' },
    { label: 'Billing', href: '/app/billing', icon: 'coins' },
  ];

  const profileItem = { label: 'Profile', href: '/app/profile', icon: 'user' };
</script>

<aside class="sidebar" class:collapsed={$sidebarCollapsed}>
  <!-- Logo area -->
  <div class="sidebar-logo">
    {#if $sidebarCollapsed}
      <span class="logo-letter">A</span>
    {:else}
      <span class="logo-text">apex</span>
      <span class="logo-badge">PWA</span>
    {/if}
  </div>

  <!-- Main nav -->
  <nav class="sidebar-nav">
    {#each mainItems as item}
      {@const Icon = iconMap[item.icon]}
      {@const isActive = $page.url.pathname.startsWith(item.href)}
      <a
        href={item.href}
        class="nav-item"
        class:active={isActive}
        class:collapsed={$sidebarCollapsed}
        title={$sidebarCollapsed ? item.label : undefined}
      >
        <span class="nav-icon">{#if Icon}<Icon size={18} strokeWidth={isActive ? 2 : 1.75} />{/if}</span>
        {#if !$sidebarCollapsed}
          <span class="nav-label">{item.label}</span>
        {/if}
      </a>
    {/each}
  </nav>

  <!-- Bottom section: profile + collapse -->
  <div class="sidebar-bottom">
    {#if true}
      {@const ProfileIcon = iconMap[profileItem.icon]}
      {@const profileActive = $page.url.pathname.startsWith(profileItem.href)}
      <a
        href={profileItem.href}
        class="nav-item"
        class:active={profileActive}
        class:collapsed={$sidebarCollapsed}
        title={$sidebarCollapsed ? profileItem.label : undefined}
      >
        <span class="nav-icon">{#if ProfileIcon}<ProfileIcon size={18} strokeWidth={profileActive ? 2 : 1.75} />{/if}</span>
        {#if !$sidebarCollapsed}
          <span class="nav-label">{profileItem.label}</span>
        {/if}
      </a>
    {/if}
    <button
      onclick={toggleSidebar}
      class="collapse-btn"
      aria-label={$sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
    >
      {#if $sidebarCollapsed}
        <ChevronRight size={16} />
      {:else}
        <ChevronLeft size={16} />
      {/if}
    </button>
  </div>
</aside>

<style>
  .sidebar {
    width: 220px;
    border-right: 1px solid var(--apex-border);
    display: flex;
    flex-direction: column;
    padding: 16px 12px;
    background: var(--apex-bg);
    flex-shrink: 0;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    overflow: hidden;
    height: 100%;
  }

  .sidebar.collapsed {
    width: 60px;
    padding: 16px 6px;
  }

  .sidebar-logo {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 4px 14px;
    margin-bottom: 24px;
    min-height: 32px;
  }

  .collapsed .sidebar-logo {
    justify-content: center;
    padding: 4px 0;
  }

  .logo-text {
    font-size: 22px;
    font-weight: 900;
    letter-spacing: -0.03em;
    background: linear-gradient(135deg, var(--apex-accent), var(--apex-accent-dim));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .logo-letter {
    font-size: 20px;
    font-weight: 900;
    background: linear-gradient(135deg, var(--apex-accent), var(--apex-accent-dim));
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .logo-badge {
    font-size: 9px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    background: var(--apex-accent-glow);
    color: var(--apex-accent);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .sidebar-nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
  }

  .sidebar-bottom {
    border-top: 1px solid var(--apex-border);
    padding-top: 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-radius: 10px;
    color: var(--apex-text-muted);
    font-size: 13px;
    font-weight: 400;
    text-decoration: none;
    transition: all 0.25s;
    min-height: 40px;
    position: relative;
    white-space: nowrap;
    overflow: hidden;
  }

  .nav-item.collapsed {
    justify-content: center;
    gap: 0;
    padding: 10px 0;
  }

  .nav-item.active {
    background: var(--apex-accent-glow);
    color: var(--apex-accent);
    font-weight: 600;
  }

  .nav-item:not(.active):hover {
    background: var(--apex-surface-hover);
    color: var(--apex-text);
  }

  .nav-icon {
    flex-shrink: 0;
    display: flex;
  }

  .nav-label {
    white-space: nowrap;
    overflow: hidden;
  }

  .collapse-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px 0;
    border-radius: 8px;
    border: none;
    cursor: pointer;
    background: transparent;
    color: var(--apex-text-dim);
    margin-top: 4px;
  }
</style>
