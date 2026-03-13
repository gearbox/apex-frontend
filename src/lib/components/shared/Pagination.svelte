<script lang="ts">
  interface Props {
    total: number;
    limit: number;
    offset: number;
    onpagechange: (newOffset: number) => void;
  }

  let { total, limit, offset, onpagechange }: Props = $props();

  const start = $derived(Math.min(offset + 1, total));
  const end = $derived(Math.min(offset + limit, total));
  const hasPrev = $derived(offset > 0);
  const hasNext = $derived(offset + limit < total);
</script>

<div class="pagination">
  <span class="pagination-info">
    {#if total === 0}
      No results
    {:else}
      Showing {start}–{end} of {total}
    {/if}
  </span>
  <div class="pagination-buttons">
    <button
      class="page-btn"
      disabled={!hasPrev}
      onclick={() => onpagechange(Math.max(0, offset - limit))}
    >
      Previous
    </button>
    <button
      class="page-btn"
      disabled={!hasNext}
      onclick={() => onpagechange(offset + limit)}
    >
      Next
    </button>
  </div>
</div>

<style>
  .pagination {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 0;
    gap: 12px;
    flex-wrap: wrap;
  }

  .pagination-info {
    font-size: 13px;
    color: var(--apex-text-muted);
  }

  .pagination-buttons {
    display: flex;
    gap: 8px;
  }

  .page-btn {
    padding: 6px 14px;
    border-radius: 8px;
    border: 1px solid var(--apex-border);
    background: transparent;
    color: var(--apex-text-muted);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;
    transition: all 0.15s;
  }

  .page-btn:hover:not(:disabled) {
    background: var(--apex-surface-hover);
    color: var(--apex-text);
  }

  .page-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
