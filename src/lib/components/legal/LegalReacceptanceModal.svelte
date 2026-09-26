<script lang="ts">
  import { createQuery, useQueryClient } from '@tanstack/svelte-query';
  import { goto } from '$app/navigation';
  import { onMount, tick } from 'svelte';
  import { acceptLegal, toAcceptedDocuments, type LegalDocType } from '$lib/api/legal';
  import { silentRefresh, logout } from '$lib/api/auth';
  import { ApiRequestError } from '$lib/api/errors';
  import {
    currentLegalQueryOptions,
    legalDocumentQueryOptions,
    legalStatusQueryOptions,
  } from '$lib/queries/legal';
  import { resetLegalState } from '$lib/stores/legal';
  import { addToast } from '$lib/stores/toasts';
  import { ROUTES } from '$lib/utils/routes';
  import LegalAcceptanceFields from '$lib/components/legal/LegalAcceptanceFields.svelte';
  import DeleteAccountModal from '$lib/components/profile/DeleteAccountModal.svelte';
  import * as m from '$paraglide/messages';

  const queryClient = useQueryClient();
  const currentQuery = createQuery(() => currentLegalQueryOptions());
  const statusQuery = createQuery(() => legalStatusQueryOptions());

  let fields = $state<LegalAcceptanceFields>();
  let valid = $state(false);
  let exactDocumentsReady = $state(false);
  let exactDocumentsError = $state(false);
  let submitting = $state(false);
  let error = $state('');
  let showDeleteAccount = $state(false);
  let card = $state<HTMLDivElement>();
  let allSatisfiedRefreshStarted = false;

  let current = $derived(currentQuery.data ?? []);
  let unsatisfied = $derived(
    statusQuery.data?.documents
      .filter((document) => !document.satisfied)
      .map((document) => document.doc_type) ?? [],
  );
  let hasLoadError = $derived(currentQuery.isError || statusQuery.isError || exactDocumentsError);
  let readyToAccept = $derived(
    !submitting &&
      exactDocumentsReady &&
      valid &&
      !currentQuery.isPending &&
      !statusQuery.isPending,
  );

  onMount(() => {
    void tick().then(() => card?.focus());
  });

  /** Keep focus inside this non-dismissible, blocking dialog. Escape intentionally does nothing. */
  function trapFocus(event: KeyboardEvent) {
    if (event.key !== 'Tab' || !card) return;
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

  async function loadExactDocuments() {
    const documents = currentQuery.data;
    if (!documents) return;
    exactDocumentsReady = false;
    exactDocumentsError = false;
    try {
      await Promise.all(
        documents.map((document) =>
          queryClient.fetchQuery(legalDocumentQueryOptions(document.doc_type, document.version)),
        ),
      );
      if (documents === currentQuery.data) exactDocumentsReady = true;
    } catch {
      if (documents === currentQuery.data) exactDocumentsError = true;
    }
  }

  $effect(() => {
    if (currentQuery.data) void loadExactDocuments();
  });

  async function finishAcceptance(): Promise<void> {
    const refreshed = await silentRefresh();
    if (!refreshed.ok) return;
    resetLegalState();
    await queryClient.invalidateQueries();
    addToast({ type: 'success', message: m.legal_reaccept_success() });
  }

  $effect(() => {
    if (!statusQuery.data?.all_satisfied || allSatisfiedRefreshStarted) return;
    allSatisfiedRefreshStarted = true;
    void finishAcceptance();
  });

  async function refreshDocuments() {
    fields?.reset();
    valid = false;
    error = '';
    exactDocumentsReady = false;
    exactDocumentsError = false;
    await Promise.all([currentQuery.refetch(), statusQuery.refetch()]);
  }

  async function handleAccept() {
    if (!readyToAccept) return;
    error = '';
    submitting = true;
    try {
      // The API requires every current document, including one that was already satisfied.
      await acceptLegal(toAcceptedDocuments(current));
      await finishAcceptance();
    } catch (caught) {
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
    } finally {
      submitting = false;
    }
  }

  async function handleLogout() {
    await logout();
    goto('/login', { replaceState: true });
  }

  function documentHref(type: LegalDocType, version: string): string {
    const route = type === 'privacy' ? ROUTES.privacy : ROUTES.terms;
    return `${route}?version=${encodeURIComponent(version)}`;
  }

  function labelFor(type: LegalDocType): string {
    if (type === 'terms') return m.legal_document_terms();
    if (type === 'privacy') return m.legal_document_privacy();
    return m.legal_document_sensitive_data_consent();
  }
</script>

<svelte:window onkeydown={trapFocus} />

<div class="overlay" role="presentation">
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

    {#if hasLoadError}
      <div class="error-state">
        <p>{m.legal_documents_load_error()}</p>
        <button type="button" class="secondary-btn" onclick={refreshDocuments}
          >{m.common_retry()}</button
        >
      </div>
    {:else if currentQuery.isPending || statusQuery.isPending || !exactDocumentsReady}
      <p class="loading-copy">{m.legal_documents_loading()}</p>
    {:else if statusQuery.data?.all_satisfied}
      <p class="loading-copy">{m.common_loading()}</p>
    {:else}
      <div class="documents-list">
        {#each unsatisfied as type (type)}
          {@const document = current.find((item) => item.doc_type === type)}
          {#if document}
            <div class="document-row">
              <span>{labelFor(type)}</span>
              <a
                href={documentHref(type, document.version)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {m.legal_read()}
              </a>
            </div>
          {/if}
        {/each}
      </div>

      <LegalAcceptanceFields bind:this={fields} {current} only={unsatisfied} bind:valid />

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
      <button type="button" class="danger-btn" onclick={() => (showDeleteAccount = true)}>
        {m.legal_close_account()}
      </button>
    </div>
  </div>
</div>

{#if showDeleteAccount}
  <DeleteAccountModal onclose={() => (showDeleteAccount = false)} />
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
