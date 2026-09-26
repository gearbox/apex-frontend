<script lang="ts">
  import { page } from '$app/state';
  import LegalDocumentView from '$lib/components/legal/LegalDocumentView.svelte';

  let version = $derived(page.url.searchParams.get('version') ?? undefined);
</script>

<svelte:head><title>Terms of Use</title></svelte:head>

<LegalDocumentView docType="terms" {version} />
