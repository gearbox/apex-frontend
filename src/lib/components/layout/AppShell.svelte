<script lang="ts">
  import { type Snippet } from 'svelte';
  import { isDesktop } from '$lib/utils/breakpoints';
  import { locale } from '$lib/stores/locale';
  import { ArrowDown, LoaderCircle } from 'lucide-svelte';
  import TopBar from './TopBar.svelte';
  import DesktopSidebar from './DesktopSidebar.svelte';
  import MobileBottomTabs from './MobileBottomTabs.svelte';
  import MobileMoreSheet from './MobileMoreSheet.svelte';
  import MobileProjectsSheet from './MobileProjectsSheet.svelte';
  import { pullToRefresh } from '$lib/actions/pullToRefresh';

  let { children }: { children: Snippet } = $props();

  const PULL_THRESHOLD = 72;

  let pullProgress = $state(0);
  let pullArmed = $state(false);
  let refreshing = $state(false);

  function handlePullProgress(px: number, armed: boolean) {
    pullProgress = px;
    pullArmed = armed;
  }

  function handlePullTrigger() {
    refreshing = true;
    pullArmed = true;
    pullProgress = PULL_THRESHOLD;
    window.location.reload();
  }
</script>

{#key $locale}
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
      <div
        class="mobile-content"
        use:pullToRefresh={{
          threshold: PULL_THRESHOLD,
          onProgress: handlePullProgress,
          onTrigger: handlePullTrigger,
        }}
      >
        <div
          class="pull-indicator"
          class:pull-indicator-armed={pullArmed}
          style={`transform: translate(-50%, ${pullProgress - 36}px); opacity: ${refreshing ? 1 : Math.min(pullProgress / 24, 1)}`}
        >
          {#if refreshing}
            <LoaderCircle size={18} class="animate-spin" />
          {:else}
            <ArrowDown
              size={18}
              class="pull-icon"
              style={`transform: rotate(${pullArmed ? 180 : 0}deg)`}
            />
          {/if}
        </div>
        {@render children()}
      </div>
      <MobileBottomTabs />
      <MobileProjectsSheet />
      <MobileMoreSheet />
    </div>
  {/if}
{/key}

<style>
  /* ─── Desktop ─── */
  .desktop-shell {
    display: flex;
    flex: 1;
    min-height: 0;
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
    flex: 1;
    min-height: 0;
    overflow: hidden;
    background: var(--apex-bg);
    transition: background 0.35s;
  }

  .mobile-content {
    flex: 1;
    overflow: auto;
    position: relative;
    overscroll-behavior: contain;
  }

  .pull-indicator {
    position: absolute;
    top: 0;
    left: 50%;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--apex-surface);
    border: 1px solid var(--apex-border);
    color: var(--apex-text-muted);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    pointer-events: none;
    transition:
      transform 0.2s ease,
      opacity 0.2s ease,
      color 0.15s ease,
      border-color 0.15s ease;
  }

  .pull-indicator-armed {
    color: var(--apex-accent);
    border-color: var(--apex-border-active);
  }

  .pull-indicator :global(.pull-icon) {
    transition: transform 0.15s ease;
  }
</style>
