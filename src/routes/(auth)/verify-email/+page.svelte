<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { replaceState } from '$app/navigation';
  import { verifyEmail, AuthError } from '$lib/api/auth';
  import { fetchCurrentUserProfile } from '$lib/api/user';
  import { getCurrentUser, setUser } from '$lib/stores/auth';
  import { appDisplayName } from '$lib/stores/product';
  import Spinner from '$lib/components/ui/Spinner.svelte';
  import * as m from '$paraglide/messages';

  let status = $state<'verifying' | 'success' | 'error'>('verifying');
  let error = $state('');

  onMount(async () => {
    const token = $page.url.searchParams.get('token');
    if ($page.url.searchParams.has('token')) {
      const url = new URL($page.url);
      url.searchParams.delete('token');
      const state = $page.state;
      await Promise.resolve();
      replaceState(url, state);
    }
    if (!token) {
      error = m.auth_verify_missing();
      status = 'error';
      return;
    }

    try {
      await verifyEmail(token);
      if (getCurrentUser()) {
        try {
          setUser(await fetchCurrentUserProfile());
        } catch {
          // Verification succeeded; the profile can refresh when the user returns to it.
        }
      }
      status = 'success';
    } catch (err) {
      error =
        err instanceof AuthError && err.error === 'invalid_token'
          ? m.auth_verify_invalid()
          : m.error_generic();
      status = 'error';
    }
  });
</script>

<svelte:head>
  <title>{m.auth_verify_title()} — {$appDisplayName}</title>
</svelte:head>

<div class="mx-auto w-full max-w-sm text-center">
  <h1 class="mb-4 text-2xl font-bold text-accent">{$appDisplayName}</h1>

  {#if status === 'verifying'}
    <div class="flex flex-col items-center gap-3">
      <Spinner size="lg" />
      <p class="text-sm text-text-muted">{m.auth_verify_verifying()}</p>
    </div>
  {:else if status === 'success'}
    <div class="rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
      {m.auth_verify_success()}
    </div>
    <p class="mt-4 text-sm text-text-muted">
      <a href="/login" class="font-medium text-accent hover:underline">{m.auth_verify_continue()}</a
      >
    </p>
  {:else}
    <div class="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
      {error}
    </div>
    <p class="mt-4 text-sm text-text-muted">
      <a href="/login" class="font-medium text-accent hover:underline">{m.auth_forgot_back()}</a>
    </p>
  {/if}
</div>
