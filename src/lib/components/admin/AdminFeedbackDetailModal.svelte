<script lang="ts">
  import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';
  import { onMount } from 'svelte';
  import { ExternalLink, X } from '@lucide/svelte';
  import type { FeedbackStatus } from '$lib/api/feedback';
  import { ApiRequestError } from '$lib/api/errors';
  import {
    adminFeedbackDetailQueryOptions,
    patchAdminFeedbackMutationOptions,
  } from '$lib/queries/feedback';
  import { legalReacceptanceRequired } from '$lib/stores/legal';
  import { createDialogController } from '$lib/components/shared/dialogController.svelte';
  import StatusBadge from '$lib/components/shared/StatusBadge.svelte';
  import { resolveFeedbackAssetUrl } from '$lib/utils/feedback';
  import * as m from '$paraglide/messages';

  interface Props {
    reportId: string;
    onclose: () => void;
  }
  let { reportId, onclose }: Props = $props();

  const colors: Record<string, string> = {
    open: 'warning',
    in_progress: 'accent',
    resolved: 'success',
    dismissed: 'muted',
  };
  const queryClient = useQueryClient();
  const detailQuery = createQuery(() => adminFeedbackDetailQueryOptions(reportId));
  const mutation = createMutation(() => patchAdminFeedbackMutationOptions(queryClient));
  const report = $derived(detailQuery.data);
  const assetHref = $derived(resolveFeedbackAssetUrl(report?.asset_url));
  let note = $state('');
  let initializedFor = $state<string | null>(null);
  let error = $state('');
  let notice = $state('');

  const controller = createDialogController({
    canClose: () => !mutation.isPending,
    onClose: () => onclose(),
  });
  onMount(controller.open);

  $effect(() => {
    if (report && initializedFor !== report.id) {
      note = report.admin_note ?? '';
      initializedFor = report.id;
    }
  });

  // Admin PATCH is legal-enforced. Give the existing blocker the top layer instead of leaving
  // this modal in front of it; the admin can reopen manually after completing re-acceptance.
  $effect(() => {
    if ($legalReacceptanceRequired) onclose();
  });

  const noteInvalid = $derived(note.length > 4000 || note.includes('\u0000'));

  function statusLabel(status: FeedbackStatus): string {
    if (status === 'in_progress') return m.feedback_status_in_progress();
    if (status === 'resolved') return m.feedback_status_resolved();
    if (status === 'dismissed') return m.feedback_status_dismissed();
    return m.feedback_status_open();
  }

  function categoryLabel(): string {
    if (!report) return '';
    const labels = {
      bug: m.feedback_category_bug,
      generation: m.feedback_category_generation,
      billing: m.feedback_category_billing,
      account: m.feedback_category_account,
      content: m.feedback_category_content,
      other: m.feedback_category_other,
    };
    return labels[report.category]();
  }

  function formatDate(value: string | null): string {
    return value ? new Date(value).toLocaleString() : '—';
  }

  async function saveNote(): Promise<void> {
    if (!report || noteInvalid || mutation.isPending) return;
    error = '';
    notice = '';
    try {
      const updated = await mutation.mutateAsync({
        reportId: report.id,
        body: { admin_note: note || null },
      });
      note = updated.admin_note ?? '';
    } catch (caught) {
      if (!(caught instanceof ApiRequestError && caught.status_code === 428))
        error = m.feedback_admin_update_error();
    }
  }

  async function updateStatus(status: FeedbackStatus): Promise<void> {
    if (!report || mutation.isPending) return;
    error = '';
    notice = '';
    try {
      await mutation.mutateAsync({ reportId: report.id, body: { status } });
    } catch (caught) {
      if (
        caught instanceof ApiRequestError &&
        caught.status_code === 409 &&
        caught.error === 'invalid_status_transition'
      ) {
        notice = m.feedback_admin_concurrent_update();
        await queryClient.invalidateQueries({ queryKey: ['feedback', 'admin', 'list'] });
        await detailQuery.refetch();
        return;
      }
      if (!(caught instanceof ApiRequestError && caught.status_code === 428))
        error = m.feedback_admin_update_error();
    }
  }
