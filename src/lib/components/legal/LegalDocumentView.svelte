<script lang="ts">
  import { createQuery } from '@tanstack/svelte-query';
  import LegalMarkdown from '$lib/components/legal/LegalMarkdown.svelte';
  import { legalDocumentQueryOptions } from '$lib/queries/legal';
  import type { LegalDocType } from '$lib/api/legal';
  import { formatLegalVersion } from '$lib/utils/format';
  import * as m from '$paraglide/messages';

  let { docType, version }: { docType: LegalDocType; version?: string } = $props();

  const titleFor: Record<LegalDocType, () => string> = {
    terms: m.legal_document_terms,
    privacy: m.legal_document_privacy,
    sensitive_data_consent: m.legal_document_sensitive_data_consent,
  };

  const documentQuery = createQuery(() => legalDocumentQueryOptions(docType, version));
</script>

<section aria-labelledby="legal-document-title">
  <h1 id="legal-document-title">{titleFor[docType]()}</h1>

  {#if documentQuery.isPending}
    <p class="state-copy">{m.legal_document_loading()}</p>
  {:else if documentQuery.isError}
    <div class="error-state">
      <p>{m.legal_document_error()}</p>
      <button type="button" onclick={() => documentQuery.refetch()}>{m.common_retry()}</button>
    </div>
  {:else if documentQuery.data}
    <p class="effective-date">
      {m.legal_document_effective({ date: formatLegalVersion(documentQuery.data.version) })}
    </p>
    <p class="english-note">{m.legal_document_english_only()}</p>
    <LegalMarkdown markdown={documentQuery.data.content_md} />
  {/if}
</section>

<style>
  h1 {
    color: var(--apex-text);
    font-size: clamp(1.55rem, 4vw, 2rem);
    line-height: 1.2;
    margin: 0;
  }

  .effective-date {
    color: var(--apex-text-muted);
    font-size: 0.9rem;
    margin: 0.65rem 0 0;
  }

  .english-note {
    background: var(--apex-accent-glow);
    border-radius: 0.55rem;
    color: var(--apex-text-muted);
    font-size: 0.85rem;
    margin: 1.25rem 0 1.8rem;
    padding: 0.65rem 0.8rem;
  }

  .state-copy,
  .error-state {
    color: var(--apex-text-muted);
    margin-top: 2rem;
  }

  .error-state {
    align-items: flex-start;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  button {
    background: var(--apex-surface);
    border: 1px solid var(--apex-border);
    border-radius: 0.5rem;
    color: var(--apex-text);
    cursor: pointer;
    font: inherit;
    padding: 0.5rem 0.8rem;
  }
</style>
