<script lang="ts">
  import { afterNavigate, goto, replaceState } from '$app/navigation';
  import { page } from '$app/stores';
  import { resetPassword, AuthError } from '$lib/api/auth';
  import { clearAuth } from '$lib/stores/auth';
  import { appDisplayName } from '$lib/stores/product';
  import { withoutSearchParam } from '$lib/utils/urlSearch';
  import * as m from '$paraglide/messages';

  let token = $state<string | null>(null);
  let ready = $state(false);
  let invalid = $state(false);
  let newPassword = $state('');
  let confirmPassword = $state('');
  let pending = $state(false);
  let error = $state('');
  let canSubmit = $derived(
    ready &&
      !!token &&
      newPassword.length >= 8 &&
      newPassword.length <= 128 &&
      newPassword === confirmPassword &&
      !pending,
  );

  // SvelteKit's router root is unavailable during the initial onMount.
  // Consume entry parameters once, after router initialization.
  let initialized = false;
  afterNavigate(() => {
    if (initialized) return;
    initialized = true;
    token = $page.url.searchParams.get('token');
    if ($page.url.searchParams.has('token')) {
      replaceState(withoutSearchParam($page.url, 'token'), $page.state);
    }
    invalid = !token;
    ready = true;
  });

  async function handleSubmit(event: Event) {
    event.preventDefault();
    if (!canSubmit || !token) return;
    pending = true;
    error = '';
    try {
      await resetPassword(token, newPassword);
      token = null;
      clearAuth();
      await goto('/login?reset=done', { replaceState: true });
    } catch (err) {
      if (err instanceof AuthError && err.status === 400 && err.error === 'invalid_token') {
        invalid = true;
        token = null;
      } else {
        error =
          err instanceof AuthError && err.status === 429
            ? m.error_rate_limited()
            : m.error_generic();
      }
    } finally {
      pending = false;
    }
  }
</script>

<svelte:head><title>{m.auth_reset_title()} — {$appDisplayName}</title></svelte:head>

<div class="mx-auto w-full max-w-sm">
  <div class="mb-8 text-center">
    <h1 class="text-2xl font-bold text-accent">{$appDisplayName}</h1>
    <p class="mt-2 text-sm text-text-muted">{m.auth_reset_title()}</p>
  </div>

  {#if ready && invalid}
    <div
      class="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger"
      role="alert"
    >
      {m.auth_reset_invalid()}
    </div>
    <a
      href="/forgot-password"
      class="mt-4 block text-center text-sm font-medium text-accent hover:underline"
    >
      {m.auth_reset_request_new()}
    </a>
  {:else if ready}
    <form onsubmit={handleSubmit} class="flex flex-col gap-4">
      {#if error}<div
          role="alert"
          class="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {error}
        </div>{/if}
      <label class="flex flex-col gap-1.5">
        <span class="text-sm font-medium text-text">{m.profile_change_password_new()}</span>
        <input
          type="password"
          bind:value={newPassword}
          autocomplete="new-password"
          minlength="8"
          required
          class="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
        />
      </label>
      {#if newPassword.length > 0 && newPassword.length < 8}<p class="text-sm text-danger">
          {m.profile_change_password_too_short()}
        </p>{/if}
      {#if newPassword.length > 128}<p class="text-sm text-danger">
          {m.auth_reset_too_long()}
        </p>{/if}
      <label class="flex flex-col gap-1.5">
        <span class="text-sm font-medium text-text">{m.profile_change_password_confirm()}</span>
        <input
          type="password"
          bind:value={confirmPassword}
          autocomplete="new-password"
          minlength="8"
          required
          class="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
        />
      </label>
      {#if confirmPassword && newPassword !== confirmPassword}<p class="text-sm text-danger">
          {m.profile_change_password_mismatch()}
        </p>{/if}
      <button
        type="submit"
        disabled={!canSubmit}
        class="rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {pending ? m.common_loading() : m.auth_reset_submit()}
      </button>
    </form>
  {/if}
</div>
