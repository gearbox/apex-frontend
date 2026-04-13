<script lang="ts">
  import { Download } from 'lucide-svelte';
  import { canInstall, triggerInstall } from '$lib/stores/pwaInstall';
  import { addToast } from '$lib/stores/toasts';
  import * as m from '$paraglide/messages';

  let installing = $state(false);

  async function handleInstall() {
    installing = true;
    const accepted = await triggerInstall();
    installing = false;
    if (accepted) {
      addToast({ type: 'success', message: 'App installed!', durationMs: 3000 });
    }
  }
</script>

{#if $canInstall}
  <button class="install-btn" onclick={handleInstall} disabled={installing}>
    <Download size={16} strokeWidth={1.75} />
    <span>{installing ? m.common_loading() : m.pwa_install_profile_button()}</span>
  </button>
{/if}

<style>
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
</style>
