<script lang="ts">
  import { createQuery } from '@tanstack/svelte-query';
  import { AlertCircle, MessageSquareWarning, Paperclip, Eye } from '@lucide/svelte';
  import type { FeedbackCategory, FeedbackStatus } from '$lib/api/feedback';
  import { adminFeedbackListQueryOptions } from '$lib/queries/feedback';
  import CursorPagination from '$lib/components/shared/CursorPagination.svelte';
  import StatusBadge from '$lib/components/shared/StatusBadge.svelte';
  import AdminFeedbackDetailModal from '$lib/components/admin/AdminFeedbackDetailModal.svelte';
  import { CursorPaginator } from '$lib/utils/cursorPagination.svelte';
  import {
    feedbackCategoryLabel,
    feedbackStatusLabel,
    FEEDBACK_STATUS_COLORS,
  } from '$lib/utils/feedback';
  import * as m from '$paraglide/messages';

  const PAGE_SIZE = 30;
  const statuses: Array<{ value: FeedbackStatus | ''; label: () => string }> = [
    { value: '', label: () => m.feedback_filter_all() },
    { value: 'open', label: () => feedbackStatusLabel('open') },
    { value: 'in_progress', label: () => feedbackStatusLabel('in_progress') },
    { value: 'resolved', label: () => feedbackStatusLabel('resolved') },
    { value: 'dismissed', label: () => feedbackStatusLabel('dismissed') },
  ];
  const categories: Array<{ value: FeedbackCategory | ''; label: () => string }> = [
    { value: '', label: () => m.feedback_filter_all() },
    { value: 'bug', label: () => feedbackCategoryLabel('bug') },
    { value: 'generation', label: () => feedbackCategoryLabel('generation') },
    { value: 'billing', label: () => feedbackCategoryLabel('billing') },
    { value: 'account', label: () => feedbackCategoryLabel('account') },
    { value: 'content', label: () => feedbackCategoryLabel('content') },
    { value: 'other', label: () => feedbackCategoryLabel('other') },
  ];

  let status = $state<FeedbackStatus | ''>('');
  let category = $state<FeedbackCategory | ''>('');
  let selectedReportId = $state<string | null>(null);
  const pager = new CursorPaginator();
  const query = createQuery(() =>
    adminFeedbackListQueryOptions({
      ...(status ? { status } : {}),
      ...(category ? { category } : {}),
      limit: PAGE_SIZE,
      ...pager.param,
    }),
  );

  function updateStatus(event: Event): void {
    status = (event.currentTarget as HTMLSelectElement).value as FeedbackStatus | '';
    pager.reset();
  }

  function updateCategory(event: Event): void {
    category = (event.currentTarget as HTMLSelectElement).value as FeedbackCategory | '';
    pager.reset();
  }

  function formatDate(value: string): string {
    return new Date(value).toLocaleString();
  }

  function excerpt(message: string): string {
    const normalized = message.replace(/\s+/g, ' ').trim();
    return normalized.length > 120 ? `${normalized.slice(0, 120)}…` : normalized;
  }
</script>

