<script lang="ts">
  import { page } from '$app/stores';

  let jobId = $derived($page.params.id);
</script>

<svelte:head>
  <title>Job {jobId} — Apex</title>
</svelte:head>

<div class="mx-auto max-w-4xl p-4 md:p-6">
  <h1 class="mb-4 text-xl font-semibold text-text">Job Detail</h1>
  <p class="text-sm text-text-muted">Job ID: {jobId}</p>

  <div class="mt-4 flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface/50 py-16">
    <p class="text-sm text-text-dim">Job details coming in Phase 2</p>
  </div>
</div>
