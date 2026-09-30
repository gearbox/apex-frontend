<script lang="ts">
  import { createMutation } from '@tanstack/svelte-query';
  import { onMount } from 'svelte';
  import { X, Link2Off } from '@lucide/svelte';
  import type { FeedbackCategory, FeedbackCreate } from '$lib/api/feedback';
  import { ApiRequestError } from '$lib/api/errors';
  import { isRequestCancellation } from '$lib/api/client';
  import { submitFeedbackMutationOptions } from '$lib/queries/feedback';
  import { feedbackDialog } from '$lib/stores/feedbackDialog.svelte';
  import { createDialogController } from '$lib/components/shared/dialogController.svelte';
  import {
    feedbackAppVersion,
    validateFeedbackMessage,
    type FeedbackMessageValidity,
  } from '$lib/utils/feedback';
  import * as m from '$paraglide/messages';

  const categories: Array<{ value: FeedbackCategory; label: () => string }> = [
    { value: 'bug', label: () => m.feedback_category_bug() },
    { value: 'generation', label: () => m.feedback_category_generation() },
    { value: 'billing', label: () => m.feedback_category_billing() },
    { value: 'account', label: () => m.feedback_category_account() },
    { value: 'content', label: () => m.feedback_category_content() },
    { value: 'other', label: () => m.feedback_category_other() },
  ];

  function defaultCategory(): FeedbackCategory {
    const { initialCategory, jobId, assetRef } = feedbackDialog.context;
    return initialCategory ?? (jobId || assetRef ? 'generation' : 'bug');
  }

  let textarea = $state<HTMLTextAreaElement>();
  let category = $state<FeedbackCategory>(defaultCategory());
  let message = $state('');
  let viewState = $state<'form' | 'success'>('form');
  let formError = $state('');
  let unavailable = $state<'job' | 'asset' | null>(null);

  const mutation = createMutation(() => submitFeedbackMutationOptions());
  const validation = $derived(validateFeedbackMessage(message));
  const context = $derived(feedbackDialog.context);
  const canSubmit = $derived(
    validation.validity === 'valid' && !mutation.isPending && viewState === 'form',
  );

  const controller = createDialogController({
    canClose: () => !mutation.isPending,
    initialFocus: () => textarea,
    onClose: () => feedbackDialog.close(),
  });

  onMount(controller.open);

  function validationMessage(validity: FeedbackMessageValidity): string {
    if (validity === 'too_short') return m.feedback_message_too_short();
    if (validity === 'too_long') return m.feedback_message_too_long();
    if (validity === 'contains_nul') return m.feedback_message_invalid();
    return '';
  }

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (!canSubmit) return;

    formError = '';
    unavailable = null;
    const body: FeedbackCreate = {
      category,
      message: validation.trimmed,
      ...(context.jobId ? { job_id: context.jobId } : {}),
      ...(context.assetRef ? { asset_ref: context.assetRef } : {}),
      // Pathname deliberately excludes an OAuth/reset query or fragment.
      client_path: window.location.pathname,
      app_version: feedbackAppVersion(),
    };

    try {
      await mutation.mutateAsync(body);
      viewState = 'success';
    } catch (caught) {
      if (isRequestCancellation(caught)) return;
      if (caught instanceof ApiRequestError) {
        if (caught.status_code === 404 && caught.error === 'job_not_found') {
          unavailable = 'job';
          return;
        }
        if (caught.status_code === 404 && caught.error === 'asset_not_found') {
          unavailable = 'asset';
          return;
        }
        if (caught.status_code === 429 && caught.error === 'rate_limited') {
          formError = m.feedback_rate_limited();
          return;
        }
        if (caught.status_code === 400 && caught.error === 'validation_error') {
          formError = m.feedback_message_invalid();
          return;
        }
      }
      // A framework 400/413 or an unexpected envelope is not safe to expose verbatim.
      formError = m.feedback_submit_error();
    }
  }

  function removeUnavailableContext(): void {
    if (unavailable === 'job') feedbackDialog.removeJob();
    if (unavailable === 'asset') feedbackDialog.removeAsset();
    unavailable = null;
  }
