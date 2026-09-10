<script lang="ts">
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
</script>

<div
  class="overlay"
  role="presentation"
  onclick={(event) => event.target === event.currentTarget && onClose()}
>
  <dialog open class="sheet" aria-label={m.session_attach_title()}>
    <div class="heading">
      <h2>{m.session_attach_title()}</h2>
      <button aria-label={m.common_close()} onclick={onClose}>×</button>
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
</div>

<style>
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 210;
    display: flex;
    align-items: end;
    background: rgb(0 0 0 / 0.5);
    padding: 16px;
  }
  .sheet {
    width: min(100%, 560px);
    max-height: min(75dvh, 640px);
    overflow: auto;
    margin: auto auto 0;
    padding: 18px 18px calc(18px + env(safe-area-inset-bottom));
    border: 0;
    border-radius: 16px;
    background: var(--apex-surface);
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
