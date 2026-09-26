<script lang="ts">
  import { QueryClientProvider } from '@tanstack/svelte-query';
  import type { QueryClient } from '@tanstack/svelte-query';
  import LegalLayout from '../+layout.svelte';
  import LegalDocumentView from '$lib/components/legal/LegalDocumentView.svelte';

  let { queryClient }: { queryClient: QueryClient } = $props();
</script>

<QueryClientProvider client={queryClient}>
  <LegalLayout>
    <LegalDocumentView docType="terms" />
  </LegalLayout>
</QueryClientProvider>
