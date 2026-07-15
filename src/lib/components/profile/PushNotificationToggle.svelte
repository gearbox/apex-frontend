<script lang="ts">
  import ToggleSwitch from '$lib/components/shared/ToggleSwitch.svelte';
  import { pushSubscription } from '$lib/stores/pushSubscription.svelte';
  import { productInfo } from '$lib/stores/product';
  import * as m from '$paraglide/messages';

  async function handleToggle(checked: boolean) {
    if (checked) {
      // `enable()` calls Notification.requestPermission() before its first await.
      await pushSubscription.enable();
    } else {
      await pushSubscription.disable();
    }
  }
</script>

{#if pushSubscription.support === 'needs-install'}
  <div class="push-row muted">
    <span class="push-label">{m.push_settings_label()}</span>
    <p class="push-hint">{m.push_needs_install_hint()}</p>
  </div>
{:else if pushSubscription.support === 'supported'}
  <div class="push-row">
    <div class="push-row-main">
      <span class="push-label">{m.push_settings_label()}</span>
      {#if pushSubscription.permission === 'denied'}
        <p class="push-hint">
          {m.push_denied_hint({ appName: $productInfo?.display_name ?? 'Vex.pics' })}
        </p>
      {:else if pushSubscription.lastResult === 'permission-dismissed'}
        <p class="push-hint">{m.push_permission_dismissed_hint()}</p>
      {:else if pushSubscription.lastResult && pushSubscription.lastResult !== 'enabled'}
        <p class="push-hint">{m.push_retry_hint()}</p>
      {/if}
    </div>
    <ToggleSwitch
      checked={pushSubscription.subscribed}
      disabled={pushSubscription.permission === 'denied'}
      loading={pushSubscription.loading}
      ontoggle={handleToggle}
    />
  </div>
{/if}

<style>
  .push-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 14px;
    border-radius: 8px;
    border: 1px solid var(--apex-border);
  }

  .push-row.muted {
    display: block;
  }

  .push-row-main {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .push-label {
    font-size: 13px;
    color: var(--apex-text);
  }

  .push-hint {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--apex-text-muted);
    line-height: 1.4;
  }
</style>
