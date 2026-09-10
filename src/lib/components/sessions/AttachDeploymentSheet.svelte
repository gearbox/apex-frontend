<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { AttachModelOption } from '$lib/utils/deploymentEligibility';
  import type { ModelType } from '$lib/api/sessions';
  import * as m from '$paraglide/messages';

  interface Props {
    models: AttachModelOption[];
    pending?: boolean;
    onAttach: (model: ModelType) => void;
    onClose: () => void;
  }
  let { models, pending = false, onAttach, onClose }: Props = $props();

  let dialog = $state<HTMLDialogElement>();
  let closeButton = $state<HTMLButtonElement>();
  let previousFocus: HTMLElement | null = null;

  function requestClose(): void {
    if (!pending) onClose();
  }

  function handleCancel(event: Event): void {
    event.preventDefault();
    requestClose();
  }

  function handleBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) requestClose();
  }

  onMount(() => {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (dialog?.showModal) dialog.showModal();
    else if (dialog) dialog.open = true;
    void tick().then(() => closeButton?.focus({ preventScroll: true }));

    return () => {
      if (dialog?.open) dialog.close?.();
      previousFocus?.focus({ preventScroll: true });
    };
  });
</script>

<dialog
  bind:this={dialog}
  class="sheet"
  aria-labelledby="attach-deployment-title"
  oncancel={handleCancel}
  onclick={handleBackdropClick}
>
  <div class="heading">
    <h2 id="attach-deployment-title">{m.session_attach_title()}</h2>
    <button
      bind:this={closeButton}
      aria-label={m.common_close()}
      disabled={pending}
      onclick={requestClose}>×</button
    >
  </div>
  {#if models.length === 0}
    <p>{m.session_attach_empty()}</p>
  {:else}
    <div class="models">
      {#each models as model (model.model)}
        <button disabled={pending} onclick={() => onAttach(model.model)}>
          <span>{model.name}</span><small>{model.model}</small>
        </button>
      {/each}
    </div>
  {/if}
</dialog>

<style>
  .sheet {
    width: min(100%, 560px);
    max-width: calc(100% - 32px);
    max-height: min(75dvh, 640px);
    overflow: auto;
    margin: auto auto 16px;
    padding: 18px 18px calc(18px + env(safe-area-inset-bottom));
    border: 0;
    border-radius: 16px;
    background: var(--apex-surface);
  }
  .sheet::backdrop {
    background: rgb(0 0 0 / 0.5);
  }
  .heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }
  h2 {
    font-size: 17px;
    margin: 0;
    color: var(--apex-text);
  }
  .heading button {
    font-size: 24px;
    border: 0;
    color: var(--apex-text-muted);
    background: transparent;
    cursor: pointer;
  }
  .heading button:disabled {
    opacity: 0.55;
    cursor: wait;
  }
  p {
    font-size: 13px;
    color: var(--apex-text-muted);
  }
  .models {
    display: grid;
    gap: 8px;
    margin-top: 14px;
  }
  .models button {
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: start;
    gap: 3px;
    padding: 12px;
    border: 1px solid var(--apex-border);
    border-radius: 10px;
    background: var(--apex-bg);
    color: var(--apex-text);
    text-align: left;
    cursor: pointer;
  }
  .models small {
    color: var(--apex-text-muted);
    overflow-wrap: anywhere;
  }
  .models button:disabled {
    opacity: 0.55;
    cursor: wait;
  }
</style>
