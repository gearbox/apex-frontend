<script lang="ts">
  import { untrack } from 'svelte';
  import AdminFeedbackDetailModal from '$lib/components/admin/AdminFeedbackDetailModal.svelte';
  import FeedbackDialog from '$lib/components/feedback/FeedbackDialog.svelte';
  import LegalReacceptanceModal from '$lib/components/legal/LegalReacceptanceModal.svelte';
  import { feedbackDialog } from '$lib/stores/feedbackDialog.svelte';
  import { legalReacceptanceRequired } from '$lib/stores/legal';

  let {
    adminVisible = false,
    reportId = '11111111-1111-4111-8111-111111111111',
  }: {
    adminVisible?: boolean;
    reportId?: string;
  } = $props();
  let showAdmin = $state(untrack(() => adminVisible));
</script>

{#if showAdmin}
  <AdminFeedbackDetailModal {reportId} onclose={() => (showAdmin = false)} />
{/if}
{#if $legalReacceptanceRequired}
  <LegalReacceptanceModal />
{/if}
{#if feedbackDialog.isOpen}
  <FeedbackDialog />
{/if}
