<script lang="ts">
  import { goto } from '$app/navigation';
  import { register, AuthError } from '$lib/api/auth';
  import * as m from '$paraglide/messages';

  let email = $state('');
  let password = $state('');
  let displayName = $state('');
  let error = $state('');
  let loading = $state(false);

  async function handleSubmit(e: Event) {
    e.preventDefault();
    error = '';
    loading = true;

    try {
      await register(email, password, displayName || undefined);
      goto('/app/create', { replaceState: true });
    } catch (err) {
      if (err instanceof AuthError) {
        error = err.error === 'email_exists' ? 'An account with this email already exists.' : err.message;
      } else {
        error = m.error_generic();
      }
    } finally {
      loading = false;
    }
  }
</script>

<svelte:head>
  <title>Sign Up — Apex</title>
</svelte:head>

<div class="flex min-h-dvh items-center justify-center bg-bg px-4">
  <div class="w-full max-w-sm">
    <div class="mb-8 text-center">
      <h1 class="text-2xl font-bold text-accent">apex</h1>
      <p class="mt-2 text-sm text-text-muted">{m.auth_register_title()}</p>
    </div>

    <form onsubmit={handleSubmit} class="flex flex-col gap-4">
      {#if error}
        <div class="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      {/if}

      <label class="flex flex-col gap-1.5">
        <span class="text-sm font-medium text-text">{m.auth_register_display_name()}</span>
        <input
          type="text"
          bind:value={displayName}
          autocomplete="name"
          class="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-dim focus:border-accent focus:outline-none"
          placeholder="Jane Doe"
        />
      </label>

      <label class="flex flex-col gap-1.5">
        <span class="text-sm font-medium text-text">{m.auth_register_email()}</span>
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
        <span class="text-sm font-medium text-text">{m.auth_register_password()}</span>
        <input
          type="password"
          bind:value={password}
          required
          minlength={8}
          autocomplete="new-password"
          class="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-dim focus:border-accent focus:outline-none"
          placeholder="••••••••"
        />
      </label>

      <button
        type="submit"
        disabled={loading}
        class="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {loading ? m.auth_register_creating() : m.auth_register_submit()}
      </button>
    </form>

    <p class="mt-6 text-center text-sm text-text-muted">
      {m.auth_register_has_account()}
      <a href="/login" class="font-medium text-accent hover:underline">{m.auth_register_login()}</a>
    </p>
  </div>
</div>
