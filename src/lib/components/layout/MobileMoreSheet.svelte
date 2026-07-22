<script lang="ts">
  import { onDestroy } from 'svelte';
  import { moreSheetOpen, closeMoreSheet } from '$lib/stores/ui';
  import { isAdmin } from '$lib/stores/auth';
  import * as m from '$paraglide/messages';
  import { Coins, Activity, User, Shield, Server, ChevronRight } from 'lucide-svelte';
  import AppVersionBadge from '$lib/components/shared/AppVersionBadge.svelte';
  import MobileNavSheet from './MobileNavSheet.svelte';
  import { viewportDebug } from '$lib/stores/debug.svelte';
  import { addToast } from '$lib/stores/toasts';

  const DEBUG_TAP_THRESHOLD = 5;
  const DEBUG_TAP_WINDOW_MS = 2000;

  let debugTapCount = 0;
  let debugTapResetTimer: ReturnType<typeof setTimeout> | undefined;

  function handleVersionTap() {
    debugTapCount += 1;
    clearTimeout(debugTapResetTimer);

    if (debugTapCount >= DEBUG_TAP_THRESHOLD) {
      debugTapCount = 0;
      viewportDebug.toggle();
      addToast({
        type: 'info',
        message: `Viewport debug ${viewportDebug.enabled ? 'on' : 'off'}`,
      });
      return;
    }

    debugTapResetTimer = setTimeout(() => {
      debugTapCount = 0;
    }, DEBUG_TAP_WINDOW_MS);
  }

  onDestroy(() => clearTimeout(debugTapResetTimer));
</script>

{#if $moreSheetOpen}
  <MobileNavSheet id="mobile-more-sheet" label={m.nav_more()} onclose={closeMoreSheet}>
    <nav>
      <a href="/app/sessions" onclick={closeMoreSheet} class="sheet-item">
        <span class="sheet-item-icon"><Server size={20} strokeWidth={1.75} /></span>
        <span class="sheet-item-label">{m.nav_sessions()}</span>
        <span class="sheet-item-chevron"><ChevronRight size={16} /></span>
      </a>
      <a href="/app/billing" onclick={closeMoreSheet} class="sheet-item">
        <span class="sheet-item-icon"><Coins size={20} strokeWidth={1.75} /></span>
        <span class="sheet-item-label">{m.nav_billing()}</span>
        <span class="sheet-item-chevron"><ChevronRight size={16} /></span>
      </a>
      <a href="/app/jobs" onclick={closeMoreSheet} class="sheet-item">
        <span class="sheet-item-icon"><Activity size={20} strokeWidth={1.75} /></span>
        <span class="sheet-item-label">{m.nav_jobs()}</span>
        <span class="sheet-item-chevron"><ChevronRight size={16} /></span>
      </a>
      <a href="/app/profile" onclick={closeMoreSheet} class="sheet-item">
        <span class="sheet-item-icon"><User size={20} strokeWidth={1.75} /></span>
        <span class="sheet-item-label">{m.nav_profile()}</span>
        <span class="sheet-item-chevron"><ChevronRight size={16} /></span>
      </a>

      {#if $isAdmin}
        <div class="sheet-admin-divider"></div>
        <a href="/app/admin" onclick={closeMoreSheet} class="sheet-item">
          <span class="sheet-item-icon">
            <Shield size={20} strokeWidth={1.75} />
          </span>
          <span class="sheet-item-label">{m.nav_admin_panel()}</span>
          <span class="sheet-item-chevron"><ChevronRight size={16} /></span>
        </a>
      {/if}
    </nav>

    <div class="sheet-cancel-wrap">
      <button onclick={closeMoreSheet} class="sheet-cancel">{m.common_cancel()}</button>
    </div>

    <button
      type="button"
      class="version-tap-target"
      onclick={handleVersionTap}
      aria-label="App version"
    >
      <AppVersionBadge />
    </button>
  </MobileNavSheet>
{/if}

<style>
  .sheet-item {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    padding: 14px 24px;
    background: transparent;
    color: var(--apex-text);
    font-size: 15px;
    font-weight: 500;
    text-decoration: none;
    text-align: left;
  }
  .sheet-item-icon {
    color: var(--apex-text-muted);
    display: flex;
    flex-shrink: 0;
  }
  .sheet-item-label {
    flex: 1;
  }
  .sheet-item-chevron {
    color: var(--apex-text-dim);
    display: flex;
  }

  .sheet-admin-divider {
    border-top: 1px solid var(--apex-border);
    margin: 4px 24px;
  }

  .sheet-cancel-wrap {
    padding: 8px 24px 0;
  }
  .sheet-cancel {
    width: 100%;
    padding: 12px 0;
    border-radius: 12px;
    border: 1px solid var(--apex-border);
    background: transparent;
    color: var(--apex-text-muted);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
  }

  .version-tap-target {
    display: flex;
    justify-content: center;
    width: 100%;
    padding: 10px 0 0;
    background: transparent;
    border: none;
    cursor: default;
  }
  .version-tap-target :global(.version-badge) {
    justify-content: center;
    background: transparent;
    border-bottom: none;
    padding: 0;
  }
</style>
