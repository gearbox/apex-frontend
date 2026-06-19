<script lang="ts">
  import { APP_VERSION_LABEL } from '$lib/utils/appVersion';
</script>

<div class="version-badge" data-testid="app-version">
  <span class="version-text">{APP_VERSION_LABEL}</span>
</div>

<style>
  .version-badge {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    padding: 3px 16px;
    background: var(--apex-surface);
    border-bottom: 1px solid var(--apex-border);
    flex-shrink: 0;
  }

  .version-text {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    line-height: 1.4;
    letter-spacing: 0.02em;
    color: var(--apex-text-dim);
    user-select: text;
  }
</style>
