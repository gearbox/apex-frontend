<script lang="ts">
  import { Download } from 'lucide-svelte';
  import { shouldShowInstallSheet, triggerInstall, dismissInstallSheet } from '$lib/stores/pwaInstall';
  import { productInfo } from '$lib/stores/product';
  import * as m from '$paraglide/messages';

  let installing = $state(false);

  async function handleInstall() {
    installing = true;
    const accepted = await triggerInstall();
    installing = false;
    if (accepted) {
      dismissInstallSheet();
    }
  }

  function handleDismiss() {
    dismissInstallSheet();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') handleDismiss();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if $shouldShowInstallSheet}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="sheet-backdrop" onclick={handleDismiss} role="presentation">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="sheet-panel"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-label="Install app"
      tabindex="-1"
    >
      <div class="sheet-handle"></div>

      <div class="sheet-body">
        <div class="sheet-icon">
          <Download size={28} strokeWidth={1.5} />
        </div>
        <h2 class="sheet-title">
          {m.pwa_install_sheet_title({ appName: $productInfo?.display_name ?? 'Apex' })}
        </h2>
        <p class="sheet-desc">{m.pwa_install_sheet_description()}</p>

        <div class="sheet-actions">
          <button class="btn-install" onclick={handleInstall} disabled={installing}>
            {#if installing}
              <span class="spinner"></span>
            {:else}
              {m.pwa_install_sheet_button()}
            {/if}
          </button>
          <button class="btn-dismiss" onclick={handleDismiss}>
            {m.pwa_install_sheet_dismiss()}
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  @keyframes slideUp {
    from { transform: translateY(100%); }
    to { transform: translateY(0); }
  }

  .sheet-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
    z-index: 200;
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }

  .sheet-panel {
    background: var(--apex-surface);
    border-radius: 20px 20px 0 0;
    width: 100%;
    max-width: 480px;
    padding: 12px 0 max(24px, env(safe-area-inset-bottom));
    animation: slideUp 0.25s ease-out;
  }

  .sheet-handle {
    width: 36px;
    height: 4px;
    border-radius: 2px;
    background: var(--apex-border);
    margin: 0 auto 16px;
  }

  .sheet-body {
    padding: 8px 24px 0;
    text-align: center;
  }

  .sheet-icon {
    width: 56px;
    height: 56px;
    border-radius: 16px;
    background: var(--apex-accent-glow);
    color: var(--apex-accent);
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 16px;
  }

  .sheet-title {
    font-size: 18px;
    font-weight: 700;
    color: var(--apex-text);
    margin: 0 0 8px;
  }

  .sheet-desc {
    font-size: 14px;
    color: var(--apex-text-muted);
    margin: 0 0 24px;
    line-height: 1.5;
  }

  .sheet-actions {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .btn-install {
    width: 100%;
    padding: 14px;
    border-radius: 12px;
    background: var(--apex-accent);
    color: white;
    font-size: 15px;
    font-weight: 600;
    border: none;
    cursor: pointer;
    font-family: inherit;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .btn-install:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .btn-dismiss {
    width: 100%;
    padding: 12px;
    background: transparent;
    border: none;
    color: var(--apex-text-muted);
    font-size: 14px;
    cursor: pointer;
    font-family: inherit;
  }

  .spinner {
    display: inline-block;
    width: 20px;
    height: 20px;
    border: 2px solid white;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
