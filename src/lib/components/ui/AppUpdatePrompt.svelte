<script lang="ts">
  import { applyPwaUpdate, dismissPwaUpdatePrompt, pwaUpdateStatus } from '$lib/services/pwaUpdate';
  import { appIsDirty } from '$lib/services/appDirty';
  import * as m from '$paraglide/messages';

  let applying = $state(false);
  let canShow = $derived(
    !$pwaUpdateStatus.dismissed &&
      Boolean($pwaUpdateStatus.targetBuildSha) &&
      ['downloading', 'ready-to-activate', 'activating', 'reload-required'].includes(
        $pwaUpdateStatus.state,
      ),
  );
  let canApply = $derived(
    ['ready-to-activate', 'reload-required'].includes($pwaUpdateStatus.state),
  );
  let lifecyclePending = $derived(!canApply);

  async function updateNow() {
    applying = true;
    try {
      await applyPwaUpdate();
    } finally {
      applying = false;
    }
  }
</script>

{#if canShow}
  <section
    class="update-prompt"
    aria-live="polite"
    aria-atomic="true"
    data-testid="app-update-prompt"
  >
    <div class="copy">
      <p class="title">
        {lifecyclePending
          ? m.pwa_update_applying()
          : $appIsDirty
            ? m.pwa_update_dirty_title()
            : m.pwa_update_ready_title()}
      </p>
      {#if $appIsDirty && canApply}
        <p class="description">{m.pwa_update_dirty_description()}</p>
      {/if}
    </div>
    <div class="actions">
      <button type="button" class="secondary" onclick={dismissPwaUpdatePrompt} disabled={applying}
        >{m.pwa_update_later()}</button
      >
      <button type="button" class="primary" onclick={updateNow} disabled={applying || !canApply}
        >{applying
          ? m.common_loading()
          : $appIsDirty
            ? m.pwa_update_anyway()
            : m.pwa_update_now()}</button
      >
    </div>
  </section>
{/if}

<style>
  .update-prompt {
    position: fixed;
    z-index: 52;
    right: 12px;
    bottom: max(104px, calc(92px + env(safe-area-inset-bottom)));
    left: 12px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 520px;
    margin: auto;
    padding: 14px;
    border: 1px solid color-mix(in srgb, var(--apex-accent) 42%, var(--apex-border));
    border-radius: 14px;
    background: var(--apex-surface);
    box-shadow: 0 12px 32px rgb(0 0 0 / 25%);
  }

  .copy {
    min-width: 0;
  }

  .title,
  .description {
    margin: 0;
  }

  .title {
    color: var(--apex-text);
    font-size: 14px;
    font-weight: 650;
  }

  .description {
    margin-top: 4px;
    color: var(--apex-text-muted);
    font-size: 13px;
    line-height: 1.35;
  }

  .actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  button {
    min-height: 38px;
    border-radius: 9px;
    padding: 8px 12px;
    font: inherit;
    font-size: 13px;
    font-weight: 650;
  }

  .primary {
    border: 1px solid var(--apex-accent);
    background: var(--apex-accent);
    color: var(--apex-on-accent, #fff);
  }

  .secondary {
    border: 1px solid var(--apex-border);
    background: transparent;
    color: var(--apex-text);
  }

  button:disabled {
    cursor: wait;
    opacity: 0.65;
  }

  @media (min-width: 640px) {
    .update-prompt {
      flex-direction: row;
      align-items: center;
    }

    .copy {
      flex: 1;
    }
  }
</style>
