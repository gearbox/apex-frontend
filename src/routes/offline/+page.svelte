<script lang="ts">
  import { WifiOff, RefreshCw } from 'lucide-svelte';
</script>

<svelte:head>
  <title>Offline</title>
</svelte:head>

<div class="offline-page">
  <div class="offline-card">
    <div class="offline-icon">
      <WifiOff size={48} strokeWidth={1.25} />
    </div>
    <h1 class="offline-title">You're Offline</h1>
    <p class="offline-desc">Check your internet connection and try again.</p>
    <button class="retry-btn" onclick={() => window.location.reload()}>
      <RefreshCw size={16} strokeWidth={2} />
      <span>Retry</span>
    </button>
  </div>
</div>

<style>
  .offline-page {
    min-height: 100dvh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    background: var(--apex-bg, #110f0b);
  }

  .offline-card {
    text-align: center;
    max-width: 360px;
  }

  .offline-icon {
    color: var(--apex-text-dim, #665e4e);
    margin-bottom: 24px;
  }

  .offline-title {
    font-size: 24px;
    font-weight: 700;
    color: var(--apex-text, #ede8dc);
    margin: 0 0 8px;
  }

  .offline-desc {
    font-size: 15px;
    color: var(--apex-text-muted, #9a9080);
    margin: 0 0 32px;
    line-height: 1.5;
  }

  .retry-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 12px 24px;
    border-radius: 10px;
    border: 1px solid var(--apex-border, #2e2a1e);
    background: var(--apex-surface, #1a1710);
    color: var(--apex-text, #ede8dc);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
  }
</style>
