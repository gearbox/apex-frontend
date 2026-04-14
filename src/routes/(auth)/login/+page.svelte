<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { login, AuthError } from '$lib/api/auth';
  import { rateLimitFor } from '$lib/stores/rateLimit';
  import { locale } from '$lib/stores/locale';
  import { updateUserLocale } from '$lib/api/user';
  import * as m from '$paraglide/messages';

  let email = $state('');
  let password = $state('');
  let error = $state('');
  let loading = $state(false);

  const loginRateLimit = rateLimitFor('/v1/auth/login');

  async function handleSubmit(e: Event) {
    e.preventDefault();
    error = '';
    loading = true;

    try {
      await login(email, password);
      // Fire-and-forget locale sync — never blocks login flow
      void (async () => {
        try {
          await updateUserLocale($locale);
        } catch {
          // silently swallow — locale sync is best-effort
        }
      })();
      const redirect = $page.url.searchParams.get('redirect') ?? '/app/create';
      goto(redirect, { replaceState: true });
    } catch (err) {
      if (err instanceof AuthError) {
        error = err.message;
      } else {
        error = m.error_generic();
      }
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Login — Vex.pics</title>
</svelte:head>

<div class="flex min-h-dvh items-center justify-center bg-bg px-4">
  <div class="w-full max-w-sm">
    <div class="mb-8 text-center">
      <h1 class="text-2xl font-bold text-accent">Vex.pics</h1>
      <p class="mt-2 text-sm text-text-muted">{m.auth_login_subtitle()}</p>
    </div>

    <form onsubmit={handleSubmit} class="flex flex-col gap-4">
      {#if error}
        <div class="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      {/if}

      {#if $loginRateLimit?.remaining !== undefined && $loginRateLimit.remaining <= 3}
        <div class="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
          {m.auth_login_attempts_remaining({ remaining: $loginRateLimit.remaining })}
        </div>
      {/if}

      <label class="flex flex-col gap-1.5">
        <span class="text-sm font-medium text-text">{m.auth_login_email()}</span>
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
        <span class="text-sm font-medium text-text">{m.auth_login_password()}</span>
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
          {m.auth_login_forgot()}
        </a>
      </div>

      <button
        type="submit"
        disabled={loading}
        class="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {loading ? m.auth_login_signing_in() : m.auth_login_submit()}
      </button>
    </form>

    <p class="mt-6 text-center text-sm text-text-muted">
      {m.auth_login_no_account()}
      <a href="/register" class="font-medium text-accent hover:underline">{m.auth_login_register()}</a>
    </p>
  </div>
</div>
