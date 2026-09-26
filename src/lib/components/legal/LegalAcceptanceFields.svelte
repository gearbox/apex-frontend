<script lang="ts">
  import { createQuery } from '@tanstack/svelte-query';
  import { legalDocumentHref } from '$lib/utils/routes';
  import { legalDocumentQueryOptions } from '$lib/queries/legal';
  import type { LegalDocType, LegalDocumentMeta } from '$lib/api/legal';
  import LegalMarkdown from '$lib/components/legal/LegalMarkdown.svelte';
  import * as m from '$paraglide/messages';

  interface Props {
    current: LegalDocumentMeta[];
    only?: LegalDocType[];
    valid?: boolean;
  }

  // eslint-disable-next-line no-useless-assignment -- $bindable initializes the caller-owned value.
  let { current, only, valid = $bindable(false) }: Props = $props();
  let agreedToTerms = $state(false);
  let agreedToSensitiveData = $state(false);

  let displayedDocuments = $derived(
    only ? current.filter((document) => only.includes(document.doc_type)) : current,
  );
  let termsDocument = $derived(
    displayedDocuments.find((document) => document.doc_type === 'terms'),
  );
  let privacyDocument = $derived(
    displayedDocuments.find((document) => document.doc_type === 'privacy'),
  );
  let sensitiveData = $derived(
    displayedDocuments.find((document) => document.doc_type === 'sensitive_data_consent'),
  );

  const consentQuery = createQuery(() => ({
    ...legalDocumentQueryOptions('sensitive_data_consent', sensitiveData?.version),
    enabled: Boolean(sensitiveData),
  }));

  $effect(() => {
    valid =
      ((!termsDocument && !privacyDocument) || agreedToTerms) &&
      (!sensitiveData || agreedToSensitiveData);
  });

  export function reset(): void {
    agreedToTerms = false;
    agreedToSensitiveData = false;
  }
</script>

<div class="legal-acceptance-fields">
  {#if termsDocument || privacyDocument}
    <label class="consent-row">
      <input type="checkbox" bind:checked={agreedToTerms} />
      <span>
        {m.legal_terms_accept_prefix()}
        {#if termsDocument}
          <a
            href={legalDocumentHref('terms', termsDocument.version)}
            target="_blank"
            rel="noopener noreferrer">{m.legal_document_terms()}</a
          >
        {/if}
        {#if privacyDocument}
          {#if termsDocument}{m.legal_terms_accept_and_read()}{/if}
          <a
            href={legalDocumentHref('privacy', privacyDocument.version)}
            target="_blank"
            rel="noopener noreferrer">{m.legal_document_privacy()}</a
          >
        {/if}
        {m.legal_terms_accept_suffix()}
      </span>
    </label>
  {/if}

  {#if sensitiveData}
    <label class="consent-row">
      <input type="checkbox" bind:checked={agreedToSensitiveData} />
      <span>{m.legal_sensitive_accept()}</span>
    </label>

    <details class="consent-disclosure">
      <summary>{m.legal_read_consent_statement()}</summary>
      {#if consentQuery.isPending}
        <p>{m.legal_document_loading()}</p>
      {:else if consentQuery.isError}
        <p class="error-copy">{m.legal_document_error()}</p>
        <button type="button" onclick={() => consentQuery.refetch()}>{m.common_retry()}</button>
      {:else if consentQuery.data}
        <p class="english-note">{m.legal_document_english_only()}</p>
        <LegalMarkdown markdown={consentQuery.data.content_md} />
      {/if}
    </details>
  {/if}
</div>

<style>
  .legal-acceptance-fields {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
  }

  .consent-row {
    align-items: flex-start;
    color: var(--apex-text-muted);
    cursor: pointer;
    display: flex;
    font-size: 0.82rem;
    gap: 0.6rem;
    line-height: 1.45;
  }

  .consent-row input {
    accent-color: var(--apex-accent);
    flex: 0 0 auto;
    height: 1rem;
    margin-top: 0.12rem;
    width: 1rem;
  }

  a,
  summary {
    color: var(--apex-accent);
  }

  .consent-disclosure {
    background: var(--apex-surface-hover);
    border-radius: 0.55rem;
    color: var(--apex-text-muted);
    font-size: 0.83rem;
    padding: 0.7rem 0.8rem;
  }

  summary {
    cursor: pointer;
    font-weight: 600;
  }

  .consent-disclosure :global(.legal-prose) {
    margin-top: 0.8rem;
  }

  .english-note {
    color: var(--apex-text-dim);
    font-size: 0.76rem;
    margin: 0.8rem 0 0;
  }

  .error-copy {
    color: var(--apex-danger);
  }

  button {
    background: transparent;
    border: 1px solid var(--apex-border);
    border-radius: 0.4rem;
    color: var(--apex-text);
    cursor: pointer;
    font: inherit;
    padding: 0.35rem 0.55rem;
  }
</style>
