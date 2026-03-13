<script lang="ts">
  import type { JobListFilters } from '$lib/queries/jobs';
  import type { components } from '$lib/api/types';

  type GenerationType = components['schemas']['GenerationType'];

  let { filters, onChange }: {
    filters: JobListFilters;
    onChange: (f: JobListFilters) => void;
  } = $props();

  const statusOptions = [
    { label: 'All',       value: null },
    { label: 'Running',   value: 'running' },
    { label: 'Completed', value: 'completed' },
    { label: 'Failed',    value: 'failed' },
  ] as const;

  const typeOptions: { label: string; value: GenerationType[] | null }[] = [
    { label: 'All types', value: null },
    { label: 'Images',    value: ['t2i', 'i2i'] },
    { label: 'Video',     value: ['t2v', 'i2v', 'v2v'] },
  ];

  function isTypeActive(optValue: GenerationType[] | null): boolean {
    const current = filters.generation_type;
    if (optValue === null) return current == null || (Array.isArray(current) && current.length === 0);
    if (!Array.isArray(current)) return false;
    return current.length === optValue.length && optValue.every((t) => current.includes(t));
  }

  function chipClass(active: boolean) {
    return active
      ? 'bg-accent text-bg font-medium'
      : 'bg-surface text-text-muted hover:bg-surface-hover';
  }
</script>

<div class="flex gap-2 overflow-x-auto pb-0.5 scrollbar-none">
  {#each statusOptions as opt (opt.label)}
    <button
      class="shrink-0 cursor-pointer rounded-full px-3 py-1 text-sm transition-colors {chipClass(filters.status === opt.value)}"
      onclick={() => onChange({ ...filters, status: opt.value, offset: 0 })}
    >
      {opt.label}
    </button>
  {/each}

  <div class="w-px shrink-0 self-stretch bg-border"></div>

  {#each typeOptions as opt (opt.label)}
    <button
      class="shrink-0 cursor-pointer rounded-full px-3 py-1 text-sm transition-colors {chipClass(isTypeActive(opt.value))}"
      onclick={() => onChange({ ...filters, generation_type: opt.value, offset: 0 })}
    >
      {opt.label}
    </button>
  {/each}
</div>
