<script lang="ts">
  import { createMutation, useQueryClient } from '@tanstack/svelte-query';
  import { Megaphone } from 'lucide-svelte';
  import { sendBroadcastMutationOptions } from '$lib/queries/admin';
  import { addToast } from '$lib/stores/toasts';
  import { ApiRequestError } from '$lib/api/errors';

  const queryClient = useQueryClient();

  let level = $state<'info' | 'warning' | 'critical'>('info');
  let title = $state('');
  let message = $state('');
  let expiresAt = $state('');
  let errorMsg = $state('');

  const mutation = createMutation(() => sendBroadcastMutationOptions(queryClient));

  const levelColors: Record<'info' | 'warning' | 'critical', string> = {
    info: 'var(--apex-accent)',
    warning: 'var(--apex-warning)',
    critical: 'var(--apex-danger)',
  };

  async function handleSend() {
    errorMsg = '';
    try {
      await mutation.mutateAsync({
        level,
        title: title.trim(),
        message: message.trim(),
        expires_at: (() => {
          const d = expiresAt ? new Date(expiresAt) : null;
          return d && !isNaN(d.getTime()) ? d.toISOString() : null;
        })(),
      });
      addToast({ type: 'success', message: 'Broadcast sent' });
      title = '';
      message = '';
      expiresAt = '';
      level = 'info';
    } catch (e) {
      errorMsg = e instanceof ApiRequestError ? e.message : 'Unexpected error. Please try again.';
    }
  }
</script>

<div class="broadcast-tab">
  <div class="tab-header">
    <Megaphone size={20} />
    <h2 class="tab-title">Broadcast Notification</h2>
  </div>
  <p class="caution">
    This message will be delivered immediately to <strong>all connected users</strong>. Use with
    care.
  </p>

  <div class="form-fields">
    <!-- Level -->
    <div class="field">
      <label class="field-label" for="bc-level">Level</label>
      <select id="bc-level" class="field-select" bind:value={level}>
        <option value="info">Info</option>
        <option value="warning">Warning</option>
        <option value="critical">Critical</option>
      </select>
    </div>

    <!-- Title -->
    <div class="field">
      <label class="field-label" for="bc-title">Title</label>
      <input
        id="bc-title"
        class="field-input"
        type="text"
        bind:value={title}
        placeholder="Short subject line…"
        maxlength={120}
      />
    </div>

    <!-- Message -->
    <div class="field">
      <label class="field-label" for="bc-message">Message</label>
      <textarea
        id="bc-message"
        class="field-textarea"
        bind:value={message}
        rows={4}
        maxlength={1000}
        placeholder="Body of the notification…"
      ></textarea>
    </div>

    <!-- Expires at -->
    <div class="field">
      <label class="field-label" for="bc-expires">Expires at (optional)</label>
      <input id="bc-expires" class="field-input" type="datetime-local" bind:value={expiresAt} />
      <span class="field-hint">Leave empty for no expiry.</span>
    </div>
  </div>

  <!-- Live preview -->
  <div class="preview-section">
    <p class="preview-label">Preview</p>
    <div class="preview-card" style="border-left-color: {levelColors[level]}">
      <div class="preview-level" style="color: {levelColors[level]}">{level}</div>
      <div class="preview-title">{title || 'Title…'}</div>
      <div class="preview-message">{message || 'Message…'}</div>
    </div>
  </div>

  {#if errorMsg}
    <p class="error-msg">{errorMsg}</p>
  {/if}

  <div class="form-actions">
    <button
      class="btn-send"
      onclick={handleSend}
      disabled={mutation.isPending || !title.trim() || !message.trim()}
    >
      {mutation.isPending ? 'Sending…' : 'Send broadcast'}
    </button>
  </div>
</div>

<style>
  .broadcast-tab {
    padding: 24px;
    max-width: 640px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .tab-header {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--apex-text);
  }

  .tab-title {
    font-size: 18px;
    font-weight: 700;
    margin: 0;
    color: var(--apex-text);
  }

  .caution {
    font-size: 13px;
    color: var(--apex-warning);
    background: color-mix(in srgb, var(--apex-warning) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--apex-warning) 30%, transparent);
    border-radius: 8px;
    padding: 10px 14px;
    margin: 0;
  }

  .form-fields {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--apex-text-muted);
  }

  .field-select,
  .field-input,
  .field-textarea {
    background: var(--apex-bg);
    border: 1px solid var(--apex-border);
    color: var(--apex-text);
    border-radius: 8px;
    padding: 8px 12px;
    font-size: 14px;
    font-family: inherit;
    width: 100%;
  }

  .field-textarea {
    resize: vertical;
    min-height: 96px;
  }

  .field-hint {
    font-size: 11px;
    color: var(--apex-text-dim);
  }

  .preview-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .preview-label {
    font-size: 12px;
    font-weight: 600;
    color: var(--apex-text-dim);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0;
  }

  .preview-card {
    background: var(--apex-surface);
    border: 1px solid var(--apex-border);
    border-left: 4px solid;
    border-radius: 8px;
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .preview-level {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .preview-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--apex-text);
  }

  .preview-message {
    font-size: 13px;
    color: var(--apex-text-muted);
  }

  .error-msg {
    font-size: 13px;
    color: var(--apex-danger);
    margin: 0;
    padding: 8px 12px;
    background: color-mix(in srgb, var(--apex-danger) 10%, transparent);
    border-radius: 8px;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
  }

  .btn-send {
    padding: 10px 22px;
    border-radius: 8px;
    border: none;
    background: var(--apex-accent);
    color: white;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    font-family: inherit;
    transition: opacity 0.15s;
  }

  .btn-send:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
