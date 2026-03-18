<script lang="ts">
  import { X } from 'lucide-svelte';
  import { activeNotifications, dismissNotification } from '$lib/stores/notifications';
</script>

{#each $activeNotifications as notification (notification.id)}
  <div
    class="system-banner"
    class:banner-info={notification.level === 'info'}
    class:banner-warning={notification.level === 'warning'}
    class:banner-critical={notification.level === 'critical'}
    role="alert"
  >
    <div class="banner-content">
      <strong>{notification.title}</strong>
      <span>{notification.message}</span>
    </div>
    <button
      onclick={() => dismissNotification(notification.id)}
      class="banner-dismiss"
      aria-label="Dismiss notification"
    >
      <X size={14} />
    </button>
  </div>
{/each}

<style>
  .system-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    font-size: 13px;
    line-height: 1.4;
    z-index: 100;
  }

  .banner-content {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
  }

  .banner-content strong {
    flex-shrink: 0;
  }

  .banner-content span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .banner-dismiss {
    flex-shrink: 0;
    padding: 4px;
    border-radius: 4px;
    opacity: 0.7;
    cursor: pointer;
    background: transparent;
    border: none;
    color: inherit;
  }

  .banner-dismiss:hover {
    opacity: 1;
  }

  .banner-info {
    background: color-mix(in srgb, var(--apex-accent) 15%, var(--apex-surface));
    color: var(--apex-accent);
    border-bottom: 1px solid color-mix(in srgb, var(--apex-accent) 30%, transparent);
  }

  .banner-warning {
    background: color-mix(in srgb, var(--apex-warning) 15%, var(--apex-surface));
    color: var(--apex-warning);
    border-bottom: 1px solid color-mix(in srgb, var(--apex-warning) 30%, transparent);
  }

  .banner-critical {
    background: color-mix(in srgb, var(--apex-danger) 15%, var(--apex-surface));
    color: var(--apex-danger);
    border-bottom: 1px solid color-mix(in srgb, var(--apex-danger) 30%, transparent);
  }
</style>
