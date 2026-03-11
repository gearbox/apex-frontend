<script lang="ts">
  import { themePrefs, setMode } from '$lib/stores/theme';
  import type { ThemeMode } from '$lib/themes';
  import { Sun, Moon, Monitor } from 'lucide-svelte';

  const modes: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: 'Light', icon: Sun },
    { value: 'dark', label: 'Dark', icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ];
</script>

<div class="section">
  <p class="label">Mode</p>
  <div class="mode-group">
    {#each modes as m, i (m.value)}
      {@const Icon = m.icon}
      {@const active = $themePrefs.mode === m.value}
      <button
        onclick={() => setMode(m.value)}
        class="mode-btn"
        class:active
        class:last={i === modes.length - 1}
      >
        <Icon size={14} />
        <span>{m.label}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .section { margin-bottom: 0; }
  .label {
    font-size: 12px;
    color: var(--apex-text-dim);
    font-weight: 600;
    margin: 0 0 8px;
  }

  .mode-group {
    display: inline-flex;
    border-radius: 10px;
    border: 1px solid var(--apex-border);
    overflow: hidden;
    background: var(--apex-surface);
  }

  .mode-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 8px 14px;
    border: none;
    cursor: pointer;
    background: transparent;
    color: var(--apex-text-muted);
    font-size: 12px;
    font-weight: 400;
    font-family: inherit;
    border-right: 1px solid var(--apex-border);
    transition: all 0.2s;
  }
  .mode-btn.last { border-right: none; }
  .mode-btn.active {
    background: var(--apex-accent-glow);
    color: var(--apex-accent);
    font-weight: 700;
  }
</style>