</script>

<dialog
  bind:this={controller.dialog}
  class="detail-dialog"
  aria-labelledby="feedback-detail-title"
  oncancel={controller.handleCancel}
  onclick={controller.handleBackdropClick}
>
  <div class="card">
    <header>
      <h2 id="feedback-detail-title">{m.feedback_admin_detail_title()}</h2>
      <button
        type="button"
        onclick={controller.requestClose}
        disabled={mutation.isPending}
        aria-label={m.common_close()}><X size={18} /></button
      >
    </header>
    {#if detailQuery.isPending}
      <p class="muted">{m.common_loading()}</p>
    {:else if detailQuery.isError || !report}
      <p class="error" role="alert">{m.feedback_admin_load_error()}</p>
    {:else}
      <div class="badges">
        <StatusBadge status={statusLabel(report.status)} colorMap={colors} /><span
          >{categoryLabel()}</span
        >
      </div>
      <section>
        <h3>{m.feedback_admin_message()}</h3>
        <p class="untrusted">{report.message}</p>
      </section>
      <dl>
        <div>
          <dt>{m.feedback_admin_reporter()}</dt>
          <dd>{report.user_email ?? m.feedback_deleted_user()}</dd>
        </div>
        <div>
          <dt>{m.feedback_admin_user_id()}</dt>
          <dd class="mono">{report.user_id ?? '—'}</dd>
        </div>
        <div>
          <dt>{m.feedback_admin_created()}</dt>
          <dd>{formatDate(report.created_at)}</dd>
        </div>
        <div>
          <dt>{m.feedback_admin_updated()}</dt>
          <dd>{formatDate(report.updated_at)}</dd>
        </div>
        <div>
          <dt>{m.feedback_admin_job_id()}</dt>
          <dd class="mono">{report.job_id ?? '—'}</dd>
        </div>
        <div>
          <dt>{m.feedback_admin_asset_ref()}</dt>
          <dd class="mono">{report.asset_ref ?? '—'}</dd>
        </div>
        <div>
          <dt>{m.feedback_admin_client_path()}</dt>
          <dd class="untrusted">{report.client_path ?? '—'}</dd>
        </div>
        <div>
          <dt>{m.feedback_admin_app_version()}</dt>
          <dd>{report.app_version ?? '—'}</dd>
        </div>
        <div>
          <dt>{m.feedback_admin_user_agent()}</dt>
          <dd class="untrusted">{report.user_agent ?? '—'}</dd>
        </div>
        <div>
          <dt>{m.feedback_admin_resolved_at()}</dt>
          <dd>{formatDate(report.resolved_at)}</dd>
        </div>
        <div>
          <dt>{m.feedback_admin_resolved_by()}</dt>
          <dd class="mono">{report.resolved_by ?? '—'}</dd>
        </div>
      </dl>
      {#if assetHref}
        <a class="asset-link" href={assetHref} target="_blank" rel="noopener noreferrer"
          ><ExternalLink size={15} /> {m.feedback_admin_open_asset()}</a
        >
      {/if}
      <section>
        <label for="feedback-admin-note">{m.feedback_admin_note()}</label><textarea
          id="feedback-admin-note"
          bind:value={note}
          rows="4"
          disabled={mutation.isPending}
          aria-invalid={noteInvalid}></textarea>{#if noteInvalid}<p class="error">
            {m.feedback_admin_note_invalid()}
          </p>{/if}<button
          type="button"
          class="secondary"
          onclick={saveNote}
          disabled={noteInvalid || mutation.isPending}>{m.feedback_admin_save_note()}</button
        >
      </section>
      {#if report.status === 'open' || report.status === 'in_progress'}
        <section class="transitions">
          <h3>{m.feedback_admin_status_actions()}</h3>
          {#if report.status === 'open'}<button
              type="button"
              class="secondary"
              onclick={() => updateStatus('in_progress')}
              disabled={mutation.isPending}>{m.feedback_admin_mark_in_progress()}</button
            >{/if}<button
            type="button"
            class="secondary"
            onclick={() => updateStatus('resolved')}
            disabled={mutation.isPending}>{m.feedback_admin_resolve()}</button
          ><button
            type="button"
            class="danger"
            onclick={() => updateStatus('dismissed')}
            disabled={mutation.isPending}>{m.feedback_admin_dismiss()}</button
          >
        </section>
      {/if}
      {#if notice}<p class="notice" role="status">{notice}</p>{/if}
      {#if error}<p class="error" role="alert">{error}</p>{/if}
    {/if}
  </div>
</dialog>

<style>
  .detail-dialog {
    background: transparent;
    border: 0;
    max-height: 100dvh;
    max-width: 100%;
    padding: 1rem;
  }
  .detail-dialog::backdrop {
    background: rgb(0 0 0 / 58%);
    backdrop-filter: blur(4px);
  }
  .card {
    background: var(--apex-surface);
    border: 1px solid var(--apex-border);
    border-radius: 1rem;
    box-sizing: border-box;
    color: var(--apex-text);
    max-height: calc(100dvh - 2rem);
    max-width: 46rem;
    overflow-y: auto;
    padding: 1.25rem;
    width: min(46rem, calc(100vw - 2rem));
  }
  header {
    align-items: center;
    display: flex;
    justify-content: space-between;
  }
  h2,
  h3,
  p {
    margin: 0;
  }
  h2 {
    font-size: 1.15rem;
  }
  h3,
  label {
    color: var(--apex-text-muted);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }
  header button {
    background: transparent;
    border: 0;
    border-radius: 0.45rem;
    color: var(--apex-text-muted);
    cursor: pointer;
    display: flex;
    padding: 0.4rem;
  }
  header button:hover {
    background: var(--apex-surface-hover);
  }
  .badges,
  .transitions {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem;
  }
  .badges {
    margin: 1rem 0;
  }
  .badges span {
    color: var(--apex-text-muted);
    font-size: 0.82rem;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-top: 1rem;
  }
  .untrusted {
    line-height: 1.5;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }
  dl {
    display: grid;
    gap: 0.5rem;
    grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
    margin: 1rem 0 0;
  }
  dl div {
    background: var(--apex-bg);
    border: 1px solid var(--apex-border);
    border-radius: 0.5rem;
    min-width: 0;
    padding: 0.55rem;
  }
  dt {
    color: var(--apex-text-dim);
    font-size: 0.68rem;
    font-weight: 700;
    margin-bottom: 0.2rem;
    text-transform: uppercase;
  }
  dd {
    color: var(--apex-text);
    font-size: 0.8rem;
    margin: 0;
    overflow-wrap: anywhere;
  }
  .mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  textarea {
    background: var(--apex-bg);
    border: 1px solid var(--apex-border);
    border-radius: 0.5rem;
    color: var(--apex-text);
    font: inherit;
    padding: 0.6rem;
    resize: vertical;
  }
  textarea:focus {
    border-color: var(--apex-border-active);
    outline: none;
  }
  .secondary,
  .danger,
  .asset-link {
    align-items: center;
    background: transparent;
    border: 1px solid var(--apex-border);
    border-radius: 0.5rem;
    color: var(--apex-accent);
    cursor: pointer;
    display: inline-flex;
    font: inherit;
    font-size: 0.82rem;
    font-weight: 650;
    gap: 0.35rem;
    padding: 0.5rem 0.7rem;
    text-decoration: none;
    width: fit-content;
  }
  .secondary:hover,
  .asset-link:hover {
    background: var(--apex-surface-hover);
  }
  .danger {
    border-color: color-mix(in srgb, var(--apex-danger) 45%, var(--apex-border));
    color: var(--apex-danger);
  }
  .danger:disabled,
  .secondary:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
  .asset-link {
    margin-top: 1rem;
  }
  .error {
    color: var(--apex-danger);
    font-size: 0.82rem;
    margin-top: 0.75rem;
  }
  .notice {
    color: var(--apex-warning);
    font-size: 0.82rem;
    margin-top: 0.75rem;
  }
  .muted {
    color: var(--apex-text-muted);
    margin-top: 1rem;
  }
</style>
