<script lang="ts">
  import { page } from '$app/state';
  import LegalDocumentView from '$lib/components/legal/LegalDocumentView.svelte';

  let version = $derived(page.url.searchParams.get('version') ?? undefined);
</script>

<svelte:head><title>Privacy Policy</title></svelte:head>

<LegalDocumentView docType="privacy" {version} />