<div class="tab-content">
  <div class="filters" aria-label={m.feedback_admin_filters()}>
    <label>
      <span>{m.feedback_admin_status()}</span>
      <select value={status} onchange={updateStatus}>
        {#each statuses as option (option.value)}
          <option value={option.value}>{option.label()}</option>
        {/each}
      </select>
    </label>
    <label>
      <span>{m.feedback_admin_category()}</span>
      <select value={category} onchange={updateCategory}>
        {#each categories as option (option.value)}
          <option value={option.value}>{option.label()}</option>
        {/each}
      </select>
    </label>
  </div>

  {#if query.isPending}
    <div class="skeleton-list" aria-label={m.common_loading()}>
      {#each { length: 5 } as _, index (index)}<div class="skeleton-row"></div>{/each}
    </div>
  {:else if query.isError}
    <div class="empty-state">
      <AlertCircle size={30} />
      <p>{m.feedback_admin_load_error()}</p>
      <button type="button" class="secondary-button" onclick={() => query.refetch()}>
        {m.common_retry()}
      </button>
    </div>
  {:else if query.data}
    {@const reports = query.data.items}
    {#if reports.length === 0}
      <div class="empty-state">
        <MessageSquareWarning size={30} />
        <p>{m.feedback_admin_empty()}</p>
      </div>
    {:else}
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{m.feedback_admin_created()}</th>
              <th>{m.feedback_admin_status()}</th>
              <th>{m.feedback_admin_category()}</th>
              <th>{m.feedback_admin_reporter()}</th>
              <th>{m.feedback_admin_message()}</th>
              <th>{m.feedback_admin_context()}</th>
              <th><span class="sr-only">{m.feedback_admin_view()}</span></th>
            </tr>
          </thead>
          <tbody>
            {#each reports as report (report.id)}
              <tr>
                <td class="date">{formatDate(report.created_at)}</td>
                <td
                  ><StatusBadge
                    status={feedbackStatusLabel(report.status)}
                    color={FEEDBACK_STATUS_COLORS[report.status]}
                  /></td
                >
                <td>{feedbackCategoryLabel(report.category)}</td>
                <td>{report.user_email ?? m.feedback_deleted_user()}</td>
                <td class="message">{excerpt(report.message)}</td>
                <td>
                  {#if report.job_id || report.asset_ref}
                    <Paperclip size={15} aria-label={m.feedback_admin_has_context()} />
                  {:else}—{/if}
                </td>
                <td
                  ><button
                    type="button"
                    class="view-button"
                    onclick={() => (selectedReportId = report.id)}>{m.feedback_admin_view()}</button
                  ></td
                >
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <div class="card-list">
        {#each reports as report (report.id)}
          <article class="report-card">
            <div class="card-heading">
              <StatusBadge
                status={feedbackStatusLabel(report.status)}
                color={FEEDBACK_STATUS_COLORS[report.status]}
              />
              <span>{feedbackCategoryLabel(report.category)}</span>
            </div>
            <p class="reporter">{report.user_email ?? m.feedback_deleted_user()}</p>
            <p class="message">{excerpt(report.message)}</p>
            <div class="card-footer">
              <span>{formatDate(report.created_at)}</span>
              <button
                type="button"
                class="view-button"
                onclick={() => (selectedReportId = report.id)}
              >
                <Eye size={15} aria-hidden="true" />
                {m.feedback_admin_view()}
              </button>
            </div>
          </article>
        {/each}
      </div>
    {/if}
    <CursorPagination
      hasPrev={pager.hasPrev}
      hasNext={query.data.has_more}
      pageNumber={pager.pageNumber}
      loading={query.isFetching}
      onprev={() => pager.prev()}
      onnext={() => pager.next(query.data?.next_cursor)}
    />
  {/if}
</div>

{#if selectedReportId}
  <AdminFeedbackDetailModal reportId={selectedReportId} onclose={() => (selectedReportId = null)} />
{/if}

<style>
  .tab-content {
    padding: 1rem;
  }
  .filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-bottom: 1.25rem;
  }
  .filters label {
    color: var(--apex-text-muted);
    display: flex;
    flex-direction: column;
    font-size: 0.75rem;
    font-weight: 600;
    gap: 0.3rem;
  }
  select {
    background: var(--apex-surface);
    border: 1px solid var(--apex-border);
    border-radius: 0.5rem;
    color: var(--apex-text);
    font: inherit;
    min-width: 11rem;
    padding: 0.5rem 0.65rem;
  }
  .table-wrap {
    overflow-x: auto;
  }
  table {
    border-collapse: collapse;
    font-size: 0.82rem;
    min-width: 52rem;
    width: 100%;
  }
  th {
    color: var(--apex-text-dim);
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-align: left;
    text-transform: uppercase;
  }
  th,
  td {
    border-bottom: 1px solid var(--apex-border);
    padding: 0.7rem 0.6rem;
    vertical-align: middle;
  }
  td {
    color: var(--apex-text-muted);
  }
  .message {
    color: var(--apex-text);
    line-height: 1.4;
    margin: 0;
    max-width: 24rem;
  }
  .date {
    white-space: nowrap;
  }
  .view-button,
  .secondary-button {
    align-items: center;
    background: transparent;
    border: 1px solid var(--apex-border);
    border-radius: 0.45rem;
    color: var(--apex-accent);
    cursor: pointer;
    display: inline-flex;
    font: inherit;
    font-size: 0.78rem;
    font-weight: 650;
    gap: 0.35rem;
    padding: 0.4rem 0.6rem;
  }
  .view-button:hover,
  .secondary-button:hover {
    background: var(--apex-surface-hover);
  }
  .card-list {
    display: none;
  }
  .skeleton-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .skeleton-row {
    animation: pulse 1.5s ease-in-out infinite;
    background: var(--apex-surface);
    border-radius: 0.5rem;
    height: 3.4rem;
  }
  .empty-state {
    align-items: center;
    color: var(--apex-text-dim);
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 3rem 0;
    text-align: center;
  }
  @keyframes pulse {
    50% {
      opacity: 0.55;
    }
  }
  @media (min-width: 768px) {
    .tab-content {
      padding: 1.5rem;
    }
  }
  @media (max-width: 767px) {
    .table-wrap {
      display: none;
    }
    .card-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .report-card {
      background: var(--apex-surface);
      border: 1px solid var(--apex-border);
      border-radius: 0.7rem;
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
      padding: 0.8rem;
    }
    .card-heading,
    .card-footer {
      align-items: center;
      display: flex;
      gap: 0.55rem;
      justify-content: space-between;
    }
    .card-heading {
      color: var(--apex-text-muted);
      font-size: 0.8rem;
      justify-content: flex-start;
    }
    .card-footer {
      color: var(--apex-text-dim);
      font-size: 0.73rem;
    }
    .reporter {
      color: var(--apex-text-muted);
      font-size: 0.8rem;
      margin: 0;
    }
  }
</style>
