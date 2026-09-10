<script lang="ts">
  import { onMount } from 'svelte';
  import { createDialogController } from '$lib/components/shared/dialogController.svelte';
  import * as m from '$paraglide/messages';

  interface Props {
    modelName: string;
    finalLive: boolean;
    pending?: boolean;
    onConfirm: () => void;
    onClose: () => void;
  }
  let { modelName, finalLive, pending = false, onConfirm, onClose }: Props = $props();

  let cancelButton = $state<HTMLButtonElement>();

  const dialogController = createDialogController({
    canClose: () => !pending,
    initialFocus: () => cancelButton,
    onClose: () => onClose(),
  });

  onMount(() => dialogController.open());
</script>

<dialog
  bind:this={dialogController.dialog}
  class="modal"
  aria-labelledby="remove-deployment-title"
  aria-describedby="remove-deployment-description"
  oncancel={dialogController.handleCancel}
  onclick={dialogController.handleBackdropClick}
>
  <h2 id="remove-deployment-title">{m.deployment_remove_title()}</h2>
  <p id="remove-deployment-description">{m.deployment_remove_description({ model: modelName })}</p>
  {#if finalLive}<p class="warning">{m.deployment_remove_last_live_warning()}</p>{/if}
  <div class="actions">
    <button
      bind:this={cancelButton}
      class="cancel"
      disabled={pending}
      onclick={dialogController.requestClose}>{m.common_cancel()}</button
    >
    <button class="remove" disabled={pending} onclick={onConfirm}
      >{pending
        ? m.common_loading()
        : finalLive
          ? m.deployment_remove_last_confirm()
          : m.deployment_remove_confirm()}</button
    >
  </div>
</dialog>

<style>
  .modal {
    width: min(100%, 440px);
    max-width: calc(100% - 32px);
    margin: auto;
    padding: 20px 20px calc(20px + env(safe-area-inset-bottom));
    border: 0;
    border-radius: 16px;
    background: var(--apex-surface);
  }
  .modal::backdrop {
    background: rgb(0 0 0 / 0.5);
  }
  h2 {
    margin: 0;
    color: var(--apex-text);
    font-size: 17px;
  }
  p {
    color: var(--apex-text-muted);
    font-size: 13px;
    overflow-wrap: anywhere;
  }
  .warning {
    color: var(--apex-danger);
    font-weight: 600;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: end;
    gap: 8px;
    margin-top: 18px;
  }
  button {
    padding: 9px 14px;
    border-radius: 8px;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .cancel {
    border: 1px solid var(--apex-border);
    background: transparent;
    color: var(--apex-text);
  }
  .remove {
    border: 0;
    background: var(--apex-danger);
    color: white;
  }
  button:disabled {
    opacity: 0.55;
    cursor: wait;
  }
</style>
