<script lang="ts">
  import { createQuery } from '@tanstack/svelte-query';
  import { legalStatusQueryOptions } from '$lib/queries/legal';
  import { hasLegalDocuments, markLegalReacceptanceRequired } from '$lib/stores/legal';
  import type { LegalDocType } from '$lib/api/legal';
  import { formatDate, formatLegalVersion } from '$lib/utils/format';
  import { ROUTES } from '$lib/utils/routes';
  import * as m from '$paraglide/messages';

  let { oncloseaccount }: { oncloseaccount: () => void } = $props();

  const statusQuery = createQuery(() => legalStatusQueryOptions());

  function documentHref(type: LegalDocType, version: string): string {
    return `${type === 'privacy' ? ROUTES.privacy : ROUTES.terms}?version=${encodeURIComponent(version)}`;
  }

  function labelFor(type: LegalDocType): string {
    if (type === 'terms') return m.legal_document_terms();
    if (type === 'privacy') return m.legal_document_privacy();
    return m.legal_document_sensitive_data_consent();
  }
</script>

{#if $hasLegalDocuments && statusQuery.isSuccess}
  <section class="legal-section" aria-labelledby="profile-legal-title">
    <p id="profile-legal-title" class="section-header">{m.legal_profile_title()}</p>
    <div class="documents">
      {#each statusQuery.data.documents as document (document.doc_type)}
        <div class="document">
          <div>
            <p class="document-name">{labelFor(document.doc_type)}</p>
            {#if document.accepted_version}
              <p class="document-meta">
                {m.legal_profile_accepted_version({
                  version: formatLegalVersion(document.accepted_version),
                })}
              </p>
              {#if document.accepted_at}
                <p class="document-meta">
                  {m.legal_profile_accepted_at({ date: formatDate(document.accepted_at) })}
                </p>
              {/if}
            {:else}
              <p class="document-meta">{m.legal_profile_not_accepted()}</p>
            {/if}
          </div>
          {#if document.accepted_version}
            <a
              href={documentHref(document.doc_type, document.accepted_version)}
              target="_blank"
              rel="noopener noreferrer">{m.legal_read()}</a
            >
          {/if}
        </div>
      {/each}
    </div>

    {#if !statusQuery.data.all_satisfied}
      <button class="review-btn" type="button" onclick={markLegalReacceptanceRequired}>
        {m.legal_profile_review()}
      </button>
    {/if}

    <p class="withdrawal-note">
      {m.legal_withdrawal_note()}
      <button type="button" onclick={oncloseaccount}>{m.legal_close_account()}</button>
    </p>
  </section>
{/if}

<style>
  .legal-section {
    margin-top: 1.5rem;
  }

  .section-header {
    color: var(--apex-text-muted);
    font-size: 0.69rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    margin: 0 0 0.85rem;
    text-transform: uppercase;
  }

  .documents {
    background: var(--apex-surface);
    border: 1px solid var(--apex-border);
    border-radius: 0.65rem;
  }

  .document {
    align-items: center;
    display: flex;
    gap: 1rem;
    justify-content: space-between;
    padding: 0.8rem;
  }

  .document + .document {
    border-top: 1px solid var(--apex-border);
  }

  .document-name,
  .document-meta,
  .withdrawal-note {
    margin: 0;
  }

  .document-name {
    color: var(--apex-text);
    font-size: 0.86rem;
    font-weight: 600;
  }

  .document-meta,
  .withdrawal-note {
    color: var(--apex-text-muted);
    font-size: 0.78rem;
    line-height: 1.45;
  }

  a {
    color: var(--apex-accent);
    font-size: 0.8rem;
    font-weight: 600;
  }

  .review-btn {
    background: var(--apex-accent);
    border: 0;
    border-radius: 0.5rem;
    color: white;
    cursor: pointer;
    font: inherit;
    font-size: 0.85rem;
    font-weight: 600;
    margin-top: 0.75rem;
    padding: 0.6rem 0.8rem;
  }

  .withdrawal-note {
    margin-top: 0.75rem;
  }

  .withdrawal-note button {
    background: transparent;
    border: 0;
    color: var(--apex-accent);
    cursor: pointer;
    font: inherit;
    font-size: inherit;
    font-weight: 600;
    margin-left: 0.25rem;
    padding: 0;
  }
</style>
