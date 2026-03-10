<script lang="ts">
  import { themePrefs, setTheme } from '$lib/stores/theme';
  import { themes, type ThemeName } from '$lib/themes';

  const themeOpts: { id: ThemeName; label: string; desc: string }[] = [
    { id: 'slate', label: 'Slate', desc: 'Warm earth, amber' },
    { id: 'frost', label: 'Frost', desc: 'Cool blue, indigo' },
  ];
</script>

<div class="section">
  <p class="label">Theme</p>
  <div class="theme-grid">
    {#each themeOpts as t}
      {@const active = $themePrefs.theme === t.id}
      {@const def = themes[t.id]}
      <button
        onclick={() => setTheme(t.id)}
        class="theme-card"
        class:active
      >
        <div class="swatches">
          <span class="swatch" style="background: {def.light.bg}"></span>
          <span class="swatch" style="background: {def.light.accent}"></span>
          <span class="swatch" style="background: {def.dark.bg}"></span>
          <span class="swatch" style="background: {def.dark.accent}"></span>
        </div>
        <p class="theme-name" class:active>{t.label}</p>
        <p class="theme-desc">{t.desc}</p>
      </button>
    {/each}
  </div>
</div>

<style>
  .section { margin-bottom: 18px; }
  .label {
    font-size: 12px;
    color: var(--apex-text-dim);
    font-weight: 600;
    margin: 0 0 8px;
  }

  .theme-grid { display: flex; gap: 8px; }

  .theme-card {
    flex: 1;
    padding: 12px;
    border-radius: 10px;
    cursor: pointer;
    text-align: left;
    border: 2px solid var(--apex-border);
    background: var(--apex-surface);
    transition: all 0.2s;
    font-family: inherit;
  }
  .theme-card.active {
    border-color: var(--apex-accent);
    background: var(--apex-accent-glow);
  }

  .swatches {
    display: flex;
    gap: 3px;
    margin-bottom: 8px;
  }
  .swatch {
    width: 16px;
    height: 16px;
    border-radius: 5px;
    border: 1px solid var(--apex-border);
  }

  .theme-name {
    font-size: 13px;
    font-weight: 700;
    color: var(--apex-text);
    margin: 0 0 1px;
  }
  .theme-name.active { color: var(--apex-accent); }

  .theme-desc {
    font-size: 10px;
    color: var(--apex-text-dim);
    margin: 0;
  }
</style>
