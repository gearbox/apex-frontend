<script lang="ts">
  interface Props {
    status: string;
    colorMap?: Record<string, string>;
  }

  const DEFAULT_COLOR_MAP: Record<string, string> = {
    // Active states
    active: 'success',
    enabled: 'success',
    completed: 'success',
    // Warning states
    pending: 'warning',
    // Danger states
    inactive: 'danger',
    disabled: 'danger',
    failed: 'danger',
    // Neutral states
    refunded: 'muted',
    cancelled: 'muted',
    // Role badges
    superadmin: 'danger',
    admin: 'accent',
    user: 'neutral',
    system: 'neutral',
    // Tiers
    free: 'neutral',
    basic: 'info',
    pro: 'accent',
    enterprise: 'success',
  };

  let { status, colorMap }: Props = $props();

  const map = $derived({ ...DEFAULT_COLOR_MAP, ...(colorMap ?? {}) });
  const colorKey = $derived(map[status?.toLowerCase()] ?? 'neutral');
</script>

<span class="badge badge-{colorKey}">{status}</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 10px;
    border-radius: 99px;
    font-size: 11px;
    font-weight: 600;
    text-transform: capitalize;
    letter-spacing: 0.02em;
    white-space: nowrap;
  }

  .badge-success {
    background: color-mix(in srgb, var(--apex-success) 15%, transparent);
    color: var(--apex-success);
  }

  .badge-warning {
    background: color-mix(in srgb, var(--apex-warning) 15%, transparent);
    color: var(--apex-warning);
  }

  .badge-danger {
    background: color-mix(in srgb, var(--apex-danger) 15%, transparent);
    color: var(--apex-danger);
  }

  .badge-accent {
    background: var(--apex-accent-glow);
    color: var(--apex-accent);
  }

  .badge-info {
    background: color-mix(in srgb, var(--apex-text-muted) 15%, transparent);
    color: var(--apex-text-muted);
  }

  .badge-muted {
    background: color-mix(in srgb, var(--apex-text-dim) 12%, transparent);
    color: var(--apex-text-dim);
  }

  .badge-neutral {
    background: var(--apex-surface-hover);
    color: var(--apex-text-muted);
  }
</style>
