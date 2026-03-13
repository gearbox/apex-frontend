<script lang="ts">
  import { forgotPassword, AuthError } from '$lib/api/auth';

  let email = $state('');
  let error = $state('');
  let sent = $state(false);
  let loading = $state(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    error = '';
    loading = true;

    try {
      await forgotPassword(email);
      sent = true;
    } catch (err) {
      error = err instanceof AuthError ? err.message : 'Something went wrong. Please try again.';
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Forgot Password — Apex</title>
</svelte:head>

<div class="flex min-h-dvh items-center justify-center bg-bg px-4">
  <div class="w-full max-w-sm">
    <div class="mb-8 text-center">
      <h1 class="text-2xl font-bold text-accent">apex</h1>
      <p class="mt-2 text-sm text-text-muted">Reset your password</p>
    </div>

    {#if sent}
      <div class="rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
        If an account with that email exists, you'll receive a password reset link shortly.
      </div>
      <p class="mt-6 text-center text-sm text-text-muted">
        <a href="/login" class="font-medium text-accent hover:underline">Back to sign in</a>
      </p>
    {:else}
      <form onsubmit={handleSubmit} class="flex flex-col gap-4">
        {#if error}
          <div class="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        {/if}

        <label class="flex flex-col gap-1.5">
          <span class="text-sm font-medium text-text">Email</span>
          <input
            type="email"
            bind:value={email}
            required
            class="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-dim focus:border-accent focus:outline-none"
            placeholder="you@example.com"
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          class="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Sending…' : 'Send Reset Link'}
        </button>
      </form>

      <p class="mt-6 text-center text-sm text-text-muted">
        <a href="/login" class="font-medium text-accent hover:underline">Back to sign in</a>
      </p>
    {/if}
  </div>
</div>
