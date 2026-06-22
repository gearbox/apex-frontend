<script lang="ts">
  import { ChevronLeft, ChevronRight } from 'lucide-svelte';

  interface Props {
    hasPrev: boolean;
    hasNext: boolean;
    pageNumber: number;
    loading?: boolean;
    onprev: () => void;
    onnext: () => void;
  }

  let { hasPrev, hasNext, pageNumber, loading = false, onprev, onnext }: Props = $props();
</script>

<nav class="cursor-pager" aria-label="Pagination">
  <button
    class="pager-btn"
    onclick={onprev}
    disabled={!hasPrev || loading}
    aria-label="Previous page"
  >
    <ChevronLeft size={16} /> Prev
  </button>
  <span class="pager-page">Page {pageNumber}</span>
  <button class="pager-btn" onclick={onnext} disabled={!hasNext || loading} aria-label="Next page">
    Next <ChevronRight size={16} />
  </button>
</nav>

<style>
  .cursor-pager {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 0;
    gap: 12px;
    flex-wrap: wrap;
  }

  .pager-page {
    font-size: 13px;
    color: var(--apex-text-muted);
  }

  .pager-btn {
    display: flex;
    align-items: center;
    gap: 4px;
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

  .pager-btn:hover:not(:disabled) {
    background: var(--apex-surface-hover);
    color: var(--apex-text);
  }

  .pager-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
