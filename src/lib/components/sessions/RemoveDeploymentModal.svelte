<script lang="ts">
  import * as m from '$paraglide/messages';

  interface Props {
    modelName: string;
    finalLive: boolean;
    pending?: boolean;
    onConfirm: () => void;
    onClose: () => void;
  }
  let { modelName, finalLive, pending = false, onConfirm, onClose }: Props = $props();
</script>

<div
  class="overlay"
  role="presentation"
  onclick={(event) => event.target === event.currentTarget && onClose()}
>
  <dialog open class="modal" aria-label={m.deployment_remove_title()}>
    <h2>{m.deployment_remove_title()}</h2>
    <p>{m.deployment_remove_description({ model: modelName })}</p>
    {#if finalLive}<p class="warning">{m.deployment_remove_last_live_warning()}</p>{/if}
    <div class="actions">
      <button class="cancel" disabled={pending} onclick={onClose}>{m.common_cancel()}</button>
      <button class="remove" disabled={pending} onclick={onConfirm}
        >{pending ? m.common_loading() : m.deployment_remove_confirm()}</button
      >
    </div>
  </dialog>
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 220;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: rgb(0 0 0 / 0.5);
  }
  .modal {
    width: min(100%, 440px);
    padding: 20px 20px calc(20px + env(safe-area-inset-bottom));
    border: 0;
    border-radius: 16px;
    background: var(--apex-surface);
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
