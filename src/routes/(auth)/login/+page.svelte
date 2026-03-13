<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { login, AuthError } from '$lib/api/auth';

  let email = $state('');
  let password = $state('');
  let error = $state('');
  let loading = $state(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    error = '';
    loading = true;

    try {
      await login(email, password);
      const redirect = $page.url.searchParams.get('redirect') ?? '/app/create';
      goto(redirect, { replaceState: true });
    } catch (err) {
      if (err instanceof AuthError) {
        error = err.message;
      } else {
        error = 'An unexpected error occurred. Please try again.';
      }
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Login — Apex</title>
</svelte:head>

<div class="flex min-h-dvh items-center justify-center bg-bg px-4">
  <div class="w-full max-w-sm">
    <div class="mb-8 text-center">
      <h1 class="text-2xl font-bold text-accent">apex</h1>
      <p class="mt-2 text-sm text-text-muted">Sign in to your account</p>
    </div>

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
          autocomplete="email"
          class="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-dim focus:border-accent focus:outline-none"
          placeholder="you@example.com"
        />
      </label>

      <label class="flex flex-col gap-1.5">
        <span class="text-sm font-medium text-text">Password</span>
        <input
          type="password"
          bind:value={password}
          required
          autocomplete="current-password"
          class="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-dim focus:border-accent focus:outline-none"
          placeholder="••••••••"
        />
      </label>

      <div class="flex justify-end">
        <a href="/forgot-password" class="text-xs text-accent hover:underline">
          Forgot password?
        </a>
      </div>

      <button
        type="submit"
        disabled={loading}
        class="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {loading ? 'Signing in…' : 'Sign In'}
      </button>
    </form>

    <p class="mt-6 text-center text-sm text-text-muted">
      Don't have an account?
      <a href="/register" class="font-medium text-accent hover:underline">Sign up</a>
    </p>
  </div>
</div>
