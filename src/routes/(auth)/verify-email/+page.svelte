<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { verifyEmail, AuthError } from '$lib/api/auth';

  let status = $state<'verifying' | 'success' | 'error'>('verifying');
  let error = $state('');

  onMount(async () => {
    const token = $page.url.searchParams.get('token');
    if (!token) {
      error = 'Missing verification token.';
      status = 'error';
      return;
    }

    try {
      await verifyEmail(token);
      status = 'success';
    } catch (err) {
      error = err instanceof AuthError ? err.message : 'Verification failed.';
      status = 'error';
    }
  });
</script>

<svelte:head>
  <title>Verify Email — Apex</title>
</svelte:head>

<div class="flex min-h-[100dvh] items-center justify-center bg-bg px-4">
  <div class="w-full max-w-sm text-center">
    <h1 class="mb-4 text-2xl font-bold text-accent">apex</h1>

    {#if status === 'verifying'}
      <div class="flex flex-col items-center gap-3">
        <div class="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent"></div>
        <p class="text-sm text-text-muted">Verifying your email…</p>
      </div>
    {:else if status === 'success'}
      <div class="rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
        Email verified successfully!
      </div>
      <p class="mt-4 text-sm text-text-muted">
        <a href="/login" class="font-medium text-accent hover:underline">Continue to sign in</a>
      </p>
    {:else}
      <div class="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
        {error}
      </div>
      <p class="mt-4 text-sm text-text-muted">
        <a href="/login" class="font-medium text-accent hover:underline">Back to sign in</a>
      </p>
    {/if}
  </div>
</div>
