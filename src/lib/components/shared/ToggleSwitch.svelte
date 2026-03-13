<script lang="ts">
  interface Props {
    checked: boolean;
    disabled?: boolean;
    loading?: boolean;
    ontoggle: (checked: boolean) => void;
  }

  let { checked, disabled = false, loading = false, ontoggle }: Props = $props();

  function handleClick() {
    if (!disabled && !loading) {
      ontoggle(!checked);
    }
  }
</script>

<button
  type="button"
  role="switch"
  aria-checked={checked}
  class="toggle"
  class:checked
  class:loading
  disabled={disabled || loading}
  onclick={handleClick}
>
  <span class="toggle-thumb">
    {#if loading}
      <span class="spinner"></span>
    {/if}
  </span>
</button>

<style>
  .toggle {
    position: relative;
    display: inline-flex;
    align-items: center;
    width: 44px;
    height: 24px;
    border-radius: 12px;
    background: var(--apex-border);
    border: none;
    cursor: pointer;
    padding: 0;
    transition: background 0.2s;
    flex-shrink: 0;
  }

  .toggle.checked {
    background: var(--apex-success);
  }

  .toggle:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .toggle-thumb {
    position: absolute;
    left: 2px;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: white;
    transition: transform 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }

  .checked .toggle-thumb {
    transform: translateX(20px);
  }

  .spinner {
    width: 10px;
    height: 10px;
    border: 2px solid rgba(0, 0, 0, 0.2);
    border-top-color: rgba(0, 0, 0, 0.6);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
