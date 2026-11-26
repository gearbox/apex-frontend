<script lang="ts">
  import { Download, Share } from '@lucide/svelte';
  import {
    installStatus,
    installPlatform,
    triggerInstall,
    isInstallSheetDismissed,
    resetInstallSheetDismissal,
  } from '$lib/stores/pwaInstall';
  import { appDisplayName } from '$lib/stores/product';
  import { addToast } from '$lib/stores/toasts';
  import * as m from '$paraglide/messages';

  let installing = $state(false);
  let showIosHint = $state(false);

  async function handleClick() {
    const platform = getInstallPlatform();

    if (platform === 'ios') {
      // Toggle iOS hint text below the button
      showIosHint = !showIosHint;
      return;
    }

    // Chromium: trigger native prompt
    installing = true;
    const accepted = await triggerInstall();
    installing = false;
    if (accepted) {
      addToast({ type: 'success', message: m.pwa_install_success(), durationMs: 3000 });
    }
  }

  // Need to read platform value synchronously for the click handler
  function getInstallPlatform() {
    let platform: string = 'other';
    installPlatform.subscribe((v) => (platform = v))();
    return platform;
  }
</script>

<section class="install-row" aria-label={m.pwa_install_profile_button()}>
  {#if $installStatus === 'installed'}
    <p class="install-status" role="status">{m.pwa_install_status_installed()}</p>
  {:else if $installStatus === 'available' || $installStatus === 'ios_manual'}
    <button class="install-btn" onclick={handleClick} disabled={installing}>
      {#if $installPlatform === 'ios'}
        <Share size={16} strokeWidth={1.75} />
      {:else}
        <Download size={16} strokeWidth={1.75} />
      {/if}
      <span>{installing ? m.common_loading() : m.pwa_install_profile_button()}</span>
    </button>

    {#if showIosHint}
      <div class="ios-hint">
        <p>{m.pwa_install_ios_step1()}</p>
        <p>{m.pwa_install_ios_step2()}</p>
        <p>{m.pwa_install_ios_step3()}</p>
      </div>
    {/if}
  {:else}
    <p class="install-status">{m.pwa_install_status_not_offered({ appName: $appDisplayName })}</p>
  {/if}
  {#if $isInstallSheetDismissed && $installStatus !== 'installed'}
    <button class="install-tip-link" type="button" onclick={resetInstallSheetDismissal}
      >{m.pwa_install_show_tip_again()}</button
    >
  {/if}
</section>

<style>
  .install-row {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .install-status {
    margin: 0;
    color: var(--apex-text-muted);
    font-size: 13px;
    line-height: 1.5;
  }

  .install-tip-link {
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--apex-accent);
    font: inherit;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
  }

  .install-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 10px 14px;
    border-radius: 8px;
    border: 1px solid color-mix(in srgb, var(--apex-accent) 30%, transparent);
    background: transparent;
    color: var(--apex-accent);
    font-size: 13px;
    cursor: pointer;
    font-family: inherit;
    text-align: left;
  }

  .install-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .ios-hint {
    padding: 10px 14px;
    border-radius: 8px;
    background: var(--apex-surface-hover);
    border: 1px solid var(--apex-border);
    font-size: 12px;
    color: var(--apex-text-muted);
    line-height: 1.6;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .ios-hint p {
    margin: 0;
  }
</style>
