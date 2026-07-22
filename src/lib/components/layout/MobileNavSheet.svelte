<script lang="ts">
  import { onMount, tick, type Snippet } from 'svelte';

  let {
    id,
    label,
    onclose,
    children,
    tall = false,
  }: {
    id: string;
    label: string;
    onclose: () => void;
    children: Snippet;
    tall?: boolean;
  } = $props();

  let panel = $state<HTMLDivElement>();
  let previousFocus: HTMLElement | null = null;
  let previousBodyOverflow = '';

  onMount(() => {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    void tick().then(() => panel?.focus());

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      previousFocus?.focus();
    };
  });

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') onclose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="sheet-backdrop" onclick={onclose} role="presentation">
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    bind:this={panel}
    {id}
    class="sheet-panel chrome-no-select"
    class:tall
    onclick={(event) => event.stopPropagation()}
    role="dialog"
    aria-modal="true"
    aria-label={label}
    tabindex="-1"
  >
    <div class="sheet-handle" aria-hidden="true"></div>
    {@render children()}
  </div>
</div>

<style>
  @keyframes slideUp {
    from {
      transform: translateY(100%);
    }
    to {
      transform: translateY(0);
    }
  }

  .sheet-backdrop {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    -webkit-backdrop-filter: blur(4px);
  }

  .sheet-panel {
    display: flex;
    width: 100%;
    max-width: 480px;
    max-height: 85dvh;
    flex-direction: column;
    overflow: hidden;
    border-radius: 20px 20px 0 0;
    background: var(--apex-surface);
    padding: 12px 0 max(16px, env(safe-area-inset-bottom));
    animation: slideUp 0.25s ease-out;
    outline: none;
  }

  .sheet-panel.tall {
    height: min(78dvh, 42rem);
  }

  .sheet-handle {
    width: 36px;
    height: 4px;
    flex: 0 0 auto;
    margin: 0 auto 16px;
    border-radius: 2px;
    background: var(--apex-border);
  }
</style>
