<script lang="ts">
  // Placeholder balance — will be wired to TanStack Query in Phase 2
  let balance = $state(1247);
</script>

<a href="/app/billing" class="pill" aria-label="Token balance">
  <span class="pill-symbol">◈</span>{balance.toLocaleString()}
</a>

<style>
  .pill {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    background: color-mix(in srgb, var(--apex-accent-dim) 9%, transparent);
    border: 1px solid color-mix(in srgb, var(--apex-accent-dim) 20%, transparent);
    border-radius: 16px;
    font-size: 12px;
    font-weight: 600;
    color: var(--apex-accent);
    font-family: 'JetBrains Mono', monospace;
    text-decoration: none;
    cursor: pointer;
    transition: border-color 0.15s;
  }

  .pill:hover {
    border-color: color-mix(in srgb, var(--apex-accent-dim) 40%, transparent);
  }

  .pill-symbol {
    font-size: 9px;
  }
</style>
