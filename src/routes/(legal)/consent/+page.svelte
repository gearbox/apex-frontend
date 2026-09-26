<script lang="ts">
  import { page } from '$app/state';
  import LegalDocumentView from '$lib/components/legal/LegalDocumentView.svelte';
  import * as m from '$paraglide/messages';

  let version = $derived(page.url.searchParams.get('version') ?? undefined);
</script>

<svelte:head><title>{m.legal_document_sensitive_data_consent()}</title></svelte:head>

<LegalDocumentView docType="sensitive_data_consent" {version} />
