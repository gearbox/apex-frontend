<script lang="ts">
  import { type Snippet } from 'svelte';
  import { isDesktop } from '$lib/utils/breakpoints';
  import TopBar from './TopBar.svelte';
  import DesktopSidebar from './DesktopSidebar.svelte';
  import MobileBottomTabs from './MobileBottomTabs.svelte';
  import MobileMoreSheet from './MobileMoreSheet.svelte';

  let { children }: { children: Snippet } = $props();
</script>

{#if $isDesktop}
  <!-- Desktop: sidebar + (topbar + content) in a row -->
  <div class="desktop-shell">
    <DesktopSidebar />
    <main class="desktop-main">
      <TopBar />
      <div class="desktop-content">
        {@render children()}
      </div>
    </main>
  </div>
{:else}
  <!-- Mobile: topbar + content + bottom tabs -->
  <div class="mobile-shell">
    <TopBar />
    <div class="mobile-content">
      {@render children()}
    </div>
    <MobileBottomTabs />
    <MobileMoreSheet />
  </div>
{/if}

<style>
  /* ─── Desktop ─── */
  .desktop-shell {
    display: flex;
    height: 100dvh;
    overflow: hidden;
    background: var(--apex-bg);
    transition: background 0.35s;
  }

  .desktop-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .desktop-content {
    flex: 1;
    overflow: auto;
    padding: 24px;
  }

  /* ─── Mobile ─── */
  .mobile-shell {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    overflow: hidden;
    background: var(--apex-bg);
    transition: background 0.35s;
  }

  .mobile-content {
    flex: 1;
    overflow: auto;
  }
</style>