</script>

<dialog
  bind:this={controller.dialog}
  class="feedback-dialog"
  aria-labelledby="feedback-title"
  oncancel={controller.handleCancel}
  onclick={controller.handleBackdropClick}
>
  <div class="dialog-card">
    <div class="dialog-header">
      <h2 id="feedback-title">{m.feedback_title()}</h2>
      {#if viewState === 'form'}
        <button
          type="button"
          class="close-button"
          onclick={controller.requestClose}
          disabled={mutation.isPending}
          aria-label={m.common_close()}
        >
          <X size={18} />
        </button>
      {/if}
    </div>

    {#if viewState === 'success'}
      <div class="success-state" aria-live="polite">
        <p>{m.feedback_success()}</p>
        <button type="button" class="primary-button" onclick={controller.requestClose}>
          {m.common_close()}
        </button>
      </div>
    {:else}
      <form onsubmit={submit}>
        <div class="fields">
          <label class="field">
            <span>{m.feedback_category_label()}</span>
            <select bind:value={category} disabled={mutation.isPending}>
              {#each categories as option (option.value)}
                <option value={option.value}>{option.label()}</option>
              {/each}
            </select>
          </label>

          <label class="field" for="feedback-message">
            <span>{m.feedback_message_label()}</span>
            <textarea
              bind:this={textarea}
              id="feedback-message"
              bind:value={message}
              rows="7"
              disabled={mutation.isPending}
              aria-describedby="feedback-message-help feedback-message-count"
              aria-invalid={validation.validity !== 'valid' && message.length > 0}></textarea>
          </label>
          <div class="message-help">
            <span id="feedback-message-help">{m.feedback_message_helper()}</span>
            <span id="feedback-message-count" aria-live="polite"
              >{m.feedback_message_count({ count: validation.codePointCount })}</span
            >
          </div>
          {#if validation.validity !== 'valid' && message.length > 0}
            <p class="field-error" role="alert">{validationMessage(validation.validity)}</p>
          {/if}

          {#if context.jobId || context.assetRef}
            <div class="context-summary">
              <p>{m.feedback_linked_context()}</p>
              {#if context.jobId}
                <div class="context-row">
                  <span>{m.feedback_linked_job()}</span>
                  <button
                    type="button"
                    onclick={() => feedbackDialog.removeJob()}
                    disabled={mutation.isPending}>{m.feedback_remove_job()}</button
                  >
                </div>
              {/if}
              {#if context.assetRef}
                <div class="context-row">
                  <span>{m.feedback_linked_result()}</span>
                  <button
                    type="button"
                    onclick={() => feedbackDialog.removeAsset()}
                    disabled={mutation.isPending}>{m.feedback_remove_result()}</button
                  >
                </div>
              {/if}
            </div>
          {/if}

          {#if unavailable}
            <div class="unavailable" role="alert">
              <Link2Off size={16} aria-hidden="true" />
              <div>
                <p>
                  {unavailable === 'job'
                    ? m.feedback_job_unavailable()
                    : m.feedback_asset_unavailable()}
                </p>
                <button
                  type="button"
                  onclick={removeUnavailableContext}
                  disabled={mutation.isPending}
                >
                  {unavailable === 'job'
                    ? m.feedback_send_without_job()
                    : m.feedback_send_without_result()}
                </button>
              </div>
            </div>
          {/if}

          {#if formError}
            <p class="form-error" role="alert">{formError}</p>
          {/if}
        </div>

        <div class="actions">
          <button
            type="button"
            class="secondary-button"
            onclick={controller.requestClose}
            disabled={mutation.isPending}>{m.common_cancel()}</button
          >
          >
          <button type="submit" class="primary-button" disabled={!canSubmit}>
            {mutation.isPending ? m.feedback_sending() : m.feedback_send()}
          </button>
        </div>
      </form>
    {/if}
  </div>
</dialog>

<style>
  .feedback-dialog {
    background: transparent;
    border: 0;
    max-height: 100dvh;
    max-width: 100%;
    padding: 1rem;
  }
  .feedback-dialog::backdrop {
    background: rgb(0 0 0 / 58%);
    backdrop-filter: blur(4px);
  }
  .dialog-card {
    background: var(--apex-surface);
    border: 1px solid var(--apex-border);
    border-radius: 1rem;
    box-shadow: 0 1.5rem 4rem rgb(0 0 0 / 30%);
    box-sizing: border-box;
    color: var(--apex-text);
    max-height: calc(100dvh - 2rem);
    max-width: 34rem;
    overflow-y: auto;
    padding: clamp(1.25rem, 5vw, 1.75rem);
    width: min(34rem, calc(100vw - 2rem));
  }
  .dialog-header {
    align-items: center;
    display: flex;
    gap: 1rem;
    justify-content: space-between;
  }
  h2 {
    font-size: 1.2rem;
    margin: 0;
  }
  .close-button {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 0.5rem;
    color: var(--apex-text-muted);
    cursor: pointer;
    display: flex;
    height: 2rem;
    justify-content: center;
    width: 2rem;
  }
  .close-button:hover {
    background: var(--apex-surface-hover);
    color: var(--apex-text);
  }
  form,
  .fields {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }
  form {
    margin-top: 1.25rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    font-size: 0.82rem;
    font-weight: 600;
    gap: 0.4rem;
  }
  select,
  textarea {
    background: var(--apex-bg);
    border: 1px solid var(--apex-border);
    border-radius: 0.55rem;
    color: var(--apex-text);
    font: inherit;
    padding: 0.65rem 0.75rem;
  }
  textarea {
    line-height: 1.45;
    resize: vertical;
  }
  select:focus,
  textarea:focus {
    border-color: var(--apex-border-active);
    outline: none;
  }
  .message-help {
    color: var(--apex-text-dim);
    display: flex;
    font-size: 0.75rem;
    justify-content: space-between;
    gap: 1rem;
  }
  .field-error,
  .form-error {
    color: var(--apex-danger);
    font-size: 0.8rem;
    margin: 0;
  }
  .context-summary,
  .unavailable {
    background: var(--apex-bg);
    border: 1px solid var(--apex-border);
    border-radius: 0.6rem;
    display: flex;
    flex-direction: column;
    font-size: 0.8rem;
    gap: 0.45rem;
    padding: 0.7rem;
  }
  .context-summary p,
  .unavailable p {
    color: var(--apex-text-muted);
    font-weight: 600;
    margin: 0;
  }
  .context-row {
    align-items: center;
    display: flex;
    gap: 0.5rem;
    justify-content: space-between;
    min-width: 0;
  }
  .context-row span {
    color: var(--apex-text-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .context-row button,
  .unavailable button {
    background: transparent;
    border: 0;
    color: var(--apex-accent);
    cursor: pointer;
    font: inherit;
    font-weight: 600;
    padding: 0.15rem;
    text-align: left;
  }
  .unavailable {
    align-items: flex-start;
    color: var(--apex-text-muted);
    flex-direction: row;
  }
  .unavailable :global(svg) {
    color: var(--apex-warning);
    flex: none;
    margin-top: 0.1rem;
  }
  .actions {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
    margin-top: 1.25rem;
  }
  .primary-button,
  .secondary-button {
    border-radius: 0.55rem;
    cursor: pointer;
    font: inherit;
    font-size: 0.9rem;
    font-weight: 650;
    padding: 0.65rem 1rem;
  }
  .primary-button {
    background: var(--apex-accent);
    border: 1px solid var(--apex-accent);
    color: white;
  }
  .secondary-button {
    background: transparent;
    border: 1px solid var(--apex-border);
    color: var(--apex-text-muted);
  }
  .primary-button:disabled,
  .secondary-button:disabled,
  .close-button:disabled,
  select:disabled,
  textarea:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
  .success-state {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    margin-top: 1.25rem;
  }
  .success-state p {
    line-height: 1.5;
    margin: 0;
  }
</style>
