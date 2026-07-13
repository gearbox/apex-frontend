<script lang="ts">
  import { Bell, X } from 'lucide-svelte';
  import { pushNudge } from '$lib/stores/pushNudge.svelte';
  import * as m from '$paraglide/messages';
</script>

{#if pushNudge.visible}
  <div class="nudge-wrap">
    <div class="nudge-card" role="status">
      <div class="nudge-icon">
        <Bell size={16} strokeWidth={2} />
      </div>
      <p class="nudge-text">{m.push_nudge_message()}</p>
      <div class="nudge-actions">
        <button class="btn-enable" onclick={() => pushNudge.enable()}>
          {m.push_nudge_enable()}
        </button>
        <button
          class="btn-dismiss"
          onclick={() => pushNudge.dismiss()}
          aria-label={m.common_close()}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .nudge-wrap {
    position: fixed;
    bottom: 80px;
    left: 0;
    right: 0;
    z-index: 50;
    display: flex;
    justify-content: center;
    padding: 0 16px;
    pointer-events: none;
  }

  @media (min-width: 768px) {
    .nudge-wrap {
      bottom: 24px;
      justify-content: flex-end;
      padding-right: 24px;
    }
  }

  .nudge-card {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    max-width: 380px;
    padding: 12px 12px 12px 14px;
    border-radius: 12px;
    border: 1px solid var(--apex-border);
    background: color-mix(in srgb, var(--apex-surface) 92%, transparent);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
  }

  .nudge-icon {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--apex-accent-glow);
    color: var(--apex-accent);
  }

  .nudge-text {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-size: 13px;
    color: var(--apex-text);
    line-height: 1.4;
  }

  .nudge-actions {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .btn-enable {
    padding: 6px 12px;
    border-radius: 8px;
    border: none;
    background: var(--apex-accent);
    color: white;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    white-space: nowrap;
  }

  .btn-dismiss {
    padding: 6px;
    border-radius: 8px;
    border: none;
    background: transparent;
    color: var(--apex-text-muted);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .btn-dismiss:hover {
    color: var(--apex-text);
  }
</style>
