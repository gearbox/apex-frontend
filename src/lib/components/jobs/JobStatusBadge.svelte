<script lang="ts">
  import type { components } from '$lib/api/types';

  type JobStatus = components['schemas']['JobStatus'];

  let { status }: { status: JobStatus } = $props();

  const config: Record<JobStatus, { classes: string; label: string }> = {
    pending:   { classes: 'text-text-muted bg-surface',         label: 'Pending' },
    queued:    { classes: 'text-text-muted bg-surface',         label: 'Queued' },
    running:   { classes: 'text-accent bg-accent/10 animate-pulse', label: 'Running' },
    completed: { classes: 'text-success bg-success/10',         label: 'Completed' },
    failed:    { classes: 'text-danger bg-danger/10',           label: 'Failed' },
    cancelled: { classes: 'text-text-dim bg-surface',           label: 'Cancelled' },
    moderated: { classes: 'text-warning bg-warning/10',         label: 'Moderated' },
  };

  const { classes, label } = $derived(config[status] ?? config.pending);
</script>

<span class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium {classes}">
  {label}
</span>
