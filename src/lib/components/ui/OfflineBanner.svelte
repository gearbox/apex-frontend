<script lang="ts">
  import { WifiOff } from 'lucide-svelte';
  import { isOffline } from '$lib/stores/network';
  import * as m from '$paraglide/messages';
</script>

{#if $isOffline}
  <div class="offline-banner" role="status">
    <div class="banner-content">
      <WifiOff size={14} />
      <span>{m.offline_banner_message()}</span>
    </div>
  </div>
{/if}

<style>
  .offline-banner {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6px 16px;
    font-size: 12px;
    background: color-mix(in srgb, var(--apex-warning) 12%, var(--apex-surface));
    color: var(--apex-warning);
    border-bottom: 1px solid color-mix(in srgb, var(--apex-warning) 25%, transparent);
  }

  .banner-content {
    display: flex;
    align-items: center;
    gap: 6px;
  }
</style>
