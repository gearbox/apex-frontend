<script lang="ts">
  import { createQuery, useQueryClient } from '@tanstack/svelte-query';
  import { goto } from '$app/navigation';
  import { onMount, tick } from 'svelte';
  import { acceptLegal, toAcceptedDocuments, type LegalDocType } from '$lib/api/legal';
  import { silentRefresh, logout, type SilentRefreshResult } from '$lib/api/auth';
  import { ApiRequestError } from '$lib/api/errors';
  import { currentLegalQueryOptions, legalStatusQueryOptions } from '$lib/queries/legal';
  import { createExactDocuments } from '$lib/legal/exactDocuments.svelte';
  import { clearLegalReacceptance } from '$lib/stores/legal';
  import { addToast } from '$lib/stores/toasts';
  import { legalDocumentHref } from '$lib/utils/routes';
  import LegalAcceptanceFields from '$lib/components/legal/LegalAcceptanceFields.svelte';
  import DeleteAccountModal from '$lib/components/profile/DeleteAccountModal.svelte';
  import * as m from '$paraglide/messages';

  type Completion = 'idle' | 'refreshing' | 'failed';
  type RefreshFailureReason = Extract<SilentRefreshResult, { ok: false }>['reason'];

  const queryClient = useQueryClient();
  // A blocker must never act on cached data from an earlier screen (for example the profile).
  const currentQuery = createQuery(() => ({
    ...currentLegalQueryOptions(),
    refetchOnMount: 'always' as const,
  }));
  const statusQuery = createQuery(() => ({
    ...legalStatusQueryOptions(),
    refetchOnMount: 'always' as const,
  }));
  let fields = $state<LegalAcceptanceFields>();
  let valid = $state(false);
  const exactDocuments = createExactDocuments(() => currentQuery.data, {
    queryClient,
    // Ticks given for an earlier set must never be submitted as acceptance of a new one.
    onPayloadChange: () => {
      fields?.reset();
      valid = false;
    },
  });
  let submitting = $state(false);
  let error = $state('');
  let completion = $state<Completion>('idle');
  let showDeleteAccount = $state(false);
  let card = $state<HTMLDivElement>();
  let closeAccountButton = $state<HTMLButtonElement>();

  let current = $derived(currentQuery.data ?? []);
  let settled = $derived(!currentQuery.isFetching && !statusQuery.isFetching);
  /**
   * The API records an acceptance for every submitted version the user has not accepted yet, so
   * every such document must be displayed and ticked — not only the unsatisfied ones. A document
   * already accepted at its current version is still submitted, and the backend skips it.
   */
  let toShow = $derived.by((): LegalDocType[] => {
    const statuses = statusQuery.data?.documents ?? [];
    return current
      .filter((document) => {
        const status = statuses.find((item) => item.doc_type === document.doc_type);
        return (
          status?.accepted_version !== document.version ||
          status.accepted_version !== status.current_version
        );
      })
      .map((document) => document.doc_type);
  });
  /** Only a status fetched by this blocker, and not being replaced, may dismiss it. */
  let freshlyAllSatisfied = $derived(
    statusQuery.isFetchedAfterMount && !statusQuery.isFetching && statusQuery.data?.all_satisfied,
  );
  // Defensive: an unsatisfied set with nothing to show would otherwise offer a blind Accept.
  let nothingToShow = $derived(
    settled &&
      exactDocuments.ready &&
      statusQuery.data?.all_satisfied === false &&
      toShow.length === 0,
  );
  let hasLoadError = $derived(
    currentQuery.isError || statusQuery.isError || exactDocuments.error || nothingToShow,
  );
  let readyToAccept = $derived(
    !submitting &&
      exactDocuments.ready &&
      valid &&
      !currentQuery.isPending &&
      !statusQuery.isPending &&
      settled &&
      completion === 'idle' &&
      toShow.length > 0,
  );

  onMount(() => {
    void tick().then(() => card?.focus());
  });

  /** Keep focus inside this non-dismissible, blocking dialog. Escape intentionally does nothing. */
  function trapFocus(event: KeyboardEvent) {
    // The deletion dialog replaces this one and owns the keyboard while it is open.
    if (showDeleteAccount || event.key !== 'Tab' || !card) return;
    const focusable = Array.from(
      card.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => !element.hasAttribute('hidden'));
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  /**
   * Shared by a successful `acceptLegal` and by the all-satisfied shortcut. A retry after a failed
   * refresh re-enters here only, so an acceptance is never submitted twice.
   */
  async function finishAcceptance(): Promise<void> {
    completion = 'refreshing';
    const refreshed = await silentRefresh();
    if (refreshed.ok) {
      clearLegalReacceptance();
      await queryClient.invalidateQueries();
      addToast({ type: 'success', message: m.legal_reaccept_success() });
      return;
    }
    handleRefreshFailure(refreshed.reason);
  }

  function handleRefreshFailure(reason: RefreshFailureReason): void {
    switch (reason) {
      // Transient, or a superseded refresh that did not end the session: retry, never hang.
      case 'network':
      case 'stale':
      case 'aborted':
        completion = 'failed';
        return;
      // silentRefresh has already cleared auth; the (app) guard logs out and unmounts this.
      case 'invalid_token':
      case 'token_reuse_detected':
      case 'account_inactive':
        return;
      default: {
        const unhandled: never = reason;
        throw new Error(`Unhandled refresh failure: ${String(unhandled)}`);
      }
    }
  }

  $effect(() => {
    if (completion === 'idle' && freshlyAllSatisfied) void finishAcceptance();
  });

  async function refreshDocuments() {
    fields?.reset();
    valid = false;
    error = '';
    await Promise.all([currentQuery.refetch(), statusQuery.refetch()]);
    await exactDocuments.reload();
  }

  async function handleAccept() {
    if (!readyToAccept) return;
    error = '';
    submitting = true;
    try {
      // The API requires every current document, including one that was already satisfied.
      await acceptLegal(toAcceptedDocuments(current));
    } catch (caught) {
      submitting = false;
      if (caught instanceof ApiRequestError) {
        if (caught.error === 'legal_version_stale') {
          error = m.legal_version_stale();
          await refreshDocuments();
          return;
        }
        // The standard 401 retry path owns account-inactive logout/notice handling.
        if (caught.error === 'account_inactive' || caught.error === 'legal_acceptance_required')
          return;
      }
      error = caught instanceof Error ? caught.message : m.legal_reaccept_error();
      return;
    }
    try {
      await finishAcceptance();
    } finally {
      submitting = false;
    }
  }

  async function handleLogout() {
    await logout();
    goto('/login', { replaceState: true });
  }

  async function closeDeleteAccount() {
    showDeleteAccount = false;
    await tick();
    (closeAccountButton ?? card)?.focus();
  }

  function labelFor(type: LegalDocType): string {
    if (type === 'terms') return m.legal_document_terms();
    if (type === 'privacy') return m.legal_document_privacy();
    return m.legal_document_sensitive_data_consent();
  }
</script>

{#if showDeleteAccount}
  <!-- Replaces the blocker rather than stacking: one dialog, one focus owner. The legal store
       stays set, so cancelling returns here and a successful deletion logs out. -->
  <DeleteAccountModal onclose={closeDeleteAccount} />
{:else}
  <div class="overlay" role="presentation" onkeydown={trapFocus}>
    <div
      bind:this={card}
      class="modal-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-reaccept-title"
      tabindex="-1"
    >
      <h2 id="legal-reaccept-title">{m.legal_reaccept_title()}</h2>
      <p class="description">{m.legal_reaccept_description()}</p>

      {#if completion === 'failed'}
        <div class="error-state">
          <p>{m.legal_reaccept_refresh_failed()}</p>
          <button type="button" class="secondary-btn" onclick={finishAcceptance}
            >{m.common_retry()}</button
          >
        </div>
      {:else if completion === 'refreshing'}
        <p class="loading-copy">{m.common_loading()}</p>
      {:else if hasLoadError}
        <div class="error-state">
          <p>{m.legal_documents_load_error()}</p>
          <button type="button" class="secondary-btn" onclick={refreshDocuments}
            >{m.common_retry()}</button
          >
        </div>
      {:else if currentQuery.isPending || statusQuery.isPending || !exactDocuments.ready}
        <p class="loading-copy">{m.legal_documents_loading()}</p>
      {:else if statusQuery.data?.all_satisfied}
        <p class="loading-copy">{m.common_loading()}</p>
      {:else}
        <div class="documents-list">
          {#each toShow as type (type)}
            {@const document = current.find((item) => item.doc_type === type)}
            {#if document}
              <div class="document-row">
                <span>{labelFor(type)}</span>
                <a
                  href={legalDocumentHref(type, document.version)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {m.legal_read()}
                </a>
              </div>
            {/if}
          {/each}
        </div>

        <LegalAcceptanceFields bind:this={fields} {current} only={toShow} bind:valid />

        {#if error}
          <p class="error-copy">{error}</p>
        {/if}

        <button type="button" class="primary-btn" onclick={handleAccept} disabled={!readyToAccept}>
          {submitting ? m.legal_reaccept_accepting() : m.legal_reaccept_accept()}
        </button>
      {/if}

      <div class="secondary-actions">
        <button type="button" class="secondary-btn" onclick={handleLogout}
          >{m.profile_logout()}</button
        >
        <button
          bind:this={closeAccountButton}
          type="button"
          class="danger-btn"
          onclick={() => (showDeleteAccount = true)}
        >
          {m.legal_close_account()}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    align-items: center;
    backdrop-filter: blur(4px);
    background: rgba(0, 0, 0, 0.58);
    display: flex;
    inset: 0;
    justify-content: center;
    padding: 1rem;
    position: fixed;
    z-index: 300;
  }

  .modal-card {
    background: var(--apex-surface);
    border: 1px solid var(--apex-border);
    border-radius: 1rem;
    box-shadow: 0 1.5rem 4rem rgb(0 0 0 / 30%);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    max-height: min(46rem, calc(100dvh - 2rem));
    max-width: 36rem;
    overflow-y: auto;
    padding: clamp(1.25rem, 5vw, 2rem);
    width: 100%;
  }

  h2 {
    color: var(--apex-text);
    font-size: 1.25rem;
    margin: 0;
  }

  .description,
  .loading-copy {
    color: var(--apex-text-muted);
    line-height: 1.5;
    margin: 0;
  }

  .documents-list {
    border-bottom: 1px solid var(--apex-border);
    border-top: 1px solid var(--apex-border);
    display: flex;
    flex-direction: column;
  }

  .document-row {
    align-items: center;
    color: var(--apex-text);
    display: flex;
    font-size: 0.9rem;
    justify-content: space-between;
    padding: 0.7rem 0;
  }

  .document-row + .document-row {
    border-top: 1px solid var(--apex-border);
  }

  a {
    color: var(--apex-accent);
    font-size: 0.85rem;
    font-weight: 600;
  }

  .primary-btn,
  .secondary-btn,
  .danger-btn {
    border-radius: 0.55rem;
    cursor: pointer;
    font: inherit;
    font-size: 0.88rem;
    font-weight: 600;
    padding: 0.65rem 0.85rem;
  }

  .primary-btn {
    background: var(--apex-accent);
    border: 0;
    color: white;
  }

  .primary-btn:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .secondary-actions {
    display: flex;
    gap: 0.65rem;
    justify-content: space-between;
  }

  .secondary-btn,
  .danger-btn {
    background: transparent;
    border: 1px solid var(--apex-border);
    color: var(--apex-text-muted);
  }

  .danger-btn {
    color: var(--apex-danger);
  }

  .error-state {
    background: color-mix(in srgb, var(--apex-danger) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--apex-danger) 30%, transparent);
    border-radius: 0.55rem;
    color: var(--apex-danger);
    padding: 0.8rem;
  }

  .error-state p,
  .error-copy {
    margin: 0 0 0.6rem;
  }

  .error-copy {
    color: var(--apex-danger);
    font-size: 0.85rem;
  }
</style>
